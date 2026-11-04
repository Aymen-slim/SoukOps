import { getServerEnv } from "@/lib/env";
import { governoratePoint, inTunisiaBounds, localityPoint, lookupLocality } from "@/lib/geo/tunisia";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Landmark resolution core (SPEC "Address and pin"; upgraded with multi-variant
 * Derja/Arabizi normalization, geo-ranked multi-candidate Nominatim search,
 * cross-source triangulation, and 95+ Tunisian neighborhood centroids).
 *
 * Chain: query variants -> `search_landmarks` (unaccent + pg_trgm over name
 * and aliases) -> threshold + rank -> triangulation when two landmarks are
 * named (closest candidate pair) -> geo-ranked Nominatim + locality fallback
 * -> misses logged to `landmark_misses`.
 */

export const LANDMARK_MIN_SCORE = 0.35;
export const MAX_TRIANGULATION_KM = 12;

export interface LandmarkCandidate {
  id: string;
  name: string;
  governorate: string | null;
  delegation: string | null;
  lat: number;
  lng: number;
  score: number;
  source?: "snapshot" | "nominatim" | "ai_osm" | "neighborhood" | "google";
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
  "entre",
  "ba7dha",
  "bahdha",
  "9rib mel",
  "9rib le",
  "9rib l",
  "9rib men",
  "9rib",
  "wra",
  "9oddem",
  "bin",
  "بجانب",
  "قرب",
  "بحذا",
  "وراء",
  "ورا",
  "قدام",
  "مقابل",
  "بين",
];

const PLACE_SYNONYM_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /\b(?:coffee\s*shop|coffeeshop|coffee|9ahwet|9ahwa|kahwet|kahwa|qahwet|qahwa|salon\s*de\s*thé|salon\s*de\s*the)\b|قهوة|مقهى/gi,
    replacement: "café",
  },
  { pattern: /\b(?:jamaa|jema3|jama3|mosque)\b|جامع|مسجد/gi, replacement: "mosquée" },
  { pattern: /\b(?:bosta|bousta|post\s*office)\b|بوسطة|بريد/gi, replacement: "poste" },
  { pattern: /\b(?:sbitar|hopital|hospital|klinik)\b|سبيطار|مستشفى|مصحة/gi, replacement: "clinique" },
  { pattern: /\b(?:farmasi|pharmacy)\b|صيدلية/gi, replacement: "pharmacie" },
  { pattern: /\b(?:kiosque|station\s*essence|gas\s*station)\b/gi, replacement: "station" },
  { pattern: /\b(?:supermarket|mall|centre\s*commercial)\b/gi, replacement: "supermarché" },
  { pattern: /\b(?:chera3|chere3)\b|شارع/gi, replacement: "avenue" },
  { pattern: /\b(?:nahj)\b|نهج/gi, replacement: "rue" },
  { pattern: /\b(?:tri9)\b|طريق/gi, replacement: "route" },
  { pattern: /\b(?:7ay|hay)\b|حي/gi, replacement: "cité" },
  { pattern: /\b(?:baladiya)\b|بلدية/gi, replacement: "municipalité" },
  { pattern: /\b(?:koucha)\b|مخبزة/gi, replacement: "boulangerie" },
];

const PLACE_PREFIX_STRIP =
  /^(?:café|cafe|coffee\s*shop|coffeeshop|coffee|9ahwet|9ahwa|kahwet|kahwa|qahwet|qahwa|salon\s*de\s*thé|salon\s*de\s*the|قهوة|مقهى|pharmacie|mosquée|mosquee|clinique|restaurant|resto|pizzeria|pâtisserie|patisserie|boulangerie|salle\s*de\s*sport|gym|boutique|magasin|supermarché|supermarche|mall|hôtel|hotel|municipalité|municipalite)\s+/i;

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
  cleaned = cleaned.replace(/[.,;:!?؟]+$/g, "").trim();
  const plain = stripDiacritics(cleaned);

  let normalized = cleaned;
  for (const { pattern, replacement } of PLACE_SYNONYM_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  normalized = normalized.replace(/\s+/g, " ").trim();
  const normalizedPlain = stripDiacritics(normalized);

  const core = normalizedPlain.replace(PLACE_PREFIX_STRIP, "").trim();
  const streetAlt = normalizedPlain.startsWith("avenue ")
    ? normalizedPlain.replace(/^avenue\s+/, "rue ")
    : normalizedPlain.startsWith("rue ")
      ? normalizedPlain.replace(/^rue\s+/, "avenue ")
      : "";

  const variants = [
    raw,
    cleaned,
    plain,
    normalized,
    normalizedPlain,
    streetAlt,
    core.length >= 3 ? core : "",
  ].filter(Boolean);
  return [...new Set(variants)];
}

const LANDMARK_STOPWORDS = new Set(["de", "el", "la", "le", "les", "du", "des", "the", "al", "ben", "ibn"]);

/** Significant tokens of a landmark name (diacritic-free, stopwords dropped). */
function landmarkTokens(name: string): Set<string> {
  const plain = stripDiacritics(name.toLowerCase())
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, " ")
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
  maxDistanceKm?: number,
): LandmarkPair | null {
  let best: LandmarkPair | null = null;
  for (const a of first) {
    for (const b of second) {
      if (a.id === b.id && a.id !== "nominatim") continue;
      if (Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6) continue;
      const distanceKm = haversineKm(a, b);
      if (maxDistanceKm !== undefined && distanceKm > maxDistanceKm) continue;
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
  const variants = landmarkQueryVariants(query).slice(0, 5);
  const responses = await Promise.all(
    variants.map((variant) =>
      supabase.rpc("search_landmarks", {
        p_query: variant,
        p_governorate: governorate ?? null,
        p_k: k,
      }),
    ),
  );
  for (const { data, error } of responses) {
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
        source: "snapshot",
      };
      const existing = byId.get(candidate.id);
      if (!existing || candidate.score > existing.score) byId.set(candidate.id, candidate);
    }
  }
  return rankLandmarks([...byId.values()]);
}

export async function searchLandmarkSnapshot(
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

interface NominatimRawHit {
  place_id?: number;
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  importance?: number;
  address?: {
    suburb?: string;
    neighbourhood?: string;
    city_district?: string;
    city?: string;
    town?: string;
    municipality?: string;
    state?: string;
  };
}

const nominatimCache = new Map<string, { expiresAt: number; hits: NominatimRawHit[] }>();
const NOMINATIM_TTL_MS = 10 * 60 * 1000;

async function fetchNominatimRaw(q: string, anchor?: LatLng | null): Promise<NominatimRawHit[]> {
  const cacheKey = `${q.toLowerCase()}|${anchor ? `${anchor.lat.toFixed(2)},${anchor.lng.toFixed(2)}` : ""}`;
  const cached = nominatimCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.hits;

  const params = new URLSearchParams({
    format: "jsonv2",
    countrycodes: "tn",
    addressdetails: "1",
    limit: "5",
    q,
  });
  if (anchor) {
    // Soft bias box (~28km around local anchor) without bounded=1 so national hits still work if needed.
    const d = 0.25;
    params.set(
      "viewbox",
      `${(anchor.lng - d).toFixed(4)},${(anchor.lat + d).toFixed(4)},${(anchor.lng + d).toFixed(4)},${(anchor.lat - d).toFixed(4)}`,
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_800);
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        "User-Agent": "Wassalha/1.1 (Tunisian social commerce delivery pin)",
        "Accept-Language": "fr,ar,en",
      },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const rows = (await response.json()) as NominatimRawHit[];
    const valid = Array.isArray(rows)
      ? rows.filter((r) => inTunisiaBounds(Number(r.lat), Number(r.lon)))
      : [];
    nominatimCache.set(cacheKey, { expiresAt: Date.now() + NOMINATIM_TTL_MS, hits: valid });
    return valid;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function cleanDisplayLabel(hit: NominatimRawHit, fallbackQuery: string): string {
  const parts = (hit.display_name ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !/^(?:tunisie|tunisia|تونس|\d{4})$/i.test(s));
  const title = hit.name?.trim() || parts[0] || fallbackQuery;
  const area =
    hit.address?.suburb ||
    hit.address?.neighbourhood ||
    hit.address?.city_district ||
    hit.address?.municipality ||
    hit.address?.town ||
    hit.address?.city ||
    parts[1];
  if (area && !title.toLowerCase().includes(area.toLowerCase())) {
    return `${title}, ${area}`;
  }
  return title;
}

/**
 * Multi-candidate OpenStreetMap search ranked deterministically by token
 * overlap and geographic proximity to the buyer's delegation / governorate.
 */
export async function searchNominatimCandidates(req: {
  queries: string[];
  governorate?: string | null;
  delegation?: string | null;
  source?: "nominatim" | "ai_osm";
}): Promise<LandmarkCandidate[]> {
  const localHit = lookupLocality([req.delegation, req.governorate, ...req.queries].filter(Boolean).join(" "));
  const effectiveGov = req.governorate ?? localHit?.governorate ?? null;
  const effectiveDel = req.delegation ?? localHit?.delegation ?? null;
  const anchor = localityPoint(effectiveDel, effectiveGov);

  const queryPool: string[] = [];
  for (const rawQ of req.queries) {
    for (const v of landmarkQueryVariants(rawQ).slice(0, 4)) {
      if (effectiveDel && !v.toLowerCase().includes(effectiveDel.toLowerCase())) {
        queryPool.push(`${v}, ${effectiveDel}, Tunisie`);
      }
      if (effectiveGov && !v.toLowerCase().includes(effectiveGov.toLowerCase())) {
        queryPool.push(`${v}, ${effectiveGov}, Tunisie`);
      }
      queryPool.push(`${v}, Tunisie`);
    }
  }
  const uniqueQueries = [...new Set(queryPool)].slice(0, 6);
  const queryTokens = landmarkTokens(req.queries.join(" "));

  const scored = new Map<string, LandmarkCandidate>();

  // Run the top 2 queries in parallel first; only try remaining queries if empty.
  const batches = [uniqueQueries.slice(0, 2), uniqueQueries.slice(2, 6)];
  for (const batch of batches) {
    if (batch.length === 0) continue;
    const batchResults = await Promise.all(batch.map((q) => fetchNominatimRaw(q, anchor)));
    for (const hits of batchResults) {
      for (const hit of hits) {
        const lat = Number(hit.lat);
        const lng = Number(hit.lon);
        if (!inTunisiaBounds(lat, lng)) continue;

        const label = cleanDisplayLabel(hit, req.queries[0] ?? "Location");
        const hitTokens = landmarkTokens(`${hit.name ?? ""} ${hit.display_name ?? ""}`);
        let overlap = 0;
        for (const t of queryTokens) {
          if (hitTokens.has(t)) overlap += 1;
        }
        const tokenScore = queryTokens.size > 0 ? overlap / queryTokens.size : 0.5;

        let geoBoost = 0;
        if (anchor) {
          const distKm = haversineKm({ lat, lng }, anchor);
          if (distKm <= 4) geoBoost = 0.3;
          else if (distKm <= 12) geoBoost = 0.2;
          else if (distKm <= 30) geoBoost = 0.08;
          else if (distKm > 65) geoBoost = -0.35;
        }

        const score = Math.max(0.36, Math.min(0.99, 0.52 + tokenScore * 0.3 + geoBoost));
        const key = `${lat.toFixed(4)}:${lng.toFixed(4)}`;
        const detectedLoc = lookupLocality(hit.display_name ?? "");
        const candidate: LandmarkCandidate = {
          id: hit.place_id ? `osm-${hit.place_id}` : "nominatim",
          name: label,
          governorate: detectedLoc?.governorate ?? effectiveGov,
          delegation: detectedLoc?.delegation ?? effectiveDel,
          lat,
          lng,
          score,
          source: req.source ?? "nominatim",
        };
        const prev = scored.get(key);
        if (!prev || candidate.score > prev.score) scored.set(key, candidate);
      }
    }
    if (scored.size > 0) break;
  }

  if (scored.size > 0) {
    return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, 5);
  }

  // Exact Tunisian delegation/neighborhood centroid fallback (much tighter than governorate center!)
  if (localHit?.delegation) {
    return [
      {
        id: `locality-${stripDiacritics(localHit.delegation.toLowerCase()).replace(/\s+/g, "-")}`,
        name: `${localHit.delegation}, ${localHit.governorate}`,
        governorate: localHit.governorate,
        delegation: localHit.delegation,
        lat: localHit.lat,
        lng: localHit.lng,
        score: 0.55,
        source: "neighborhood",
      },
    ];
  }

  if (effectiveGov) {
    const govHit = await fetchNominatimRaw(`${effectiveGov}, Tunisie`, null);
    if (govHit[0]) {
      return [
        {
          id: "nominatim",
          name: effectiveGov,
          governorate: effectiveGov,
          delegation: null,
          lat: Number(govHit[0].lat),
          lng: Number(govHit[0].lon),
          score: 0.45,
          source: "neighborhood",
        },
      ];
    }
    const center = governoratePoint(effectiveGov);
    if (center) {
      return [
        {
          id: "nominatim",
          name: effectiveGov,
          governorate: effectiveGov,
          delegation: null,
          lat: center.lat,
          lng: center.lng,
          score: 0.4,
          source: "neighborhood",
        },
      ];
    }
  }

  return [];
}

/**
 * OpenStreetMap Nominatim search across normalized query variants (coffee shops,
 * cafés, restaurants, shops, streets, neighborhoods) with a Tunisian locality /
 * governorate centre fallback so any valid place name produces a usable map pin.
 */
export const nominatimSearch: NominatimFn = async (query, governorate) => {
  const candidates = await searchNominatimCandidates({
    queries: [query],
    governorate,
  });
  return candidates[0] ? { lat: candidates[0].lat, lng: candidates[0].lng } : null;
};

// ---------------------------------------------------------------- Google Places

interface GooglePlaceRaw {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
}

/** Distance tiers shared with the Nominatim ranker (see searchNominatimCandidates). */
function geoBoostForDistance(distKm: number): number {
  if (distKm <= 4) return 0.3;
  if (distKm <= 12) return 0.2;
  if (distKm <= 30) return 0.08;
  if (distKm > 65) return -0.35;
  return 0;
}

/**
 * Merges candidate lists (e.g. one per Google query variant) into one ranked
 * list: same place (same coordinates) keeps its best score. Pure.
 */
export function dedupeLandmarkCandidates(candidates: LandmarkCandidate[]): LandmarkCandidate[] {
  const byKey = new Map<string, LandmarkCandidate>();
  for (const c of candidates) {
    const key = `${c.lat.toFixed(4)}:${c.lng.toFixed(4)}`;
    const prev = byKey.get(key);
    if (!prev || c.score > prev.score) byKey.set(key, c);
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score);
}

/**
 * True when two named candidates score too closely for code to pick one
 * silently — the buyer must choose. Centroid fallbacks never compete.
 */
export function isAmbiguousPair(
  top: LandmarkCandidate | undefined,
  second: LandmarkCandidate | undefined,
): boolean {
  if (!top || !second || top.id === second.id) return false;
  if (second.source === "neighborhood") return false;
  if (Math.abs(top.lat - second.lat) < 1e-6 && Math.abs(top.lng - second.lng) < 1e-6) return false;
  // Google results are distance-ordered to the buyer's city: a same-named
  // branch kilometres away is not a real alternative, however it scored.
  if (top.source === "google" && haversineKm(top, second) > 3) return false;
  return top.score - second.score < 0.04;
}

/**
 * Parses a Google Places API (New) `places:searchText` response into ranked
 * candidates. Pure and deterministic: hits outside Tunisia are dropped, then
 * code re-ranks by Google relevance + name-token overlap + distance to the
 * buyer's city anchor, so the nearest credible match wins over a same-named
 * place in another governorate. Exported for unit tests.
 */
/** Generic place-type words: matching only these never proves a name match. */
const GENERIC_PLACE_TOKENS = new Set([
  "cafe",
  "coffee",
  "pharmacie",
  "mosquee",
  "mosque",
  "restaurant",
  "resto",
  "boulangerie",
  "patisserie",
  "clinique",
  "hopital",
  "hotel",
  "station",
  "rue",
  "avenue",
  "route",
  "boulevard",
  "cite",
  "municipalite",
  "poste",
  "banque",
  "ecole",
  "lycee",
  "universite",
  "supermarche",
  "mall",
  "salon",
  "مقهى",
  "قهوة",
  "صيدلية",
  "جامع",
  "مسجد",
  "شارع",
  "طريق",
]);

export function parseGooglePlacesResponse(
  body: unknown,
  fallback: { governorate?: string | null; delegation?: string | null } = {},
  opts: { anchor?: LatLng | null; query?: string } = {},
): LandmarkCandidate[] {
  const places = (body as { places?: GooglePlaceRaw[] } | null)?.places;
  if (!Array.isArray(places)) return [];
  const queryTokens = opts.query ? landmarkTokens(opts.query) : new Set<string>();
  const distinctiveTokens = new Set([...queryTokens].filter((t) => !GENERIC_PLACE_TOKENS.has(t)));
  const valid: Array<{ place: GooglePlaceRaw; lat: number; lng: number }> = [];
  const seen = new Set<string>();
  for (const place of places) {
    const lat = place.location?.latitude;
    const lng = place.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number" || !inTunisiaBounds(lat, lng)) continue;
    const key = `${lat.toFixed(4)}:${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push({ place, lat, lng });
  }
  const n = valid.length;
  const scored = valid.map(({ place, lat, lng }, i) => {
    const address = place.formattedAddress?.trim() ?? "";
    const detected = lookupLocality(address);
    const name = place.displayName?.text?.trim() || address.split(",")[0]?.trim() || "Google Maps place";
    const relevance = n <= 1 ? 1 : (n - i) / n;
    let tokenScore = 0.5;
    if (queryTokens.size > 0) {
      const hitTokens = landmarkTokens(`${name} ${address}`);
      let overlap = 0;
      for (const t of queryTokens) {
        if (hitTokens.has(t)) overlap += 1;
      }
      tokenScore = overlap / queryTokens.size;
    }
    const geoBoost = opts.anchor ? geoBoostForDistance(haversineKm({ lat, lng }, opts.anchor)) : 0;
    // Name gate: Google always returns *something* fuzzy. When the buyer
    // named a specific place, a hit sharing no distinctive (non-type) token
    // with the query is not that place — drop it so the caller can fall
    // back instead of pinning a random same-type shop.
    if (distinctiveTokens.size > 0) {
      const hitTokens = landmarkTokens(`${name} ${address}`);
      if (![...distinctiveTokens].some((t) => hitTokens.has(t))) return null;
    }
    const score = Math.round(Math.max(0.36, Math.min(0.99, 0.45 + relevance * 0.25 + tokenScore * 0.2 + geoBoost)) * 1000) / 1000;
    const candidate: LandmarkCandidate = {
      id: place.id ? `google-${place.id}` : `google-${lat.toFixed(4)}:${lng.toFixed(4)}`,
      name,
      governorate: detected?.governorate ?? fallback.governorate ?? null,
      delegation: detected?.delegation ?? fallback.delegation ?? null,
      lat,
      lng,
      score,
      source: "google",
    };
    const distanceKm = opts.anchor ? haversineKm({ lat, lng }, opts.anchor) : null;
    return { candidate, index: i, distanceKm };
  });
  const kept = scored.filter(
    (s): s is { candidate: LandmarkCandidate; index: number; distanceKm: number | null } => s !== null,
  );
  // With a city anchor, nearest credible match wins (the buyer's café is the
  // one in their city, not a famous same-named branch across town); score
  // only breaks ties. Without an anchor, Google relevance rules via score.
  kept.sort((a, b) => {
    if (a.distanceKm !== null && b.distanceKm !== null && Math.abs(a.distanceKm - b.distanceKm) > 0.5) {
      return a.distanceKm - b.distanceKm;
    }
    return b.candidate.score - a.candidate.score || a.index - b.index;
  });
  return kept.slice(0, 5).map((s) => s.candidate);
}

const googleCache = new Map<string, { expiresAt: number; candidates: LandmarkCandidate[] }>();
const GOOGLE_TTL_MS = 10 * 60 * 1000;

/**
 * Google Maps place search for the place a buyer describes (Places API (New)
 * text search, Tunisia-biased). Server-only key; returns [] when no key is
 * configured, in replay mode (cassettes must stay deterministic), or on any
 * Google failure — callers then fall back to OpenStreetMap, so a Google
 * outage can never break an address turn.
 */
export async function searchGooglePlaces(req: {
  queries: string[];
  governorate?: string | null;
  delegation?: string | null;
}): Promise<LandmarkCandidate[]> {
  const env = getServerEnv();
  const apiKey = env.GOOGLE_PLACES_API_KEY ?? env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || env.AI_MODE === "replay") return [];

  const anchor = localityPoint(req.delegation, req.governorate) ?? governoratePoint(req.governorate);
  const area = req.delegation ?? req.governorate ?? "Tunisie";

  // Merge up to 3 query variants (French / Arabic / raw) instead of taking
  // the first non-empty answer: code re-ranks the merged set by distance to
  // the buyer's city anchor, so the nearest credible place wins.
  const jobs = req.queries
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map(async (query): Promise<LandmarkCandidate[]> => {
      const textQuery = query.toLowerCase().includes(area.toLowerCase()) ? query : `${query}, ${area}, Tunisie`;
      const cacheKey = textQuery.toLowerCase();
      const cached = googleCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) return cached.candidates;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4_000);
      try {
        const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
          },
          body: JSON.stringify({
            textQuery,
            regionCode: "TN",
            languageCode: "fr",
            // Recall first (10 hits), then code keeps the 5 nearest ranked.
            maxResultCount: 10,
            ...(anchor
              ? {
                  locationBias: {
                    circle: {
                      center: { latitude: anchor.lat, longitude: anchor.lng },
                      radius: 20_000,
                    },
                  },
                }
              : {}),
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          // Never break the turn, but leave the reason in the server log
          // (e.g. 403 when Places API (New) is not enabled on the project).
          console.error(`[landmarks] Google Places search failed: HTTP ${response.status}`);
          return [];
        }
        const candidates = parseGooglePlacesResponse(await response.json().catch(() => null), req, {
          anchor,
          query,
        });
        googleCache.set(cacheKey, { expiresAt: Date.now() + GOOGLE_TTL_MS, candidates });
        return candidates;
      } catch {
        return [];
      } finally {
        clearTimeout(timeout);
      }
    });

  const lists = await Promise.all(jobs);
  const merged = dedupeLandmarkCandidates(lists.flat());
  if (anchor) {
    merged.sort((a, b) => haversineKm(a, anchor) - haversineKm(b, anchor) || b.score - a.score);
  }
  return merged.slice(0, 5);
}

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
    delegation?: string | null;
    conversationId?: string;
    nominatim?: NominatimFn;
  },
): Promise<LandmarkCandidate[]> {
  const candidates = await searchLandmarkSnapshot(supabase, req.query, req.governorate);
  if (candidates.length > 0) return candidates;
  if (req.nominatim === nominatimSearch) {
    const osm = await searchNominatimCandidates({
      queries: [req.query],
      governorate: req.governorate,
      delegation: req.delegation,
    });
    if (osm.length > 0) return osm;
  } else if (req.nominatim) {
    const hit = await req.nominatim(req.query, req.governorate).catch(() => null);
    if (hit) {
      return [
        {
          id: "nominatim",
          name: req.query,
          governorate: req.governorate ?? null,
          delegation: req.delegation ?? null,
          lat: hit.lat,
          lng: hit.lng,
          score: 1,
          source: "nominatim",
        },
      ];
    }
  }
  await logMiss(supabase, req.query, req.governorate, req.conversationId);
  return [];
}

/** Resolves two named landmarks across snapshot + optional OSM and triangulates the closest pair. */
export async function resolveLandmarkPair(
  supabase: AdminClient,
  req: {
    queries: [string, string];
    governorate?: string | null;
    delegation?: string | null;
    conversationId?: string;
    allowOsmFallback?: boolean;
  },
): Promise<LandmarkPair | null> {
  let [first, second] = await Promise.all([
    searchLandmarkSnapshot(supabase, req.queries[0], req.governorate),
    searchLandmarkSnapshot(supabase, req.queries[1], req.governorate),
  ]);

  if (req.allowOsmFallback) {
    if (first.length === 0) {
      first = (
        await searchNominatimCandidates({
          queries: [req.queries[0]],
          governorate: req.governorate,
          delegation: req.delegation,
        })
      ).filter((c) => c.source !== "neighborhood");
    }
    if (second.length === 0) {
      second = (
        await searchNominatimCandidates({
          queries: [req.queries[1]],
          governorate: req.governorate,
          delegation: req.delegation,
        })
      ).filter((c) => c.source !== "neighborhood");
    }
  }

  const pair = triangulate(first, second, req.allowOsmFallback ? MAX_TRIANGULATION_KM : undefined);
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
