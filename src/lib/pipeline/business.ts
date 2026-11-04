import { buildBusinessContext, type BusinessContext } from "@/lib/domain/business";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Loads what the shop sells for one turn: the seller-confirmed vertical
 * (migration 0006) merged with the catalog's product types. Missing columns
 * (migration not applied yet) keep the catalog-inferred context so turns
 * still run.
 */
export async function loadBusinessContext(
  supabase: Admin,
  merchantId: string,
  productTypes: string[],
): Promise<BusinessContext> {
  const { data, error } = await supabase
    .from("merchants")
    .select("business_type, business_description")
    .eq("id", merchantId)
    .maybeSingle();
  if (error || !data) return buildBusinessContext({ productTypes });
  return buildBusinessContext({
    businessType: (data as { business_type?: unknown }).business_type,
    businessDescription: (data as { business_description?: unknown }).business_description as string | null,
    productTypes,
  });
}
