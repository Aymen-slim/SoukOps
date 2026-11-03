import { NextResponse } from "next/server";
import { requireMerchant } from "@/lib/dashboard/guard";
import { signProductPhotosBatch } from "@/lib/dashboard/catalog-images";

export async function GET() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, category, category_phrase, price_millimes, floor_millimes, stock, ai_enabled, active")
    .eq("merchant_id", merchant.id)
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (products ?? []).map((product) => product.id as string);
  const { data: images } = ids.length
    ? await supabase
        .from("product_images")
        .select("product_id, source_path, crop_path, is_primary")
        .eq("merchant_id", merchant.id)
        .in("product_id", ids)
    : {
        data: [] as Array<{
          product_id: string;
          source_path: string | null;
          crop_path: string | null;
          is_primary: boolean;
        }>,
      };
  const primary = new Map<string, { source_path: string | null; crop_path: string | null }>();
  const counts = new Map<string, number>();
  for (const image of images ?? []) {
    const productId = image.product_id as string;
    counts.set(productId, (counts.get(productId) ?? 0) + 1);
    if (!primary.has(productId) || image.is_primary) {
      primary.set(productId, {
        source_path: (image.source_path as string | null) ?? null,
        crop_path: (image.crop_path as string | null) ?? null,
      });
    }
  }

  const signedUrls = await signProductPhotosBatch(
    supabase,
    (products ?? []).map((product) => {
      const id = product.id as string;
      const photo = primary.get(id);
      return {
        key: id,
        sourcePath: photo?.source_path ?? null,
        cropPath: photo?.crop_path ?? null,
      };
    }),
  );

  const rows = (products ?? []).map((product) => {
    const id = product.id as string;
    return {
      id,
      name: product.name as string,
      category: (product.category as string | null) || (product.category_phrase as string) || "General",
      priceMillimes: product.price_millimes as number,
      floorMillimes: product.floor_millimes as number,
      stock: product.stock as number,
      aiEnabled: product.ai_enabled !== false,
      imageCount: counts.get(id) ?? 0,
      imageUrl: signedUrls.get(id) ?? null,
    };
  });
  return NextResponse.json({ products: rows });
}
