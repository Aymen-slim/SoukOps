import { z } from "zod";
import { sparkJson } from "@/lib/ai/spark";
import {
  detectAssistanceIntent,
  extractBuildingDetails,
  extractColor,
  extractGovernorate,
  extractLandmarks,
  extractPhone,
  extractQuantity,
  extractSize,
  extractCustomerName,
  normalizeTunisianPhone,
  parseMoneyMillimes,
  parseOrderChange,
  refinePrimaryIntent,
} from "@/lib/domain/derja";

export const changeSchema = z
  .object({
    target: z.enum(["size", "color", "quantity", "product", "item", "customerName", "phone", "governorate", "landmark", "order"]),
    operation: z.enum(["replace", "add", "remove", "cancel", "increment", "decrement"]),
    value: z.union([z.string(), z.number()]).nullable(),
    itemIndex: z.number().int().min(0).max(4).nullable(),
  })
  .nullable();

export const understandSchema = z.object({
  primaryIntent: z.enum([
    "order",
    "bargain",
    "ask_price",
    "ask_stock",
    "greeting",
    "complaint",
    "human_request",
    "off_topic",
    "change_order",
    "add_item",
    "remove_item",
    "cancel_order",
    "correction",
    "ask_delivery",
    "ask_policy",
    "track_order",
    "other",
  ]),
  change: changeSchema.optional().default(null),
  samNounPhrase: z.string().nullable(), // short English category for SAM, e.g. "hoodie"
  productDescriptionEn: z.string().nullable(), // short English desc for PE text search
  spatialHint: z.string().nullable(), // e.g. "the one on the left"
  size: z.string().nullable(),
  color: z.string().nullable(),
  quantity: z.number().int().positive().nullable(),
  customerName: z.string().nullable(),
  phone: z.string().nullable(),
  governorate: z.string().nullable(),
  delegation: z.string().nullable(),
  landmarks: z.array(z.object({ name: z.string(), relation: z.string().nullable() })),
  floor: z.string().nullable(),
  driverNote: z.string().nullable(),
  discountAskPercent: z.number().nullable(),
  counterOfferMillimes: z.number().int().nullable(),
  flags: z.object({
    offTopic: z.boolean(),
    insult: z.boolean(),
    wantsHuman: z.boolean(),
  }),
});

export type Understanding = z.infer<typeof understandSchema>;

const nullableString = { type: ["string", "null"] };
const understandJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "primaryIntent", "change", "samNounPhrase", "productDescriptionEn", "spatialHint", "size", "color",
    "quantity", "customerName", "phone", "governorate", "delegation", "landmarks", "floor",
    "driverNote", "discountAskPercent", "counterOfferMillimes", "flags",
  ],
  properties: {
    primaryIntent: {
      type: "string",
      enum: ["order", "bargain", "ask_price", "ask_stock", "greeting", "complaint", "human_request", "off_topic", "change_order", "add_item", "remove_item", "cancel_order", "correction", "ask_delivery", "ask_policy", "track_order", "other"],
    },
    change: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["target", "operation", "value", "itemIndex"],
      properties: {
        target: { type: "string", enum: ["size", "color", "quantity", "product", "item", "customerName", "phone", "governorate", "landmark", "order"] },
        operation: { type: "string", enum: ["replace", "add", "remove", "cancel", "increment", "decrement"] },
        value: { type: ["string", "number", "null"] },
        itemIndex: { type: ["integer", "null"] },
      },
    },
    samNounPhrase: nullableString,
    productDescriptionEn: nullableString,
    spatialHint: nullableString,
    size: nullableString,
    color: nullableString,
    quantity: { type: ["integer", "null"] },
    customerName: nullableString,
    phone: nullableString,
    governorate: nullableString,
    delegation: nullableString,
    landmarks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "relation"],
        properties: { name: { type: "string" }, relation: nullableString },
      },
    },
    floor: nullableString,
    driverNote: nullableString,
    discountAskPercent: { type: ["number", "null"] },
    counterOfferMillimes: { type: ["integer", "null"] },
    flags: {
      type: "object",
      additionalProperties: false,
      required: ["offTopic", "insult", "wantsHuman"],
      properties: {
        offTopic: { type: "boolean" },
        insult: { type: "boolean" },
        wantsHuman: { type: "boolean" },
      },
    },
  },
};

const SYSTEM = `You extract structured order information from Tunisian Derja (Arabic script, Arabizi, or French) buyer messages for a shop that sells any kind of product.
Return only the JSON schema. Rules:
- Always extract ALL order details stated in the buyer text/caption (size, color, quantity, governorate, delegation, landmarks, floor, driverNote, phone, customerName, counterOfferMillimes), EVEN WHEN an image is attached.
- size: a size if mentioned (e.g. "XS", "S", "M", "L", "XL", "XXL", "38", "42"), normalized to uppercase. If the buyer replies with just a size like "L" or "taille M", always set size.
- samNounPhrase: short English product noun only (e.g. "hoodie", "phone", "honey", "candle", "shoes"), never a brand or the full product name.
- productDescriptionEn: very short English description of the product, with color if known (e.g. "black hoodie", "glass honey jar"), for embedding search. Keep it under 8 words.
- counterOfferMillimes: convert Derja money to integer millimes (1 DT = 1000). "170 alf" = 170000. "malyoun" = 1000000.
- landmarks: ANY place the buyer mentions as a location/address reference — including coffee shops, cafés, 9ahwa, salons de thé, restaurants, pâtisseries, gyms, supermarkets (Monoprix, Carrefour, MG, Aziza), malls, pharmacies, mosques, schools, universities, post offices, banks, clinics, metro/bus/fuel stations, hotels, streets, or neighborhoods — with relation like "near", "behind", "in front of" when stated.
- primaryIntent: ask_price only when the buyer asks the price or cost (b9addech, soum, prix, شحال). ask_stock when they ask availability (mawjoud, mazel mawjoud, famma menou, متوفر, disponible). bargain when they propose a lower price or ask for a discount without naming the price question.
- flags.insult: true for insults/abuse toward the seller or products. flags.wantsHuman: buyer explicitly asks for a person. flags.offTopic: unrelated to buying.
- Use null when a field is not stated. Never invent values.`;

export function applyDeterministicFallbacks(
  text: string,
  base: Understanding,
  expectingSize = false,
): Understanding {
  const cleanText = text === "(image only, no text)" ? "" : text;
  const refinedIntent = refinePrimaryIntent(cleanText, base.primaryIntent) as Understanding["primaryIntent"];
  const extractedSize = base.size ? base.size.trim().toUpperCase() : extractSize(cleanText, expectingSize);
  const extractedPhone = base.phone
    ? (normalizeTunisianPhone(base.phone) ?? extractPhone(cleanText))
    : extractPhone(cleanText);
  const extractedName = base.customerName?.trim() || extractCustomerName(cleanText);
  const extractedQty = base.quantity ?? extractQuantity(cleanText);
  const detLandmarks = extractLandmarks(cleanText);
  const landmarks = [...base.landmarks];
  for (const det of detLandmarks) {
    const detLower = det.name.toLowerCase();
    const alreadyPresent = landmarks.some((existing) => {
      const exLower = existing.name.toLowerCase();
      return exLower.includes(detLower) || detLower.includes(exLower);
    });
    if (!alreadyPresent && landmarks.length < 3) {
      landmarks.push(det);
    }
  }
  const landmarkText = landmarks.map((l) => l.name).join(" ");
  const govFromText = extractGovernorate(`${cleanText} ${landmarkText}`);
  const governorate = base.governorate ?? govFromText?.governorate ?? null;
  const delegation = base.delegation ?? govFromText?.delegation ?? null;
  // When the buyer states a specific delegation/suburb (e.g. "noskon fel Aouina")
  // without a separate POI yet, treat that suburb as a resolvable place anchor so
  // the map pin can still center on their neighborhood instead of looping.
  if (landmarks.length === 0 && delegation && /\b(?:noskon|askon|sakna|saken|j['’]habite|habite|adresse|darna|dari|livraison|بلاصة|نسكن|حي|cit[eé])\b/i.test(cleanText)) {
    landmarks.push({ name: delegation, relation: "in" });
  }
  const building = extractBuildingDetails(cleanText);
  const floor = base.floor ?? building.floor;
  const driverNote = base.driverNote ?? building.driverNote;
  const counterOfferMillimes = base.counterOfferMillimes ?? parseMoneyMillimes(cleanText);
  const parsedChange = parseOrderChange(cleanText);
  const assistance = detectAssistanceIntent(cleanText);
  const deterministicChange = parsedChange
    ? {
        target: parsedChange.target,
        operation: parsedChange.operation,
        value: parsedChange.value ?? null,
        itemIndex: null,
      }
    : null;
  const change = base.change ?? deterministicChange;
  let intent = refinedIntent;
  if (parsedChange?.operation === "cancel") intent = "cancel_order";
  else if (parsedChange?.target === "item" && parsedChange.operation === "add") intent = "add_item";
  else if (parsedChange?.target === "item" && parsedChange.operation === "remove") intent = "remove_item";
  else if (parsedChange) intent = /(mouch|ghlot)/i.test(cleanText) ? "correction" : "change_order";
  else if (assistance) intent = assistance;
  const extractedColor = base.color ?? extractColor(cleanText);

  return {
    ...base,
    change,
    color: extractedColor,
    primaryIntent:
      intent === "other" && (extractedSize || governorate || landmarks.length > 0 || extractedPhone || extractedName)
        ? "order"
        : intent,
    size: extractedSize,
    customerName: extractedName,
    phone: extractedPhone,
    quantity: extractedQty,
    governorate,
    delegation,
    landmarks,
    floor,
    driverNote,
    counterOfferMillimes,
  };
}

const GREETING_ONLY =
  /^(?:ahla|ahlan|marhba|merhba|mar7ba|salut|bonjour|hello|hi|hey|slm|salem|salam|cc|coucou)(?:\s+(?:bik|bikoum|cv))?[!.?\s]*$/i;

/**
 * Slot fills and bare greetings don't need a model round trip. Product,
 * price, stock, and address messages still go through Spark.
 */
export function fastPathUnderstanding(text: string, expectingSize = false): Understanding | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 80) return null;
  if (parseOrderChange(trimmed) || detectAssistanceIntent(trimmed)) {
    return applyDeterministicFallbacks(trimmed, EMPTY_UNDERSTANDING, expectingSize);
  }
  if (
    /(b9addech|b9adech|soum|prix|mawjoud|na9es|n9es|ghali|hoodie|sweat|robe|jacket|pantalon|dress|produit|taswira|photo|wilaya|landmark|pharmacie|café|cafe)/i.test(
      trimmed,
    )
  ) {
    return null;
  }
  if (extractLandmarks(trimmed).length > 0 || extractGovernorate(trimmed)) return null;

  if (GREETING_ONLY.test(trimmed)) {
    return applyDeterministicFallbacks(trimmed, { ...EMPTY_UNDERSTANDING, primaryIntent: "greeting" }, expectingSize);
  }

  const parsed = applyDeterministicFallbacks(trimmed, EMPTY_UNDERSTANDING, expectingSize);
  const slotHit = Boolean(parsed.size || parsed.phone || parsed.customerName || (parsed.quantity && parsed.quantity > 1));
  if (!slotHit) return null;
  return { ...parsed, primaryIntent: parsed.primaryIntent === "other" ? "order" : parsed.primaryIntent };
}

const EMPTY_UNDERSTANDING: Understanding = {
  primaryIntent: "other",
  change: null,
  samNounPhrase: null,
  productDescriptionEn: null,
  spatialHint: null,
  size: null,
  color: null,
  quantity: null,
  customerName: null,
  phone: null,
  governorate: null,
  delegation: null,
  landmarks: [],
  floor: null,
  driverNote: null,
  discountAskPercent: null,
  counterOfferMillimes: null,
  flags: { offTopic: false, insult: false, wantsHuman: false },
};

export async function understand(req: {
  text: string;
  imageCount: number;
  /** Buyer images as data URLs — Spark vision identifies the garment in them. */
  images?: string[];
  expectingSize?: boolean;
  conversationId?: string;
  /** Compact current-draft snapshot (no ids/timestamps) for coreference like "el tani" / "mouch hedha". */
  context?: string;
}): Promise<Understanding> {
  const user = [
    `Buyer message (transcribed/typed): ${req.text}`,
    req.context ? `Current order draft: ${req.context}` : null,
    req.imageCount > 0
      ? `The buyer attached ${req.imageCount} image(s), included in this request. Identify the main clothing item worn/shown in the image (ignore phone UI, captions and other people if several) and fill samNounPhrase, productDescriptionEn, color and spatialHint from what you SEE, AND also fill size, quantity, governorate, landmarks, phone, customerName or counterOfferMillimes from the buyer message text if stated.`
      : "No image attached.",
  ].filter(Boolean).join("\n");
  try {
    const result = await sparkJson({
      schema: understandSchema,
      jsonSchema: understandJsonSchema,
      schemaName: "understand_turn",
      system: SYSTEM,
      user,
      images: req.images,
      conversationId: req.conversationId,
    });
    return applyDeterministicFallbacks(req.text, result, req.expectingSize);
  } catch {
    return applyDeterministicFallbacks(req.text, EMPTY_UNDERSTANDING, req.expectingSize);
  }
}
