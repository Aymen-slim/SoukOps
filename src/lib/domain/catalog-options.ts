/**
 * Seller-defined product options. Code owns the matrix: at most three option
 * names, at most 50 combinations, stock and optional price per variant.
 * Chat slots read the same shape; a missing size policy still means "ask size".
 */

export const MAX_OPTIONS = 3;
export const MAX_OPTION_VALUES = 20;
export const MAX_VARIANTS = 50;

export const SIZE_POLICIES = ["required", "none", "options"] as const;
export type SizePolicy = (typeof SIZE_POLICIES)[number];

export interface OptionInput {
  name: string;
  values: string[];
}

export interface VariantInput {
  optionValues: Record<string, string>;
  stock: number;
  priceMillimes?: number | null;
  sku?: string | null;
}

export interface StoredVariant {
  id: string;
  optionValues: Record<string, string>;
  stock: number;
  priceMillimes: number | null;
}

export interface NormalizedOptions {
  options: Array<{ name: string; values: string[]; position: number }>;
  variants: Array<{
    optionValues: Record<string, string>;
    stock: number;
    priceMillimes: number | null;
    sku: string | null;
  }>;
  stock: number;
}

/** Short English noun for SAM. Blank type becomes "product". */
export function samPhrase(productType: string | null | undefined): string {
  const words = (productType ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  return words.join(" ") || "product";
}

export function comboKey(optionValues: Record<string, string>): string {
  return Object.entries(optionValues)
    .map(([name, value]) => `${name}=${value}`)
    .join("|");
}

export function optionCombinations(options: OptionInput[]): Record<string, string>[] {
  const clean = options
    .map((option) => ({
      name: option.name.trim(),
      values: option.values.map((value) => value.trim()).filter(Boolean),
    }))
    .filter((option) => option.name && option.values.length > 0);
  if (clean.length === 0) return [];
  let rows: Record<string, string>[] = [{}];
  for (const option of clean) {
    rows = rows.flatMap((row) => option.values.map((value) => ({ ...row, [option.name]: value })));
  }
  return rows;
}

export function resolveSizePolicy(askSize: boolean, optionCount: number): SizePolicy {
  if (optionCount > 0) return "options";
  return askSize ? "required" : "none";
}

export function normalizeSellerOptions(input: {
  options?: OptionInput[];
  variants?: VariantInput[];
  floorMillimes: number;
}): { ok: true; catalog: NormalizedOptions } | { ok: false; error: string } {
  const raw = (input.options ?? [])
    .map((option) => ({
      name: option.name.trim(),
      values: uniqueValues(option.values),
    }))
    .filter((option) => option.name || option.values.length > 0);

  if (raw.length === 0) {
    return { ok: true, catalog: { options: [], variants: [], stock: 0 } };
  }
  if (raw.length > MAX_OPTIONS) return { ok: false, error: `Use at most ${MAX_OPTIONS} options.` };
  const names = new Set<string>();
  for (const option of raw) {
    if (!option.name) return { ok: false, error: "Every option needs a name." };
    if (option.values.length === 0) return { ok: false, error: `Add values for ${option.name}.` };
    if (option.values.length > MAX_OPTION_VALUES) {
      return { ok: false, error: `${option.name} has too many values.` };
    }
    const key = option.name.toLowerCase();
    if (names.has(key)) return { ok: false, error: `Option ${option.name} is listed twice.` };
    names.add(key);
  }

  const combos = optionCombinations(raw);
  if (combos.length > MAX_VARIANTS) {
    return { ok: false, error: `That creates ${combos.length} variants. Keep it to ${MAX_VARIANTS}.` };
  }
  const byKey = new Map<string, VariantInput>();
  for (const variant of input.variants ?? []) {
    byKey.set(comboKey(variant.optionValues), variant);
  }
  if ((input.variants ?? []).length > 0 && byKey.size !== combos.length) {
    return { ok: false, error: "Variant rows must match the option combinations." };
  }

  const variants: NormalizedOptions["variants"] = [];
  for (const optionValues of combos) {
    const found = byKey.get(comboKey(optionValues));
    const stock = Math.max(0, Math.floor(found?.stock ?? 0));
    const price = found?.priceMillimes ?? null;
    if (price != null && (!Number.isInteger(price) || price < 0)) {
      return { ok: false, error: "Variant price must be a whole number of millimes." };
    }
    if (price != null && price < input.floorMillimes) {
      return { ok: false, error: "A variant price cannot sit under the floor." };
    }
    variants.push({
      optionValues,
      stock,
      priceMillimes: price,
      sku: found?.sku?.trim() ? found.sku.trim().slice(0, 64) : null,
    });
  }
  return {
    ok: true,
    catalog: {
      options: raw.map((option, position) => ({ ...option, position })),
      variants,
      stock: variants.reduce((sum, variant) => sum + variant.stock, 0),
    },
  };
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed.slice(0, 40));
  }
  return out;
}

export function readSizePolicy(slots: Record<string, unknown>): SizePolicy {
  return slots.sizePolicy === "none" || slots.sizePolicy === "options" || slots.sizePolicy === "required"
    ? slots.sizePolicy
    : "required";
}

export function optionNamesOf(slots: Record<string, unknown>): string[] {
  return Array.isArray(slots.optionNames)
    ? slots.optionNames.filter((name): name is string => typeof name === "string" && Boolean(name.trim()))
    : [];
}

export function optionChoicesOf(slots: Record<string, unknown>): Record<string, string[]> {
  const raw = slots.optionChoices;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [name, values] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(values)) continue;
    out[name] = values.filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  }
  return out;
}

export function selectedOptionsOf(slots: Record<string, unknown>): Record<string, string> {
  const raw = slots.selectedOptions;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) out[name] = value.trim();
  }
  return out;
}

export function variantsOf(slots: Record<string, unknown>): StoredVariant[] {
  if (!Array.isArray(slots.variants)) return [];
  const out: StoredVariant[] = [];
  for (const row of slots.variants) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    if (typeof record.id !== "string") continue;
    out.push({
      id: record.id,
      optionValues: selectedOptionsOf({ selectedOptions: record.optionValues }),
      stock: typeof record.stock === "number" ? record.stock : 0,
      priceMillimes: typeof record.priceMillimes === "number" ? record.priceMillimes : null,
    });
  }
  return out;
}

export function formatOptionValues(values: Record<string, string> | null | undefined): string | null {
  if (!values) return null;
  const parts = Object.entries(values).filter(([, value]) => value.trim());
  if (parts.length === 0) return null;
  return parts.map(([name, value]) => `${name} ${value}`).join(", ");
}

export function missingOptionName(slots: Record<string, unknown>): string | null {
  const selected = selectedOptionsOf(slots);
  return optionNamesOf(slots).find((name) => !selected[name]) ?? null;
}

export function resolveVariant(slots: Record<string, unknown>): StoredVariant | null {
  const names = optionNamesOf(slots);
  if (names.length === 0 || missingOptionName(slots)) return null;
  const selected = selectedOptionsOf(slots);
  return (
    variantsOf(slots).find((variant) =>
      names.every(
        (name) => (variant.optionValues[name] ?? "").toLowerCase() === (selected[name] ?? "").toLowerCase(),
      ),
    ) ?? null
  );
}

/** True when this product no longer needs a size or option answer. */
export function sizeSlotSatisfied(slots: Record<string, unknown>): boolean {
  const policy = readSizePolicy(slots);
  if (policy === "none") return true;
  if (policy === "options") {
    const variant = resolveVariant(slots);
    return Boolean(variant && variant.stock > 0);
  }
  return typeof slots.size === "string" && Boolean(slots.size.trim());
}

export function optionAskText(slots: Record<string, unknown>): string | null {
  if (readSizePolicy(slots) !== "options") return null;
  const name = missingOptionName(slots);
  if (!name) return null;
  const choices = optionChoicesOf(slots)[name] ?? [];
  const list = choices.length > 0 ? ` (${choices.slice(0, 8).join(", ")})` : "";
  return `Behi! Chnowa ${name}?${list}`;
}

/** Spark instruction when the next slot is a seller-defined option. */
export function optionAskHint(slots: Record<string, unknown>): string | null {
  const name = readSizePolicy(slots) === "options" ? missingOptionName(slots) : null;
  if (!name) return null;
  const choices = optionChoicesOf(slots)[name] ?? [];
  const list = choices.length > 0 ? ` Allowed values: ${choices.join(", ")}.` : "";
  return `Ask only for the product option "${name}". Do not ask for a clothing size.${list}`;
}

function mentionsValue(text: string, value: string): boolean {
  const trimmed = text.trim().toLowerCase();
  const needle = value.trim().toLowerCase();
  if (!needle) return false;
  if (trimmed === needle) return true;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu").test(text);
}

/**
 * Fills the next missing option from buyer text. A sold-out combination is
 * rolled back so the chat asks again.
 */
export function captureOptionAnswer(
  slots: Record<string, unknown>,
  text: string,
): { filled: string | null; stockout: boolean } {
  if (readSizePolicy(slots) !== "options") return { filled: null, stockout: false };
  const names = optionNamesOf(slots);
  const choices = optionChoicesOf(slots);
  const selected = { ...selectedOptionsOf(slots) };
  let filled: string | null = null;
  for (const name of names) {
    if (selected[name]) continue;
    const hit = (choices[name] ?? []).find((value) => mentionsValue(text, value));
    if (!hit) continue;
    selected[name] = hit;
    filled = name;
    break;
  }
  slots.selectedOptions = selected;
  if (!filled) return { filled: null, stockout: false };
  const variant = resolveVariant(slots);
  if (variant && missingOptionName(slots) === null) {
    if (variant.stock <= 0) {
      delete selected[filled];
      slots.selectedOptions = selected;
      delete slots.variantId;
      delete slots.variantPriceMillimes;
      slots.optionStockout = true;
      return { filled, stockout: true };
    }
    slots.variantId = variant.id;
    slots.variantStock = variant.stock;
    if (variant.priceMillimes != null) slots.variantPriceMillimes = variant.priceMillimes;
    else delete slots.variantPriceMillimes;
    slots.optionStockout = false;
    return { filled, stockout: false };
  }
  delete slots.variantId;
  slots.optionStockout = false;
  return { filled, stockout: false };
}

export function writeProductPolicy(
  slots: Record<string, unknown>,
  policy: {
    productId: string;
    sizePolicy: SizePolicy;
    optionNames: string[];
    optionChoices: Record<string, string[]>;
    variants: StoredVariant[];
  },
): void {
  slots.policyProductId = policy.productId;
  slots.sizePolicy = policy.sizePolicy;
  if (policy.sizePolicy !== "options" || policy.optionNames.length === 0) {
    if (policy.sizePolicy === "options") slots.sizePolicy = "none";
    delete slots.optionNames;
    delete slots.optionChoices;
    delete slots.variants;
    delete slots.selectedOptions;
    delete slots.variantId;
    delete slots.variantPriceMillimes;
    delete slots.variantStock;
    return;
  }
  const previous = selectedOptionsOf(slots);
  const selected: Record<string, string> = {};
  for (const name of policy.optionNames) {
    const choice = previous[name];
    const allowed = policy.optionChoices[name] ?? [];
    const match = choice ? allowed.find((value) => value.toLowerCase() === choice.toLowerCase()) : undefined;
    if (match) selected[name] = match;
  }
  slots.optionNames = policy.optionNames;
  slots.optionChoices = policy.optionChoices;
  slots.variants = policy.variants;
  slots.selectedOptions = selected;
  const variant = resolveVariant(slots);
  if (variant && variant.stock > 0) {
    slots.variantId = variant.id;
    slots.variantStock = variant.stock;
    if (variant.priceMillimes != null) slots.variantPriceMillimes = variant.priceMillimes;
    else delete slots.variantPriceMillimes;
  } else {
    delete slots.variantId;
    delete slots.variantPriceMillimes;
  }
}
