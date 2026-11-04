/**
 * What the shop sells drives the conversation: code — never the model —
 * decides which slots make sense (a honey shop is never asked a clothing
 * size) and which words the chat uses. The seller confirms the vertical in
 * Settings; the catalog only suggests it. Pure functions, unit-tested.
 */

export const BUSINESS_TYPES = ["clothing", "shoes", "beauty", "food", "electronics", "home", "general"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export function isBusinessType(value: unknown): value is BusinessType {
  return typeof value === "string" && (BUSINESS_TYPES as readonly string[]).includes(value);
}

export type SizeKind = "clothing" | "shoe" | "none";

export interface BusinessProfile {
  type: BusinessType;
  /** English label for prompts and the settings UI. */
  label: string;
  /** What to identify in a buyer photo, e.g. "clothing item". */
  imageNoun: string;
  sizeKind: SizeKind;
  /** Whether deterministic clothing/shoe size extraction may run. */
  extractSize: boolean;
  /** Derja word for the size question, when the vertical has sizes. */
  sizeWord: string | null;
  sizeExamples: string | null;
}

const PROFILES: Record<BusinessType, Omit<BusinessProfile, "type">> = {
  clothing: { label: "clothing", imageNoun: "clothing item", sizeKind: "clothing", extractSize: true, sizeWord: "taille", sizeExamples: "S, M, L, XL" },
  shoes: { label: "shoes", imageNoun: "shoe", sizeKind: "shoe", extractSize: true, sizeWord: "pointure", sizeExamples: "38, 39, 40, 41, 42" },
  beauty: { label: "beauty & cosmetics", imageNoun: "beauty product", sizeKind: "none", extractSize: false, sizeWord: null, sizeExamples: null },
  food: { label: "food & groceries", imageNoun: "food product", sizeKind: "none", extractSize: false, sizeWord: null, sizeExamples: null },
  electronics: { label: "electronics", imageNoun: "electronic product", sizeKind: "none", extractSize: false, sizeWord: null, sizeExamples: null },
  home: { label: "home goods", imageNoun: "home product", sizeKind: "none", extractSize: false, sizeWord: null, sizeExamples: null },
  general: { label: "general products", imageNoun: "product", sizeKind: "none", extractSize: false, sizeWord: null, sizeExamples: null },
};

export function businessProfile(type: BusinessType): BusinessProfile {
  return { type, ...PROFILES[type] };
}

const INFER_RULES: Array<{ type: BusinessType; words: RegExp }> = [
  { type: "clothing", words: /\b(hoodie|sweat|dress|robe|jacket|veste|pantalon|jean|t-?shirt|chemise|pull|manteau|abaya|hijab|clothing|vetement|vêtement)\b/i },
  { type: "shoes", words: /\b(shoes?|sneakers?|chaussures?|baskets?|sandales?|bottes?|espadrilles?|sabbat)\b/i },
  { type: "beauty", words: /\b(parfum|perfume|fragrance|makeup|maquillage|cosmetic|cream|crème|serum|sérum|lipstick|rouge à lèvres|shampoo|shampoing|huile d'argan|beauty)\b/i },
  { type: "food", words: /\b(honey|miel|olive oil|huile d'olive|dates?|dattes|harissa|coffee|café en grains|tea|thé|chocolat|chocolate|food|épices|spices|mloukhia|couscous)\b/i },
  { type: "electronics", words: /\b(phone|iphone|samsung|coque|case|écouteurs|earbuds|headphones|casque|charger|chargeur|câble|cable|watch|montre connectée|electronics|smartphone)\b/i },
  { type: "home", words: /\b(candle|bougie|vase|lampe|lamp|cushion|coussin|tapis|carpet|furniture|meuble|home|maison|décoration|decoration)\b/i },
];

/** Suggests a vertical from catalog product names/types. First rule with a hit wins. */
export function inferBusinessType(productTexts: string[]): BusinessType {
  const joined = productTexts.filter(Boolean).join(" \n ");
  if (!joined.trim()) return "general";
  for (const rule of INFER_RULES) {
    if (rule.words.test(joined)) return rule.type;
  }
  return "general";
}

/** The seller's confirmed type wins; "general"/unset falls back to the catalog suggestion. */
export function resolveBusinessType(merchantType: unknown, productTexts: string[]): BusinessType {
  if (isBusinessType(merchantType) && merchantType !== "general") return merchantType;
  return inferBusinessType(productTexts);
}

export interface BusinessContext {
  type: BusinessType;
  profile: BusinessProfile;
  /** Short "what we sell" line: seller description, else catalog product types. */
  sellsLine: string;
  /** One deterministic line for model prompts. No timestamps or ids (cassette-safe). */
  promptLine: string;
  /** Image instruction replacing the clothing-only wording for this vertical. */
  imageInstruction: string;
}

export function buildBusinessContext(input: {
  businessType?: unknown;
  businessDescription?: string | null;
  productTypes?: string[];
}): BusinessContext {
  const productTypes = [...new Set((input.productTypes ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 8);
  const type = resolveBusinessType(input.businessType, productTypes);
  const profile = businessProfile(type);
  const description = (input.businessDescription ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
  const sellsLine = description || productTypes.join(", ") || profile.label;
  const sizeLine =
    profile.sizeKind === "clothing"
      ? " Size means clothing size (S, M, L, XL)."
      : profile.sizeKind === "shoe"
        ? " Size means shoe size / pointure (38-46)."
        : " Products here are sold without sizes; never ask for a taille.";
  const promptLine = `Shop context: this shop sells ${sellsLine} (${profile.label}). Identify the ${profile.imageNoun} in images.${sizeLine}`;
  const imageInstruction =
    `The buyer attached image(s), included in this request. Identify the main ${profile.imageNoun} shown in the image ` +
    `(ignore phone UI, captions and other people if several) and fill samNounPhrase, productDescriptionEn, color and spatialHint from what you SEE, ` +
    `AND also fill size, quantity, governorate, landmarks, phone, customerName or counterOfferMillimes from the buyer message text if stated.`;
  return { type, profile, sellsLine, promptLine, imageInstruction };
}
