import { createHash, randomBytes } from "node:crypto";
import { simulatorAdapter } from "@/lib/channels/simulator";
import { getServerEnv } from "@/lib/env";
import {
  haversineKm,
  nominatimSearch,
  resolveLandmark,
  resolveLandmarkPair,
  type LandmarkCandidate,
} from "@/lib/domain/landmarks";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "./events";

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
}): Promise<void> {
  const rawToken = generatePinToken();
  const pending: PendingAddress = {
    landmarkName: input.landmarkName,
    governorate: input.governorate,
    delegation: input.delegation,
    lat: input.centre.lat,
    lng: input.centre.lng,
    source: input.source,
  };
  const slots: Record<string, unknown> = {
    ...input.slots,
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
  await simulatorAdapter.sendPinLink(
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

export type ResolveOutcome =
  | { status: "sent" }
  | { status: "miss" }
  | { status: "ambiguous"; candidates: LandmarkCandidate[] };

/**
 * Address step: resolve the buyer's landmark(s) from the slots and send the
 * pin link. Two named landmarks triangulate to their closest-pair midpoint.
 * A close top-2 asks the buyer to pick (buttons) instead of guessing.
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
  if (names.length === 0) return { status: "miss" };
  const governorate = slotStr(slots, "governorate");

  if (names.length >= 2) {
    const pair = await resolveLandmarkPair(supabase, {
      queries: [names[0], names[1]],
      governorate,
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
        delegation: pair.a.delegation,
        source: "triangulation",
      });
      return { status: "sent" };
    }
  }

  const candidates = await resolveLandmark(supabase, {
    query: names[0],
    governorate,
    conversationId,
    nominatim: nominatimSearch,
  });
  if (candidates.length === 0) {
    await logEvent(conversationId, "address.miss", { query: names[0], governorate });
    return { status: "miss" };
  }
  const top = candidates[0];
  const second = candidates[1];
  if (second && top.score - second.score < 0.05 && second.id !== "nominatim") {
    const topCandidates = candidates.slice(0, 3);
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
    source: top.id === "nominatim" ? "nominatim" : "snapshot",
  });
  await sendPinForCandidate({
    supabase,
    conversationId,
    slots,
    centre: { lat: top.lat, lng: top.lng },
    landmarkName: top.name,
    governorate: top.governorate ?? governorate,
    delegation: top.delegation,
    source: top.id === "nominatim" ? "nominatim" : "snapshot",
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

  const { data: address, error: addrError } = await supabase
    .from("addresses")
    .insert({
      customer_id: conversation.customer_id as string,
      governorate: pending.governorate,
      delegation: pending.delegation,
      locality_id: localityId,
      landmark: pending.landmarkName,
      lat: input.lat,
      lng: input.lng,
      floor: input.floor ?? slotStr(slots, "floor"),
      driver_note: input.driverNote ?? slotStr(slots, "driverNote"),
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
    landmark: pending.landmarkName,
    distanceKm: Math.round(distanceKm * 1000) / 1000,
  });
  return { conversationId: session.conversationId, distanceKm };
}
