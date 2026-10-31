import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { embedImages } from "@/lib/ai/embeddings";
import { requireMerchant } from "@/lib/dashboard/guard";
import { isBlurry } from "@/lib/media/blur";

const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    categoryPhrase: z.string().trim().min(1).max(60),
    priceMillimes: z.number().int().nonnegative(),
    floorMillimes: z.number().int().nonnegative(),
    stock: z.number().int().nonnegative(),
    cropBase64: z.string().min(32).max(12_000_000),
    originalBase64: z.string().min(32).max(12_000_000),
  })
  .refine((value) => value.floorMillimes <= value.priceMillimes, { message: "floor" });

function decodeImage(input: string): Buffer {
  const match = input.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
  return Buffer.from(match ? match[1] : input, "base64");
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const floor = parsed.error.issues.some((issue) => issue.message === "floor");
    return NextResponse.json(
      { error: floor ? "Le prix plancher ne peut pas dépasser le prix." : "Fiche produit incomplète." },
      { status: 400 },
    );
  }
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;

  const original = decodeImage(parsed.data.originalBase64);
  const crop = decodeImage(parsed.data.cropBase64);
  try {
    await sharp(original).metadata();
    await sharp(crop).metadata();
  } catch {
    return NextResponse.json({ error: "Image illisible." }, { status: 400 });
  }
  if (await isBlurry(original)) {
    return NextResponse.json({ error: "Photo trop floue. Reprenez la photo plus près, sans bouger." }, { status: 422 });
  }

  let embedding: number[];
  try {
    const vectors = await embedImages([crop.toString("base64")]);
    const first = vectors[0];
    if (!first) return NextResponse.json({ error: "Embedding vide." }, { status: 502 });
    embedding = first;
  } catch (err) {
    const message = err instanceof Error ? err.message : "embedding impossible";
    return NextResponse.json({ error: `Embedding impossible : ${message}` }, { status: 502 });
  }

  const id = randomUUID();
  const cropPath = `catalog/${id}.png`;
  const sourcePath = `catalog/${id}-source.jpg`;
  const sourceJpeg = await sharp(original).jpeg().toBuffer();
  const cropPng = await sharp(crop).png().toBuffer();
  const { supabase, merchant } = gate;
  const { error: cropError } = await supabase.storage.from("crops").upload(cropPath, cropPng, { contentType: "image/png", upsert: false });
  if (cropError) return NextResponse.json({ error: cropError.message }, { status: 500 });
  const { error: sourceError } = await supabase.storage
    .from("product-media")
    .upload(sourcePath, sourceJpeg, { contentType: "image/jpeg", upsert: false });
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      merchant_id: merchant.id,
      name: parsed.data.name,
      category_phrase: parsed.data.categoryPhrase,
      price_millimes: parsed.data.priceMillimes,
      floor_millimes: parsed.data.floorMillimes,
      stock: parsed.data.stock,
    })
    .select("id")
    .single();
  if (productError || !product) return NextResponse.json({ error: productError?.message ?? "insert failed" }, { status: 500 });

  const { error: imageError } = await supabase.from("product_images").insert({
    product_id: product.id,
    merchant_id: merchant.id,
    source_path: sourcePath,
    crop_path: cropPath,
    embedding,
    is_primary: true,
  });
  if (imageError) {
    await supabase.from("products").delete().eq("id", product.id as string);
    return NextResponse.json({ error: imageError.message }, { status: 500 });
  }
  return NextResponse.json({ productId: product.id, name: parsed.data.name });
}
