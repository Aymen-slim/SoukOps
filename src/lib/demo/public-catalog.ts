import { signProductPhotosBatch } from "@/lib/dashboard/catalog-images";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PublicProduct {
  id: string;
  name: string;
  category: string;
  priceMillimes: number;
  stock: number;
  imageUrl: string | null;
}

type Admin = ReturnType<typeof createAdminClient>;

export async function loadPublicCatalog(supabase: Admin, merchantId: string): Promise<PublicProduct[]> {
  const withCategory = await supabase
    .from("products")
    .select("id, name, category, category_phrase, price_millimes, stock")
    .eq("merchant_id", merchantId)
    .eq("active", true)
    .order("name", { ascending: true })
    .limit(80);
  const rows = withCategory.error
    ? (
        await supabase
          .from("products")
          .select("id, name, category_phrase, price_millimes, stock")
          .eq("merchant_id", merchantId)
          .eq("active", true)
          .order("name", { ascending: true })
          .limit(80)
      ).data
    : withCategory.data;
  const products = rows ?? [];
  if (products.length === 0) return [];
  const ids = products.map((product) => product.id as string);
  const { data: images } = await supabase
    .from("product_images")
    .select("product_id, source_path, crop_path, is_primary")
    .in("product_id", ids);
  const primary = new Map<string, { source_path: string | null; crop_path: string | null }>();
  for (const image of images ?? []) {
    const productId = image.product_id as string;
    if (!primary.has(productId) || image.is_primary) {
      primary.set(productId, {
        source_path: (image.source_path as string | null) ?? null,
        crop_path: (image.crop_path as string | null) ?? null,
      });
    }
  }

  const signedUrls = await signProductPhotosBatch(
    supabase,
    products.map((product) => {
      const id = product.id as string;
      const photo = primary.get(id);
      return {
        key: id,
        sourcePath: photo?.source_path ?? null,
        cropPath: photo?.crop_path ?? null,
      };
    }),
  );

  return products.map((product) => {
    const id = product.id as string;
    const category =
      (typeof (product as { category?: string }).category === "string" && (product as { category?: string }).category) ||
      (product.category_phrase as string) ||
      "General";
    return {
      id,
      name: product.name as string,
      category,
      priceMillimes: product.price_millimes as number,
      stock: product.stock as number,
      imageUrl: signedUrls.get(id) ?? null,
    };
  });
}
