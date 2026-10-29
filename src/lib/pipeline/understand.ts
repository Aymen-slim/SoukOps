import { z } from "zod";
import { sparkJson } from "@/lib/ai/spark";

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
    "other",
  ]),
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
    "primaryIntent", "samNounPhrase", "productDescriptionEn", "spatialHint", "size", "color",
    "quantity", "customerName", "phone", "governorate", "delegation", "landmarks", "floor",
    "driverNote", "discountAskPercent", "counterOfferMillimes", "flags",
  ],
  properties: {
    primaryIntent: {
      type: "string",
      enum: ["order", "bargain", "ask_price", "ask_stock", "greeting", "complaint", "human_request", "off_topic", "other"],
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

const SYSTEM = `You extract structured order information from Tunisian Derja (Arabic script or Arabizi) buyer messages for a clothing seller.
Return only the JSON schema. Rules:
- samNounPhrase: short English clothing category only (e.g. "hoodie", "dress"), never a brand or product name.
- productDescriptionEn: very short English description with color if known (e.g. "black hoodie"), for embedding search. Keep it under 8 words.
- counterOfferMillimes: convert Derja money to integer millimes (1 DT = 1000). "170 alf" = 170000. "malyoun" = 1000000.
- landmarks: places the buyer mentions as address references, with relation like "near", "behind", "in front of" when stated.
- flags.insult: true for insults/abuse toward the seller or products. flags.wantsHuman: buyer explicitly asks for a person. flags.offTopic: unrelated to buying.
- Use null when a field is not stated. Never invent values.`;

export async function understand(req: {
  text: string;
  imageCount: number;
  /** Buyer images as data URLs — Spark vision identifies the garment in them. */
  images?: string[];
  conversationId?: string;
}): Promise<Understanding> {
  const user = [
    `Buyer message (transcribed/typed): ${req.text}`,
    req.imageCount > 0
      ? `The buyer attached ${req.imageCount} image(s), included in this request. Identify the main clothing item worn/shown in the image (ignore phone UI, captions and other people if several) and fill samNounPhrase, productDescriptionEn, color and spatialHint from what you SEE.`
      : "No image attached.",
  ].join("\n");
  return sparkJson({
    schema: understandSchema,
    jsonSchema: understandJsonSchema,
    schemaName: "understand_turn",
    system: SYSTEM,
    user,
    images: req.images,
    conversationId: req.conversationId,
  });
}
