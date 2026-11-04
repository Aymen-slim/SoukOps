import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { samPhrase, type SizePolicy } from "@/lib/domain/catalog-options";
import { signProductPhoto, decodeImage, saveCatalogImage } from "@/lib/dashboard/catalog-images";
import { parseUuid, requireMerchant } from "@/lib/dashboard/guard";
import { replaceProductOptions } from "@/lib/dashboard/product-options";
import { isBlurry } from "@/lib/media/blur";

const optionSchema = z.object({
  name: z.string().trim().min(1).max(40),
  values: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
});

const variantSchema = z.object({
  optionValues: z.record(z.string(), z.string()),
  stock: z.number().int().nonnegative(),
  priceMillimes: z.number().int().nonnegative().nullable().optional(),
  sku: z.string().trim().max(64).nullable().optional(),
});

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().min(1).max(60).optional(),
    productType: z.string().trim().max(60).optional(),
    description: z.string().trim().max(500).optional(),
    priceMillimes: z.number().int().nonnegative().optional(),
    floorMillimes: z.number().int().nonnegative().optional(),
    stock: z.number().int().nonnegative().optional(),
    aiEnabled: z.boolean().optional(),
    askSize: z.boolean().optional(),
    options: z.array(optionSchema).max(3).optional(),
    variants: z.array(variantSchema).max(50).optional(),
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
  const rich =
    "id, name, category, category_phrase, product_type, description, size_policy, price_millimes, floor_millimes, stock, ai_enabled";
  const plain = "id, name, category, category_phrase, price_millimes, floor_millimes, stock, ai_enabled";
  let { data: product, error } = await gate.supabase
    .from("products")
    .select(rich)
    .eq("id", id)
    .eq("merchant_id", gate.merchant.id)
    .maybeSingle();
  if (error && /product_type|size_policy|description/i.test(error.message)) {
    const retry = await gate.supabase
      .from("products")
      .select(plain)
      .eq("id", id)
      .eq("merchant_id", gate.merchant.id)
      .maybeSingle();
    product = retry.data as typeof product;
    error = retry.error;
  }
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) } as const;
  if (!product) return { error: NextResponse.json({ error: "Product not found." }, { status: 404 }) } as const;
  return { gate, product } as const;
}

type IdContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: IdContext) {
  const { id } = await ctx.params;
  const found = await ownedProduct(id);
  if ("error" in found) return found.error;
  const [{ data: images }, { data: optionRows }, { data: variantRows }] = await Promise.all([
    found.gate.supabase
      .from("product_images")
      .select("id, source_path, crop_path, is_primary")
      .eq("product_id", id)
      .eq("merchant_id", found.gate.merchant.id),
    found.gate.supabase.from("product_options").select("name, position").eq("product_id", id).order("position"),
    found.gate.supabase
      .from("product_variants")
      .select("id, option_values, stock, price_millimes, sku")
      .eq("product_id", id),
  ]);
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
  const product = found.product as Record<string, unknown>;
  const sizePolicy = (product.size_policy === "none" || product.size_policy === "options" || product.size_policy === "required"
    ? product.size_policy
    : "required") as SizePolicy;
  const orderedOptions = [...(optionRows ?? [])].sort(
    (a, b) => ((a.position as number) ?? 0) - ((b.position as number) ?? 0),
  );
  const variants = (variantRows ?? []).map((row) => {
    const optionValues: Record<string, string> = {};
    const raw = row.option_values;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === "string") optionValues[name] = value;
      }
    }
    return {
      id: row.id as string,
      optionValues,
      stock: row.stock as number,
      priceMillimes: (row.price_millimes as number | null) ?? null,
      sku: (row.sku as string | null) ?? null,
    };
  });
  const options = orderedOptions.map((row) => {
    const name = row.name as string;
    const values: string[] = [];
    for (const variant of variants) {
      const value = variant.optionValues[name];
      if (value && !values.includes(value)) values.push(value);
    }
    return { name, values };
  });
  const productType =
    (typeof product.product_type === "string" && product.product_type) ||
    ((product.category as string | null) || (product.category_phrase as string) || "General");
  return NextResponse.json({
    product: {
      id: product.id as string,
      name: product.name as string,
      category: productType,
      productType,
      description: typeof product.description === "string" ? product.description : "",
      sizePolicy,
      priceMillimes: product.price_millimes as number,
      floorMillimes: product.floor_millimes as number,
      stock: product.stock as number,
      aiEnabled: product.ai_enabled !== false,
      options,
      variants,
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
  const productType = (parsed.data.productType ?? parsed.data.category)?.trim();
  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (productType !== undefined) {
    update.product_type = productType || null;
    update.category = productType || "General";
    update.category_phrase = samPhrase(productType);
  }
  if (parsed.data.description !== undefined) update.description = parsed.data.description || null;
  if (parsed.data.priceMillimes !== undefined) update.price_millimes = parsed.data.priceMillimes;
  if (parsed.data.floorMillimes !== undefined) update.floor_millimes = parsed.data.floorMillimes;
  if (parsed.data.aiEnabled !== undefined) update.ai_enabled = parsed.data.aiEnabled;

  let stock = parsed.data.stock;
  if (parsed.data.options !== undefined) {
    const saved = await replaceProductOptions(found.gate.supabase, id, {
      options: parsed.data.options,
      variants: parsed.data.variants,
      floorMillimes: nextFloor,
      askSize: parsed.data.askSize ?? (found.product as { size_policy?: string }).size_policy === "required",
      simpleStock: parsed.data.stock ?? (found.product.stock as number),
    });
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
    update.size_policy = saved.sizePolicy;
    stock = saved.stock;
  }
  if (stock !== undefined) update.stock = stock;
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
