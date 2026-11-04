import { z } from "zod";
import { sparkJson } from "@/lib/ai/spark";
import { extractBuildingDetails, extractGovernorate, extractLandmarks } from "@/lib/domain/derja";
import { landmarkQueryVariants } from "@/lib/domain/landmarks";

export const interpretedPlaceSchema = z.object({
  rawName: z.string().min(1).max(120),
  osmQueryFr: z.string().min(1).max(140),
  osmQueryAr: z.string().max(140).nullable(),
  category: z.enum([
    "pharmacy",
    "cafe",
    "restaurant",
    "mosque",
    "school",
    "university",
    "hospital",
    "supermarket",
    "mall",
    "station",
    "post_office",
    "bank",
    "municipality",
    "hotel",
    "street",
    "neighborhood",
    "other",
  ]),
  relation: z.enum(["near", "behind", "in front of", "next to", "between", "in"]).nullable(),
});

export const locationInterpretSchema = z.object({
  governorate: z.string().max(60).nullable(),
  delegation: z.string().max(80).nullable(),
  places: z.array(interpretedPlaceSchema).max(3),
  streetOrZone: z.string().max(140).nullable(),
  floor: z.string().max(60).nullable(),
  driverNote: z.string().max(240).nullable(),
});

export type LocationInterpretation = z.infer<typeof locationInterpretSchema>;

const nullableString = { type: ["string", "null"] };

const locationInterpretJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["governorate", "delegation", "places", "streetOrZone", "floor", "driverNote"],
  properties: {
    governorate: nullableString,
    delegation: nullableString,
    places: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rawName", "osmQueryFr", "osmQueryAr", "category", "relation"],
        properties: {
          rawName: { type: "string" },
          osmQueryFr: { type: "string" },
          osmQueryAr: nullableString,
          category: {
            type: "string",
            enum: [
              "pharmacy",
              "cafe",
              "restaurant",
              "mosque",
              "school",
              "university",
              "hospital",
              "supermarket",
              "mall",
              "station",
              "post_office",
              "bank",
              "municipality",
              "hotel",
              "street",
              "neighborhood",
              "other",
            ],
          },
          relation: {
            type: ["string", "null"],
            enum: ["near", "behind", "in front of", "next to", "between", "in", null],
          },
        },
      },
    },
    streetOrZone: nullableString,
    floor: nullableString,
    driverNote: nullableString,
  },
};

const LOCATION_SYSTEM = `You translate Tunisian buyer delivery location descriptions (written in Tunisian Derja Arabizi, Arabic script, French, or English) into canonical OpenStreetMap Tunisia search queries.
Return only the JSON schema. Rules:
- governorate: canonical Tunisian governorate name in French (e.g. "Tunis", "Ariana", "Ben Arous", "Manouba", "Nabeul", "Sousse", "Monastir", "Mahdia", "Sfax", "Bizerte", "Kairouan", "Gabès", "Médenine", "Gafsa", "Tozeur", "Béja", "Jendouba", "Le Kef", "Siliana", "Zaghouan", "Kasserine", "Sidi Bouzid", "Tataouine", "Kébili") inferred from the city, suburb, or neighborhood when known; otherwise null.
- delegation: specific Tunisian delegation, suburb, or neighborhood in standard French spelling (e.g. "Ennasr", "El Manar", "La Marsa", "L'Aouina", "Les Berges du Lac", "Le Bardo", "Cité El Ghazala", "La Soukra", "El Mourouj", "Ezzahra", "Sahloul", "Khzema", "Sakiet Ezzit") when stated or implied; otherwise null.
- places: 1 to 3 distinct landmarks, POIs, streets, or neighborhoods mentioned by the buyer.
  - Convert Arabizi/Derja phonetic words into standard French OpenStreetMap Tunisia naming in osmQueryFr:
    - "9ahwet / kahwa / coffee shop" -> "Café ..."
    - "jema3 / jamaa / جامع" -> "Mosquée ..."
    - "bosta / بوسطة" -> "Bureau de Poste ..."
    - "klinik / sbitar" -> "Clinique ..." or "Hôpital ..."
    - "chera3 / شارع" -> "Avenue ..." or "Rue ..."
    - "7ay / حي" -> "Cité ..."
    - "baladiya / بلدية" -> "Municipalité ..."
    - "koucha" -> "Boulangerie ..."
  - Keep osmQueryFr concise (2 to 6 words, no conversational filler, no "ba7dha" or "près de").
  - Provide osmQueryAr in Arabic script when helpful (e.g. "جامع مالك بن أنس"), otherwise null.
- streetOrZone: street, avenue, route, or cité name in standard French if stated; otherwise null.
- floor: apartment or floor if stated (e.g. "2ème étage"); otherwise null.
- driverNote: building name, door color, or courier directions if stated; otherwise null.
- Never invent places or coordinates.`;

function normalizeRelation(
  rel: string | null | undefined,
): "near" | "behind" | "in front of" | "next to" | "between" | "in" | null {
  if (!rel) return "near";
  if (rel === "behind" || rel === "in front of" || rel === "next to" || rel === "between" || rel === "in" || rel === "near") {
    return rel;
  }
  return "near";
}

/** Deterministic fallback when offline, in replay without a location cassette, or if Spark fails. */
export function deterministicLocationInterpretation(req: {
  description: string;
  governorate?: string | null;
  delegation?: string | null;
}): LocationInterpretation {
  const clean = req.description.trim();
  const loc = extractGovernorate(clean);
  const extracted = extractLandmarks(clean);
  const building = extractBuildingDetails(clean);
  const governorate = req.governorate ?? loc?.governorate ?? null;
  const delegation = req.delegation ?? loc?.delegation ?? null;

  const places = (extracted.length > 0 ? extracted : clean ? [{ name: clean.slice(0, 100), relation: "near" }] : [])
    .slice(0, 3)
    .map((item) => {
      const variants = landmarkQueryVariants(item.name);
      const osmQueryFr = variants[3] ?? variants[1] ?? variants[0] ?? item.name;
      return {
        rawName: item.name.slice(0, 120),
        osmQueryFr: osmQueryFr.slice(0, 140),
        osmQueryAr: /[\u0600-\u06FF]/.test(item.name) ? item.name.slice(0, 140) : null,
        category: "other" as const,
        relation: normalizeRelation(item.relation),
      };
    });

  return {
    governorate,
    delegation,
    places,
    streetOrZone: delegation,
    floor: building.floor,
    driverNote: building.driverNote,
  };
}

/**
 * Uses Meta Muse Spark (via cassette + trace + zod validation) to normalize
 * free-form buyer location descriptions into clean OSM search queries, falling
 * back deterministically so replay mode or network hiccups never fail a turn.
 */
export async function interpretLocationDescription(req: {
  description: string;
  governorate?: string | null;
  delegation?: string | null;
  conversationId?: string;
}): Promise<{ interpretation: LocationInterpretation; aiUsed: boolean }> {
  const trimmed = req.description.trim();
  const fallback = deterministicLocationInterpretation(req);
  if (!trimmed) return { interpretation: fallback, aiUsed: false };

  const user = [
    `Buyer location description: ${trimmed}`,
    `Known governorate slot: ${req.governorate ?? "unknown"}`,
    `Known delegation slot: ${req.delegation ?? "unknown"}`,
  ].join("\n");

  try {
    const parsed = await sparkJson({
      schema: locationInterpretSchema,
      jsonSchema: locationInterpretJsonSchema,
      schemaName: "location_interpret",
      system: LOCATION_SYSTEM,
      user,
      conversationId: req.conversationId,
    });
    return {
      aiUsed: true,
      interpretation: {
        // Trust order: explicit slot / deterministic gazetteer (fallback)
        // beats Spark's inferred governorate and delegation.
        governorate: fallback.governorate ?? parsed.governorate,
        delegation: fallback.delegation ?? parsed.delegation,
        places: parsed.places.length > 0 ? parsed.places : fallback.places,
        streetOrZone: parsed.streetOrZone ?? fallback.streetOrZone,
        floor: parsed.floor ?? fallback.floor,
        driverNote: parsed.driverNote ?? fallback.driverNote,
      },
    };
  } catch {
    return { interpretation: fallback, aiUsed: false };
  }
}

