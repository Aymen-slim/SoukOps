import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { requireMerchant } from "@/lib/dashboard/guard";
import { decodeImage, saveCatalogImagesBatch } from "@/lib/dashboard/catalog-images";
import { isBlurry } from "@/lib/media/blur";

const imageSchema = z.object({
  cropBase64: z.string().min(32).max(12_000_000),
  originalBase64: z.string().min(32).max(12_000_000),
  alreadyPreviewed: z.boolean().optional(),
});

const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(60).optional(),
    categoryPhrase: z.string().trim().min(1).max(60).optional(),
    priceMillimes: z.number().int().nonnegative(),
    floorMillimes: z.number().int().nonnegative(),
    stock: z.number().int().nonnegative(),
    aiEnabled: z.boolean().optional(),
    cropBase64: z.string().min(32).max(12_000_000).optional(),
    originalBase64: z.string().min(32).max(12_000_000).optional(),
    images: z.array(imageSchema).min(1).max(6).optional(),
  })
  .refine((value) => value.floorMillimes <= value.priceMillimes, { message: "floor" })
  .refine((value) => Boolean(value.category || value.categoryPhrase), { message: "category" })
  .refine(
    (value) => Boolean((value.images && value.images.length > 0) || (value.cropBase64 && value.originalBase64)),
    { message: "images" },
  );

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const floor = parsed.error.issues.some((issue) => issue.message === "floor");
    const category = parsed.error.issues.some((issue) => issue.message === "category");
    return NextResponse.json(
      {
        error: floor
          ? "The floor price cannot exceed the price."
          : category
            ? "Add a category."
            : "Incomplete product sheet.",
      },
      { status: 400 },
    );
  }
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;

  const images =
    parsed.data.images ??
    (parsed.data.cropBase64 && parsed.data.originalBase64
      ? [{ cropBase64: parsed.data.cropBase64, originalBase64: parsed.data.originalBase64, alreadyPreviewed: false }]
      : []);

  let decoded: Array<{ original: Buffer; crop: Buffer; primary: boolean }>;
  try {
    decoded = await Promise.all(
      images.map(async (image, index) => {
        const original = decodeImage(image.originalBase64);
        const crop = decodeImage(image.cropBase64);
        try {
          await Promise.all([sharp(original).metadata(), sharp(crop).metadata()]);
        } catch {
          throw new Error("UNREADABLE");
        }
        if (!image.alreadyPreviewed && (await isBlurry(original))) {
          throw new Error("BLURRY");
        }
        return { original, crop, primary: index === 0 };
      }),
    );
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "UNREADABLE") {
      return NextResponse.json({ error: "Image illisible." }, { status: 400 });
    }
    if (code === "BLURRY") {
      return NextResponse.json({ error: "Photo too blurry. Retake it closer, without moving." }, { status: 422 });
    }
    return NextResponse.json({ error: "Invalid image data." }, { status: 400 });
  }

  const category = (parsed.data.category ?? parsed.data.categoryPhrase ?? "general").slice(0, 60);
  const phrase = (parsed.data.categoryPhrase ?? category).slice(0, 60);
  const aiEnabled = parsed.data.aiEnabled ?? true;
  const { supabase, merchant } = gate;
  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      merchant_id: merchant.id,
      name: parsed.data.name,
      category_phrase: phrase,
      category,
      price_millimes: parsed.data.priceMillimes,
      floor_millimes: parsed.data.floorMillimes,
      stock: parsed.data.stock,
      ai_enabled: aiEnabled,
    })
    .select("id")
    .single();
  if (productError || !product) {
    return NextResponse.json({ error: productError?.message ?? "insert failed" }, { status: 500 });
  }

  try {
    const { primaryImageUrl } = await saveCatalogImagesBatch({
      supabase,
      merchantId: merchant.id,
      productId: product.id as string,
      items: decoded,
    });
    return NextResponse.json({
      productId: product.id,
      name: parsed.data.name,
      product: {
        id: product.id as string,
        name: parsed.data.name,
        category,
        priceMillimes: parsed.data.priceMillimes,
        floorMillimes: parsed.data.floorMillimes,
        stock: parsed.data.stock,
        aiEnabled,
        imageCount: decoded.length,
        imageUrl: primaryImageUrl,
      },
    });
  } catch (err) {
    await supabase.from("products").delete().eq("id", product.id as string);
    const message = err instanceof Error ? err.message : "embedding failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
