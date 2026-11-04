import type { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeSellerOptions,
  resolveSizePolicy,
  type OptionInput,
  type SizePolicy,
  type VariantInput,
} from "@/lib/domain/catalog-options";

type Db = ReturnType<typeof createAdminClient>;

export async function replaceProductOptions(
  supabase: Db,
  productId: string,
  input: {
    options?: OptionInput[];
    variants?: VariantInput[];
    floorMillimes: number;
    askSize: boolean;
    simpleStock: number;
  },
): Promise<{ ok: true; stock: number; sizePolicy: SizePolicy } | { ok: false; error: string }> {
  const normalized = normalizeSellerOptions({
    options: input.options,
    variants: input.variants,
    floorMillimes: input.floorMillimes,
  });
  if (!normalized.ok) return normalized;
  const sizePolicy = resolveSizePolicy(input.askSize, normalized.catalog.options.length);
  const stock = sizePolicy === "options" ? normalized.catalog.stock : input.simpleStock;

  const { error: clearVariants } = await supabase.from("product_variants").delete().eq("product_id", productId);
  if (clearVariants) return { ok: false, error: clearVariants.message };
  const { error: clearOptions } = await supabase.from("product_options").delete().eq("product_id", productId);
  if (clearOptions) return { ok: false, error: clearOptions.message };

  if (normalized.catalog.options.length > 0) {
    const { error: optionError } = await supabase.from("product_options").insert(
      normalized.catalog.options.map((option) => ({
        product_id: productId,
        name: option.name,
        position: option.position,
      })),
    );
    if (optionError) return { ok: false, error: optionError.message };
    const { error: variantError } = await supabase.from("product_variants").insert(
      normalized.catalog.variants.map((variant) => ({
        product_id: productId,
        option_values: variant.optionValues,
        stock: variant.stock,
        price_millimes: variant.priceMillimes,
        sku: variant.sku,
        size: variant.optionValues.Size ?? variant.optionValues.size ?? null,
        color: variant.optionValues.Color ?? variant.optionValues.color ?? null,
      })),
    );
    if (variantError) return { ok: false, error: variantError.message };
  }

  return { ok: true, stock, sizePolicy };
}
