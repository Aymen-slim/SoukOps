import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { signProductPhoto, decodeImage, saveCatalogImage } from "@/lib/dashboard/catalog-images";
import { parseUuid, requireMerchant } from "@/lib/dashboard/guard";
import { isBlurry } from "@/lib/media/blur";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().min(1).max(60).optional(),
    priceMillimes: z.number().int().nonnegative().optional(),
    floorMillimes: z.number().int().nonnegative().optional(),
    stock: z.number().int().nonnegative().optional(),
    aiEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "empty" });

const imageSchema = z.object({
  cropBase64: z.string().min(32).max(12_000_000),
  originalBase64: z.string().min(32).max(12_000_000),
});

async function ownedProduct(id: string) {
  if (!parseUuid(id)) return { error: NextResponse.json({ error: "identifiant invalide" }, { status: 400 }) } as const;
  const gate = await requireMerchant();
  if ("error" in gate) return { error: gate.error } as const;
  const { data: product } = await gate.supabase
    .from("products")
    .select("id, name, category, category_phrase, price_millimes, floor_millimes, stock, ai_enabled")
    .eq("id", id)
    .eq("merchant_id", gate.merchant.id)
    .maybeSingle();
  if (!product) return { error: NextResponse.json({ error: "Product not found." }, { status: 404 }) } as const;
  return { gate, product } as const;
}

type IdContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: IdContext) {
  const { id } = await ctx.params;
  const found = await ownedProduct(id);
  if ("error" in found) return found.error;
  const { data: images } = await found.gate.supabase
    .from("product_images")
    .select("id, source_path, crop_path, is_primary")
    .eq("product_id", id)
    .eq("merchant_id", found.gate.merchant.id);
  const photos = await Promise.all(
    (images ?? []).map(async (image) => ({
      id: image.id as string,
      isPrimary: Boolean(image.is_primary),
      url: await signProductPhoto(
        found.gate.supabase,
        (image.source_path as string | null) ?? null,
        (image.crop_path as string | null) ?? null,
      ),
    })),
  );
  const product = found.product;
  return NextResponse.json({
    product: {
      id: product.id as string,
      name: product.name as string,
      category: ((product.category as string | null) || (product.category_phrase as string) || "General"),
      priceMillimes: product.price_millimes as number,
      floorMillimes: product.floor_millimes as number,
      stock: product.stock as number,
      aiEnabled: product.ai_enabled !== false,
      images: photos,
    },
  });
}

export async function PATCH(request: Request, ctx: IdContext) {
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  const found = await ownedProduct(id);
  if ("error" in found) return found.error;
  const nextPrice = parsed.data.priceMillimes ?? (found.product.price_millimes as number);
  const nextFloor = parsed.data.floorMillimes ?? (found.product.floor_millimes as number);
  if (nextFloor > nextPrice) {
    return NextResponse.json({ error: "The floor price cannot exceed the price." }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.category !== undefined) {
    update.category = parsed.data.category;
    update.category_phrase = parsed.data.category;
  }
  if (parsed.data.priceMillimes !== undefined) update.price_millimes = parsed.data.priceMillimes;
  if (parsed.data.floorMillimes !== undefined) update.floor_millimes = parsed.data.floorMillimes;
  if (parsed.data.stock !== undefined) update.stock = parsed.data.stock;
  if (parsed.data.aiEnabled !== undefined) update.ai_enabled = parsed.data.aiEnabled;
  const { error } = await found.gate.supabase.from("products").update(update).eq("id", id).eq("merchant_id", found.gate.merchant.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: IdContext) {
  const { id } = await ctx.params;
  const found = await ownedProduct(id);
  if ("error" in found) return found.error;
  const { error } = await found.gate.supabase.from("products").delete().eq("id", id).eq("merchant_id", found.gate.merchant.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, ctx: IdContext) {
  const { id } = await ctx.params;
  const parsed = imageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add a photo first." }, { status: 400 });
  const found = await ownedProduct(id);
  if ("error" in found) return found.error;
  const { count } = await found.gate.supabase
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);
  if ((count ?? 0) >= 6) return NextResponse.json({ error: "Six photos is the limit." }, { status: 400 });
  const original = decodeImage(parsed.data.originalBase64);
  const crop = decodeImage(parsed.data.cropBase64);
  try {
    await sharp(original).metadata();
    await sharp(crop).metadata();
  } catch {
    return NextResponse.json({ error: "Image illisible." }, { status: 400 });
  }
  if (await isBlurry(original)) {
    return NextResponse.json({ error: "Photo too blurry. Retake it closer, without moving." }, { status: 422 });
  }
  try {
    await saveCatalogImage({
      supabase: found.gate.supabase,
      merchantId: found.gate.merchant.id,
      productId: id,
      original,
      crop,
      primary: (count ?? 0) === 0,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save the photo" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
