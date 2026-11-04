import { createHash, randomBytes } from "node:crypto";
import { channelAdapter } from "@/lib/channels";
import { getServerEnv } from "@/lib/env";
import {
  haversineKm,
  nominatimSearch,
  resolveLandmark,
  resolveLandmarkPair,
  searchGooglePlaces,
  searchLandmarkSnapshot,
  searchNominatimCandidates,
  type LandmarkCandidate,
} from "@/lib/domain/landmarks";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "./events";
import { interpretLocationDescription, type LocationInterpretation } from "./location-ai";

type SupabaseClient = ReturnType<typeof createAdminClient>;

export const PIN_TTL_MS = 24 * 60 * 60 * 1000;

/** Tokens are random; only their SHA-256 hash is stored (single-use, 24h). */
export function generatePinToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPinToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface PendingAddress {
  landmarkName: string;
  governorate: string | null;
  delegation: string | null;
  lat: number;
  lng: number;
  source: string;
  floor?: string | null;
  driverNote?: string | null;
  descriptionHint?: string | null;
}

function slotStr(slots: Record<string, unknown>, key: string): string | null {
  const v = slots[key];
  return typeof v === "string" && v.trim() ? v : null;
}

async function saveSlots(supabase: SupabaseClient, conversationId: string, slots: Record<string, unknown>) {
  const { error } = await supabase
    .from("conversations")
    .update({ slots })
    .eq("id", conversationId);
  if (error) throw new Error(`slots update failed: ${error.message}`);
}

/** Sends the pin link centred on a resolved candidate; stores the token hash. */
export async function sendPinForCandidate(input: {
  supabase: SupabaseClient;
  conversationId: string;
  slots: Record<string, unknown>;
  centre: { lat: number; lng: number };
  landmarkName: string;
  governorate: string | null;
  delegation: string | null;
  source: string;
  floor?: string | null;
  driverNote?: string | null;
  descriptionHint?: string | null;
}): Promise<void> {
  const rawToken = generatePinToken();
  const floorHint = input.floor ?? slotStr(input.slots, "floor");
  const driverNoteHint = input.driverNote ?? slotStr(input.slots, "driverNote");
  const pending: PendingAddress = {
    landmarkName: input.landmarkName,
    governorate: input.governorate,
    delegation: input.delegation,
    lat: input.centre.lat,
    lng: input.centre.lng,
    source: input.source,
    ...(floorHint ? { floor: floorHint } : {}),
    ...(driverNoteHint ? { driverNote: driverNoteHint } : {}),
    ...(input.descriptionHint ? { descriptionHint: input.descriptionHint } : {}),
  };
  const slots: Record<string, unknown> = {
    ...input.slots,
    ...(input.governorate ? { governorate: input.governorate } : {}),
    ...(input.delegation ? { delegation: input.delegation } : {}),
    ...(floorHint ? { floor: floorHint } : {}),
    ...(driverNoteHint ? { driverNote: driverNoteHint } : {}),
    pinPending: true,
    pendingAddress: pending,
  };
  delete slots.pendingLandmarkChoice;
  const { error } = await input.supabase
    .from("conversations")
    .update({
      slots,
      pin_token: hashPinToken(rawToken),
      pin_token_expires_at: new Date(Date.now() + PIN_TTL_MS).toISOString(),
    })
    .eq("id", input.conversationId);
  if (error) throw new Error(`pin token save failed: ${error.message}`);

  const url = `${getServerEnv().APP_BASE_URL}/pin/${rawToken}`;
  await channelAdapter.sendPinLink(
    input.conversationId,
    url,
    `Mrigel! 7ot el pin 3al kharita win el dar (9rib le ${input.landmarkName}) w akked:`,
  );
  await logEvent(input.conversationId, "address.pin_sent", {
    landmark: input.landmarkName,
    source: input.source,
    lat: input.centre.lat,
    lng: input.centre.lng,
  });
}

export interface DescriptionSearchResult {
  candidates: LandmarkCandidate[];
  triangulated: { a: string; b: string; distanceKm: number; midpoint: { lat: number; lng: number } } | null;
  interpretation: LocationInterpretation;
  aiUsed: boolean;
}

/**
 * Resolves a free-form Tunisian location description (Derja, Arabizi, Arabic,
 * or French) into ranked map candidates using:
 * 1) DB `landmarks` snapshot
 * 2) Muse Spark AI Location Interpreter (`spark.json.location_interpret`)
 * 3) Google Maps Places text search (when a server key is configured)
 * 4) Cross-source 2-landmark triangulation + geo-ranked OpenStreetMap search
 */
export async function searchLocationByDescription(
  supabase: SupabaseClient,
  input: {
    description: string;
    governorate?: string | null;
    delegation?: string | null;
    conversationId?: string;
  },
): Promise<DescriptionSearchResult> {
  const { interpretation, aiUsed } = await interpretLocationDescription({
    description: input.description,
    governorate: input.governorate,
    delegation: input.delegation,
    conversationId: input.conversationId,
  });

  const gov = interpretation.governorate ?? input.governorate ?? null;
  const del = interpretation.delegation ?? input.delegation ?? null;

  // Multi-landmark triangulation across snapshot + OpenStreetMap
  if (interpretation.places.length >= 2) {
    const q1 = interpretation.places[0].osmQueryFr || interpretation.places[0].rawName;
    const q2 = interpretation.places[1].osmQueryFr || interpretation.places[1].rawName;
    const pair = await resolveLandmarkPair(supabase, {
      queries: [q1, q2],
      governorate: gov,
      delegation: del,
      conversationId: input.conversationId,
      allowOsmFallback: true,
    }).catch(() => null);
    if (pair) {
      const midpointCandidate: LandmarkCandidate = {
        id: "triangulated",
        name: `${pair.a.name} / ${pair.b.name}`,
        governorate: pair.a.governorate ?? gov,
        delegation: pair.a.delegation ?? del,
        lat: pair.midpoint.lat,
        lng: pair.midpoint.lng,
        score: 0.96,
        source: "ai_osm",
      };
      return {
        candidates: [midpointCandidate, pair.a, pair.b],
        triangulated: {
          a: pair.a.name,
          b: pair.b.name,
          distanceKm: Math.round(pair.distanceKm * 100) / 100,
          midpoint: pair.midpoint,
        },
        interpretation,
        aiUsed,
      };
    }
  }

  const queries: string[] = [];
  for (const place of interpretation.places) {
    if (place.osmQueryFr) queries.push(place.osmQueryFr);
    if (place.osmQueryAr) queries.push(place.osmQueryAr);
    if (place.rawName) queries.push(place.rawName);
  }
  if (interpretation.streetOrZone) queries.push(interpretation.streetOrZone);
  if (queries.length === 0 && input.description.trim()) queries.push(input.description.trim());
  const uniqueQueries = [...new Set(queries)];

  // Check curated DB snapshot on AI-cleaned queries first
  for (const q of uniqueQueries.slice(0, 3)) {
    const snap = await searchLandmarkSnapshot(supabase, q, gov).catch(() => []);
    if (snap.length > 0) {
      return { candidates: snap, triangulated: null, interpretation, aiUsed };
    }
  }

  // Google Maps finds the place the buyer described when the snapshot misses
  // (best real-world coverage of Tunisian shops/cafés/streets). No key, replay
  // mode, or a Google failure returns [] and OpenStreetMap takes over below.
  const googleCandidates = await searchGooglePlaces({
    queries: uniqueQueries,
    governorate: gov,
    delegation: del,
  }).catch(() => []);
  if (googleCandidates.length > 0) {
    return { candidates: googleCandidates, triangulated: null, interpretation, aiUsed };
  }

  const osmCandidates = await searchNominatimCandidates({
    queries: uniqueQueries,
    governorate: gov,
    delegation: del,
    source: aiUsed ? "ai_osm" : "nominatim",
  });

  return {
    candidates: osmCandidates,
    triangulated: null,
    interpretation,
    aiUsed,
  };
}

export type ResolveOutcome =
  | { status: "sent" }
  | { status: "miss" }
  | { status: "ambiguous"; candidates: LandmarkCandidate[] };

/**
 * Address step: resolve the buyer's landmark(s) or natural location description
 * from the slots and send the pin link.
 * - Fast-paths curated snapshot matches (zero extra AI latency, replay-identical).
 * - Falls back to AI Location Description Interpreter + multi-candidate OSM +
 *   cross-source triangulation + 95+ Tunisian suburb centroids.
 */
export async function resolveAndSendPin(input: {
  supabase: SupabaseClient;
  conversationId: string;
  slots: Record<string, unknown>;
}): Promise<ResolveOutcome> {
  const { supabase, conversationId, slots } = input;
  const rawLandmarks = Array.isArray(slots.landmarks) ? slots.landmarks : [];
  const names = rawLandmarks
    .map((l) => (l && typeof l === "object" ? (l as { name?: unknown }).name : null))
    .filter((n): n is string => typeof n === "string" && Boolean(n.trim()));
  const locationMeta = slots.locationMeta as { description?: unknown } | undefined;
  const locationDescription =
    slotStr(slots, "locationDescription") ??
    (typeof locationMeta?.description === "string" && locationMeta.description.trim()
      ? locationMeta.description.trim()
      : null);
  if (names.length === 0 && !locationDescription) return { status: "miss" };

  const governorate = slotStr(slots, "governorate");
  const delegation = slotStr(slots, "delegation");

  // 1. Fast path: 2-landmark triangulation in curated snapshot
  if (names.length >= 2) {
    const pair = await resolveLandmarkPair(supabase, {
      queries: [names[0], names[1]],
      governorate,
      delegation,
      conversationId,
    }).catch(() => null);
    if (pair) {
      await logEvent(conversationId, "address.resolved", {
        mode: "triangulation",
        landmarks: [pair.a.name, pair.b.name],
        distanceKm: Math.round(pair.distanceKm * 100) / 100,
      });
      await sendPinForCandidate({
        supabase,
        conversationId,
        slots,
        centre: pair.midpoint,
        landmarkName: `${pair.a.name} / ${pair.b.name}`,
        governorate: pair.a.governorate ?? governorate,
        delegation: pair.a.delegation ?? delegation,
        source: "triangulation",
        descriptionHint: locationDescription,
      });
      return { status: "sent" };
    }
  }

  // 2. Fast path: single landmark in curated snapshot (keeps seeded landmarks & replay tests 0-AI-call fast)
  if (names.length > 0) {
    const snap = await searchLandmarkSnapshot(supabase, names[0], governorate).catch(() => []);
    if (snap.length > 0) {
      const top = snap[0];
      const second = snap[1];
      if (second && top.score - second.score < 0.05) {
        const topCandidates = snap.slice(0, 3);
        await saveSlots(supabase, conversationId, { ...slots, pendingLandmarkChoice: topCandidates });
        await logEvent(conversationId, "address.ambiguous", {
          query: names[0],
          candidates: topCandidates.map((c) => c.name),
        });
        return { status: "ambiguous", candidates: topCandidates };
      }
      await logEvent(conversationId, "address.resolved", {
        mode: "single",
        landmark: top.name,
        score: Math.round(top.score * 1000) / 1000,
        source: "snapshot",
      });
      await sendPinForCandidate({
        supabase,
        conversationId,
        slots,
        centre: { lat: top.lat, lng: top.lng },
        landmarkName: top.name,
        governorate: top.governorate ?? governorate,
        delegation: top.delegation ?? delegation,
        source: "snapshot",
        descriptionHint: locationDescription,
      });
      return { status: "sent" };
    }
  }

  // 3. Rich AI Location Description Interpreter + Geo-Ranked OpenStreetMap + Suburb Gazetteer
  const fullDescription = locationDescription ?? names.join(", ");
  const aiSearch = await searchLocationByDescription(supabase, {
    description: fullDescription,
    governorate,
    delegation,
    conversationId,
  });

  if (aiSearch.aiUsed) {
    await logEvent(conversationId, "address.ai_interpreted", {
      places: aiSearch.interpretation.places.map((p) => p.osmQueryFr),
      governorate: aiSearch.interpretation.governorate,
      delegation: aiSearch.interpretation.delegation,
    });
  }

  if (aiSearch.triangulated) {
    const mid = aiSearch.candidates[0];
    await logEvent(conversationId, "address.resolved", {
      mode: "triangulation",
      landmarks: [aiSearch.triangulated.a, aiSearch.triangulated.b],
      distanceKm: aiSearch.triangulated.distanceKm,
      source: aiSearch.aiUsed ? "ai_osm" : "nominatim",
    });
    await sendPinForCandidate({
      supabase,
      conversationId,
      slots,
      centre: aiSearch.triangulated.midpoint,
      landmarkName: mid.name,
      governorate: mid.governorate ?? governorate,
      delegation: mid.delegation ?? delegation,
      source: "triangulation",
      floor: aiSearch.interpretation.floor,
      driverNote: aiSearch.interpretation.driverNote,
      descriptionHint: fullDescription,
    });
    return { status: "sent" };
  }

  let candidates = aiSearch.candidates;
  if (candidates.length === 0 && names[0]) {
    candidates = await resolveLandmark(supabase, {
      query: names[0],
      governorate,
      delegation,
      conversationId,
      nominatim: nominatimSearch,
    });
  }

  if (candidates.length === 0) {
    await logEvent(conversationId, "address.miss", { query: fullDescription, governorate });
    return { status: "miss" };
  }

  const top = candidates[0];
  const second = candidates[1];
  if (
    second &&
    top.score - second.score < 0.04 &&
    top.source === "snapshot" &&
    second.source === "snapshot"
  ) {
    const topCandidates = candidates.slice(0, 3);
    await saveSlots(supabase, conversationId, { ...slots, pendingLandmarkChoice: topCandidates });
    await logEvent(conversationId, "address.ambiguous", {
      query: fullDescription,
      candidates: topCandidates.map((c) => c.name),
    });
    return { status: "ambiguous", candidates: topCandidates };
  }

  const resolvedSource = top.source ?? (top.id === "nominatim" ? "nominatim" : "snapshot");
  await logEvent(conversationId, "address.resolved", {
    mode: "single",
    landmark: top.name,
    score: Math.round(top.score * 1000) / 1000,
    source: resolvedSource,
    lat: Math.round(top.lat * 10000) / 10000,
    lng: Math.round(top.lng * 10000) / 10000,
  });
  await sendPinForCandidate({
    supabase,
    conversationId,
    slots,
    centre: { lat: top.lat, lng: top.lng },
    landmarkName: top.name,
    governorate: top.governorate ?? aiSearch.interpretation.governorate ?? governorate,
    delegation: top.delegation ?? aiSearch.interpretation.delegation ?? delegation,
    source: resolvedSource,
    floor: aiSearch.interpretation.floor,
    driverNote: aiSearch.interpretation.driverNote,
    descriptionHint: fullDescription,
  });
  return { status: "sent" };
}

/** Latest confirmed address for a returning customer (pin reuse). */
export async function findConfirmedAddress(
  supabase: SupabaseClient,
  customerId: string,
): Promise<{ id: string; landmark: string | null } | null> {
  const { data } = await supabase
    .from("addresses")
    .select("id, landmark")
    .eq("customer_id", customerId)
    .not("confirmed_at", "is", null)
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id as string, landmark: (data.landmark as string | null) ?? null } : null;
}

export type PinSession =
  | { status: "ok"; conversationId: string; pending: PendingAddress }
  | { status: "invalid" }
  | { status: "expired"; conversationId: string };

export async function getPinSession(supabase: SupabaseClient, rawToken: string): Promise<PinSession> {
  const { data } = await supabase
    .from("conversations")
    .select("id, slots, pin_token_expires_at")
    .eq("pin_token", hashPinToken(rawToken))
    .maybeSingle();
  if (!data) return { status: "invalid" };
  const expires = data.pin_token_expires_at ? new Date(data.pin_token_expires_at as string).getTime() : 0;
  if (!expires || expires < Date.now()) return { status: "expired", conversationId: data.id as string };
  const slots = (data.slots ?? {}) as Record<string, unknown>;
  const pending = slots.pendingAddress as PendingAddress | undefined;
  if (!pending) return { status: "invalid" };
  return { status: "ok", conversationId: data.id as string, pending };
}

/**
 * Confirms the pin: writes the confirmed address, burns the token, records
 * the distance to the named landmark (risk signal), and marks the slot.
 * Returns the conversation so the caller can advance to the summary.
 */
export async function confirmPin(input: {
  supabase: SupabaseClient;
  rawToken: string;
  lat: number;
  lng: number;
  floor?: string | null;
  driverNote?: string | null;
  landmarkOverride?: string | null;
}): Promise<{ conversationId: string; distanceKm: number } | { error: string }> {
  const { supabase } = input;
  const session = await getPinSession(supabase, input.rawToken);
  if (session.status !== "ok") return { error: session.status };

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, merchant_id, customer_id, slots")
    .eq("id", session.conversationId)
    .single();
  if (!conversation?.customer_id) return { error: "invalid" };
  const slots = (conversation.slots ?? {}) as Record<string, unknown>;
  const pending = session.pending;

  let localityId: number | null = null;
  if (pending.governorate) {
    const { data: fees } = await supabase
      .from("delivery_fees")
      .select("delegation, locality_id")
      .eq("merchant_id", conversation.merchant_id as string)
      .eq("governorate", pending.governorate);
    const match =
      (fees ?? []).find((f) => f.delegation && pending.delegation && f.delegation === pending.delegation) ??
      (fees ?? []).find((f) => !f.delegation) ??
      (fees ?? [])[0];
    localityId = (match?.locality_id as number | null) ?? null;
  }

  const finalLandmark = input.landmarkOverride?.trim() || pending.landmarkName;

  const { data: address, error: addrError } = await supabase
    .from("addresses")
    .insert({
      customer_id: conversation.customer_id as string,
      governorate: pending.governorate,
      delegation: pending.delegation,
      locality_id: localityId,
      landmark: finalLandmark,
      lat: input.lat,
      lng: input.lng,
      floor: input.floor ?? pending.floor ?? slotStr(slots, "floor"),
      driver_note: input.driverNote ?? pending.driverNote ?? slotStr(slots, "driverNote"),
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (addrError || !address) return { error: `address insert failed: ${addrError?.message}` };

  const distanceKm = haversineKm({ lat: pending.lat, lng: pending.lng }, { lat: input.lat, lng: input.lng });
  const nextSlots: Record<string, unknown> = {
    ...slots,
    pinPending: false,
    confirmedAddressId: address.id as string,
    pinConfirmedAt: new Date().toISOString(),
    pinDistanceKm: Math.round(distanceKm * 1000) / 1000,
  };
  delete nextSlots.pendingAddress;
  if (input.floor) nextSlots.floor = input.floor;
  if (input.driverNote) nextSlots.driverNote = input.driverNote;

  const { error: convError } = await supabase
    .from("conversations")
    .update({
      slots: nextSlots,
      pin_token: null,
      pin_token_expires_at: null,
    })
    .eq("id", session.conversationId);
  if (convError) return { error: `conversation update failed: ${convError.message}` };

  await logEvent(session.conversationId, "address.pin_confirmed", {
    landmark: finalLandmark,
    distanceKm: Math.round(distanceKm * 1000) / 1000,
  });
  return { conversationId: session.conversationId, distanceKm };
}
