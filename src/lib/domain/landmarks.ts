import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Landmark resolution core (SPEC "Address and pin"; pin page lands Day 5).
 *
 * Chain: query variants -> `search_landmarks` (unaccent + pg_trgm over name
 * and aliases) -> threshold + rank -> triangulation when two landmarks are
 * named (closest candidate pair) -> optional Nominatim fallback -> misses
 * logged to `landmark_misses`. The RPC returns its 5 nearest names with no
 * minimum score, so the threshold here is what rejects unknown places.
 */

export const LANDMARK_MIN_SCORE = 0.35;

export interface LandmarkCandidate {
  id: string;
  name: string;
  governorate: string | null;
  delegation: string | null;
  lat: number;
  lng: number;
  score: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const RELATION_PREFIXES = [
  "près de",
  "pres de",
  "à côté de",
  "a cote de",
  "derrière",
  "derriere",
  "devant",
  "en face de",
  "ba7dha",
  "bahdha",
  "9rib le",
  "9rib l",
  "9rib men",
  "9rib",
  "wra",
  "9oddem",
  "بجانب",
  "قرب",
  "بحذا",
  "وراء",
  "قدام",
];

const PLACE_SYNONYM_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /\b(?:coffee\s*shop|coffeeshop|coffee|9ahwet|9ahwa|kahwet|kahwa|qahwet|qahwa|salon\s*de\s*thé|salon\s*de\s*the)\b|قهوة|مقهى/gi,
    replacement: "café",
  },
  { pattern: /\b(?:jamaa|jema3|jama3|mosque)\b|جامع|مسجد/gi, replacement: "mosquée" },
  { pattern: /\b(?:bosta|bousta|post\s*office)\b|بوسطة|بريد/gi, replacement: "poste" },
  { pattern: /\b(?:sbitar|hopital|hospital)\b|سبيطار|مستشفى|مصحة/gi, replacement: "clinique" },
  { pattern: /\b(?:kiosque|station\s*essence|gas\s*station)\b/gi, replacement: "station" },
  { pattern: /\b(?:supermarket|mall|centre\s*commercial)\b/gi, replacement: "supermarché" },
];

const PLACE_PREFIX_STRIP =
  /^(?:café|cafe|coffee\s*shop|coffeeshop|coffee|9ahwet|9ahwa|kahwet|kahwa|qahwet|qahwa|salon\s*de\s*thé|salon\s*de\s*the|قهوة|مقهى|restaurant|resto|pizzeria|pâtisserie|patisserie|salle\s*de\s*sport|gym|boutique|magasin|supermarché|supermarche|mall|hôtel|hotel)\s+/i;

/**
 * Query variants tried in order against `search_landmarks` and Nominatim:
 * the raw mention, a cleaned form (relation prefixes and punctuation removed),
 * a diacritic-free lowercase form, a synonym-normalized form (e.g. "9ahwet" /
 * "coffee shop" -> "café" / "cafe"), and the core place name.
 */
export function landmarkQueryVariants(query: string): string[] {
  const raw = query.trim().replace(/\s+/g, " ");
  let cleaned = raw.toLowerCase();
  for (const prefix of RELATION_PREFIXES) {
    if (cleaned.startsWith(`${prefix} `)) cleaned = cleaned.slice(prefix.length + 1).trim();
  }
  cleaned = cleaned.replace(/[.,;:!?]+$/g, "").trim();
  const plain = stripDiacritics(cleaned);

  let normalized = cleaned;
  for (const { pattern, replacement } of PLACE_SYNONYM_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  normalized = normalized.replace(/\s+/g, " ").trim();
  const normalizedPlain = stripDiacritics(normalized);

  const core = normalizedPlain.replace(PLACE_PREFIX_STRIP, "").trim();

  const variants = [
    raw,
    cleaned,
    plain,
    normalized,
    normalizedPlain,
    core.length >= 3 ? core : "",
  ].filter(Boolean);
  return [...new Set(variants)];
}

const LANDMARK_STOPWORDS = new Set(["de", "el", "la", "le", "les", "du", "des", "the"]);

/** Significant tokens of a landmark name (diacritic-free, stopwords dropped). */
function landmarkTokens(name: string): Set<string> {
  const plain = stripDiacritics(name.toLowerCase())
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return new Set(plain.split(" ").filter((t) => t && !LANDMARK_STOPWORDS.has(t)));
}

/**
 * True when two landmark names plausibly denote the same place: equal
 * significant-token sets, or one contained in the other (e.g. a buyer typing
 * "pharmacie el manar" for the stored "Pharmacie de Nuit El Manar"). Used to
 * decide whether a previously confirmed pin may be reused for the address
 * the buyer just stated — never to resolve a new address.
 */
export function landmarkNamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ta = landmarkTokens(a);
  const tb = landmarkTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  return [...small].every((t) => large.has(t));
}

/** True when any buyer-stated landmark matches a confirmed address landmark. */
export function landmarkMatchesAny(statedNames: string[], confirmedLandmark: string | null | undefined): boolean {
  return statedNames.some((name) => landmarkNamesMatch(name, confirmedLandmark));
}

/** Keeps candidates at or above the score threshold, best first. */
export function rankLandmarks(candidates: LandmarkCandidate[]): LandmarkCandidate[] {
  return candidates
    .filter((c) => c.score >= LANDMARK_MIN_SCORE)
    .sort((a, b) => b.score - a.score);
}

export interface LandmarkPair {
  a: LandmarkCandidate;
  b: LandmarkCandidate;
  distanceKm: number;
  midpoint: LatLng;
}

/**
 * Triangulation: when the buyer names two landmarks, the likeliest pair is
 * the closest one across both candidate lists; its midpoint centres the pin.
 */
export function triangulate(
  first: LandmarkCandidate[],
  second: LandmarkCandidate[],
): LandmarkPair | null {
  let best: LandmarkPair | null = null;
  for (const a of first) {
    for (const b of second) {
      if (a.id === b.id) continue;
      const distanceKm = haversineKm(a, b);
      if (!best || distanceKm < best.distanceKm) {
        best = {
          a,
          b,
          distanceKm,
          midpoint: { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 },
        };
      }
    }
  }
  return best;
}

interface LandmarkRpcRow {
  id: string;
  name: string;
  governorate: string | null;
  delegation: string | null;
  lat: number;
  lng: number;
  score: number;
}

async function searchVariantsOnce(
  supabase: AdminClient,
  query: string,
  governorate?: string | null,
  k = 5,
): Promise<LandmarkCandidate[]> {
  const byId = new Map<string, LandmarkCandidate>();
  for (const variant of landmarkQueryVariants(query)) {
    const { data, error } = await supabase.rpc("search_landmarks", {
      p_query: variant,
      p_governorate: governorate ?? null,
      p_k: k,
    });
    if (error) throw new Error(`search_landmarks failed: ${error.message}`);
    for (const row of (data ?? []) as LandmarkRpcRow[]) {
      const candidate: LandmarkCandidate = {
        id: row.id,
        name: row.name,
        governorate: row.governorate,
        delegation: row.delegation,
        lat: row.lat,
        lng: row.lng,
        score: row.score,
      };
      const existing = byId.get(candidate.id);
      if (!existing || candidate.score > existing.score) byId.set(candidate.id, candidate);
    }
  }
  return rankLandmarks([...byId.values()]);
}

async function searchVariants(
  supabase: AdminClient,
  query: string,
  governorate?: string | null,
  k = 5,
): Promise<LandmarkCandidate[]> {
  const strict = await searchVariantsOnce(supabase, query, governorate, k);
  if (strict.length > 0 || !governorate) return strict;
  // Cross-governorate fallback (e.g. buyer says "Tunis" for a café in Ennasr/Ariana or Ben Arous).
  return searchVariantsOnce(supabase, query, null, k);
}

async function logMiss(
  supabase: AdminClient,
  query: string,
  governorate?: string | null,
  conversationId?: string,
): Promise<void> {
  try {
    await supabase.from("landmark_misses").insert({
      conversation_id: conversationId ?? null,
      query,
      governorate: governorate ?? null,
    });
  } catch {
    // Coverage logging must never break a turn.
  }
}

export type NominatimFn = (query: string, governorate?: string | null) => Promise<LatLng | null>;

const TUNISIA_CENTRES: Record<string, LatLng> = {
  tunis: { lat: 36.8065, lng: 10.1815 },
  ariana: { lat: 36.8625, lng: 10.1956 },
  "ben arous": { lat: 36.7531, lng: 10.2189 },
  manouba: { lat: 36.8081, lng: 10.0972 },
  nabeul: { lat: 36.4561, lng: 10.7376 },
  zaghouan: { lat: 36.4029, lng: 10.1429 },
  bizerte: { lat: 37.2744, lng: 9.8739 },
  beja: { lat: 36.7256, lng: 9.1817 },
  jendouba: { lat: 36.5011, lng: 8.7802 },
  "le kef": { lat: 36.1742, lng: 8.7049 },
  siliana: { lat: 36.0849, lng: 9.3708 },
  sousse: { lat: 35.8256, lng: 10.6369 },
  monastir: { lat: 35.7643, lng: 10.8113 },
  mahdia: { lat: 35.5047, lng: 11.0622 },
  sfax: { lat: 34.7406, lng: 10.7603 },
  kairouan: { lat: 35.6781, lng: 10.0963 },
  kasserine: { lat: 35.1676, lng: 8.8365 },
  "sidi bouzid": { lat: 35.0382, lng: 9.4849 },
  gabes: { lat: 33.8815, lng: 10.0982 },
  medenine: { lat: 33.3549, lng: 10.5055 },
  tataouine: { lat: 32.9297, lng: 10.4518 },
  gafsa: { lat: 34.425, lng: 8.7842 },
  tozeur: { lat: 33.9197, lng: 8.1335 },
  kebili: { lat: 33.7044, lng: 8.969 },
};

async function fetchNominatimOne(q: string): Promise<LatLng | null> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&countrycodes=tn&limit=1&q=${encodeURIComponent(q)}`,
    { headers: { "User-Agent": "Wassalha/1.0 (hackathon demo)" } },
  );
  if (!response.ok) return null;
  const results = (await response.json()) as Array<{ lat: string; lon: string }>;
  if (!results[0]) return null;
  return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
}

/**
 * OpenStreetMap Nominatim search across normalized query variants (coffee shops,
 * cafés, restaurants, shops, streets, neighborhoods) with a Tunisian governorate
 * centre fallback so any valid place name produces a usable map pin.
 */
export const nominatimSearch: NominatimFn = async (query, governorate) => {
  const variants = landmarkQueryVariants(query);
  const queriesToTry: string[] = [];
  for (const v of variants.slice(0, 4)) {
    if (governorate) queriesToTry.push(`${v}, ${governorate}, Tunisie`);
    queriesToTry.push(`${v}, Tunisie`);
  }
  const uniqueQueries = [...new Set(queriesToTry)];
  for (const q of uniqueQueries.slice(0, 5)) {
    const hit = await fetchNominatimOne(q).catch(() => null);
    if (hit) return hit;
  }
  if (governorate) {
    const govHit = await fetchNominatimOne(`${governorate}, Tunisie`).catch(() => null);
    if (govHit) return govHit;
    const key = stripDiacritics(governorate.toLowerCase().trim());
    if (TUNISIA_CENTRES[key]) return TUNISIA_CENTRES[key];
  }
  return null;
};

/**
 * Resolves one landmark mention. Returns ranked candidates (possibly empty);
 * an empty result is logged to `landmark_misses`. When a `nominatim`
 * function is injected and the snapshot has no match, its hit is returned
 * as a synthetic candidate so the pin can still be centred.
 */
export async function resolveLandmark(
  supabase: AdminClient,
  req: {
    query: string;
    governorate?: string | null;
    conversationId?: string;
    nominatim?: NominatimFn;
  },
): Promise<LandmarkCandidate[]> {
  const candidates = await searchVariants(supabase, req.query, req.governorate);
  if (candidates.length > 0) return candidates;
  if (req.nominatim) {
    const hit = await req.nominatim(req.query, req.governorate).catch(() => null);
    if (hit) {
      return [
        {
          id: "nominatim",
          name: req.query,
          governorate: req.governorate ?? null,
          delegation: null,
          lat: hit.lat,
          lng: hit.lng,
          score: 1,
        },
      ];
    }
  }
  await logMiss(supabase, req.query, req.governorate, req.conversationId);
  return [];
}

/** Resolves two named landmarks and triangulates the closest candidate pair. */
export async function resolveLandmarkPair(
  supabase: AdminClient,
  req: {
    queries: [string, string];
    governorate?: string | null;
    conversationId?: string;
  },
): Promise<LandmarkPair | null> {
  const [first, second] = await Promise.all([
    searchVariants(supabase, req.queries[0], req.governorate),
    searchVariants(supabase, req.queries[1], req.governorate),
  ]);
  const pair = triangulate(first, second);
  if (!pair) {
    await logMiss(
      supabase,
      `${req.queries[0]} + ${req.queries[1]}`,
      req.governorate,
      req.conversationId,
    );
  }
  return pair;
}
