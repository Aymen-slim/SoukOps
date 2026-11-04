import { createAdminClient } from "@/lib/supabase/admin";
import {
  writeProductPolicy,
  type SizePolicy,
  type StoredVariant,
} from "@/lib/domain/catalog-options";

type Db = ReturnType<typeof createAdminClient>;

/**
 * Copies the product's size policy and option matrix onto the conversation
 * slots. Reloads only when the matched product changes. A missing column
 * (migration not applied yet) leaves the legacy "ask for a size" policy.
 */
export async function ensureProductPolicy(supabase: Db, slots: Record<string, unknown>): Promise<void> {
  const productId = typeof slots.matchedProductId === "string" ? slots.matchedProductId : null;
  if (!productId) return;
  if (
    slots.policyProductId === productId &&
    (slots.sizePolicy === "none" || slots.sizePolicy === "options" || slots.sizePolicy === "required")
  ) {
    return;
  }

  const { data, error } = await supabase.from("products").select("size_policy").eq("id", productId).maybeSingle();
  if (error || !data) {
    writeProductPolicy(slots, {
      productId,
      sizePolicy: "required",
      optionNames: [],
      optionChoices: {},
      variants: [],
    });
    return;
  }

  const raw = (data as { size_policy?: string }).size_policy;
  const sizePolicy: SizePolicy = raw === "none" || raw === "options" ? raw : "required";
  if (sizePolicy !== "options") {
    writeProductPolicy(slots, { productId, sizePolicy, optionNames: [], optionChoices: {}, variants: [] });
    return;
  }

  const [{ data: optionRows, error: optionError }, { data: variantRows, error: variantError }] = await Promise.all([
    supabase.from("product_options").select("name, position").eq("product_id", productId).order("position"),
    supabase.from("product_variants").select("id, option_values, stock, price_millimes").eq("product_id", productId),
  ]);
  if (optionError || variantError) {
    writeProductPolicy(slots, { productId, sizePolicy: "required", optionNames: [], optionChoices: {}, variants: [] });
    return;
  }

  const ordered = [...(optionRows ?? [])].sort(
    (a, b) => ((a.position as number) ?? 0) - ((b.position as number) ?? 0),
  );
  const optionNames = ordered
    .map((row) => (typeof row.name === "string" ? row.name : ""))
    .filter(Boolean);
  const variants: StoredVariant[] = (variantRows ?? []).flatMap((row) => {
    if (typeof row.id !== "string") return [];
    const optionValues: Record<string, string> = {};
    const rawValues = row.option_values;
    if (rawValues && typeof rawValues === "object" && !Array.isArray(rawValues)) {
      for (const [name, value] of Object.entries(rawValues as Record<string, unknown>)) {
        if (typeof value === "string" && value.trim()) optionValues[name] = value;
      }
    }
    return [
      {
        id: row.id,
        optionValues,
        stock: typeof row.stock === "number" ? row.stock : 0,
        priceMillimes: typeof row.price_millimes === "number" ? row.price_millimes : null,
      },
    ];
  });
  const optionChoices: Record<string, string[]> = {};
  for (const name of optionNames) {
    const values: string[] = [];
    for (const variant of variants) {
      const value = variant.optionValues[name];
      if (value && !values.some((existing) => existing.toLowerCase() === value.toLowerCase())) values.push(value);
    }
    optionChoices[name] = values;
  }
  writeProductPolicy(slots, { productId, sizePolicy, optionNames, optionChoices, variants });
}
