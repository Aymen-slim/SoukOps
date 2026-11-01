import { simulatorAdapter } from "@/lib/channels/simulator";
import { reconfirmBlocksApproval } from "@/lib/domain/reconfirm";
import { logEvent } from "@/lib/pipeline/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDemoMerchant } from "@/lib/dashboard/merchant";
import { createShipment } from "./firstDeliveryApi";
import { loadParcel } from "./parcel";
import type { CourierJobPayload, JobResult } from "./types";
import { buyerWaybillText } from "./waybill";

type Admin = ReturnType<typeof createAdminClient>;

const OPEN_JOB = new Set(["queued", "claimed", "awaiting_confirm", "failed"]);

export type ApproveResponse =
  | { ok: true; mode: "browser"; jobId: string; jobStatus: string; already: boolean }
  | { ok: true; mode: "mock_api" | "real_api"; barcode: string; printUrl: string; already: boolean }
  | { ok: false; status: number; reason: string };

function printPath(barcode: string): string {
  return `/api/fd-mock/v2/waybill/${barcode}`;
}

async function latestJob(supabase: Admin, orderId: string) {
  const { data } = await supabase
    .from("courier_jobs")
    .select("id, status, result, payload")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/**
 * The only order/shipment writer after buyer Akked.
 * Idempotent: an existing shipment or an open job is returned as-is.
 */
export async function approveOrder(orderId: string): Promise<ApproveResponse> {
  const supabase = createAdminClient();
  const merchant = await getDemoMerchant(supabase);
  if (!merchant) return { ok: false, status: 500, reason: "Aucune boutique. Lancez npm run seed:catalog." };

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, merchant_id, conversation_id")
    .eq("id", orderId)
    .eq("merchant_id", merchant.id)
    .maybeSingle();
  if (!order) return { ok: false, status: 404, reason: "Commande introuvable." };

  const { data: shipment } = await supabase
    .from("shipments")
    .select("barcode")
    .eq("order_id", orderId)
    .maybeSingle();
  if (shipment?.barcode) {
    const mode = merchant.courier_mode === "browser" ? "mock_api" : merchant.courier_mode;
    return {
      ok: true,
      mode: mode === "real_api" ? "real_api" : "mock_api",
      barcode: shipment.barcode as string,
      printUrl: printPath(shipment.barcode as string),
      already: true,
    };
  }

  const job = await latestJob(supabase, orderId);
  if (job && OPEN_JOB.has(job.status as string)) {
    return { ok: true, mode: "browser", jobId: job.id as string, jobStatus: job.status as string, already: true };
  }

  if (order.status !== "CONFIRMED_BY_BUYER") {
    return { ok: false, status: 409, reason: "Seule une commande confirmée par l'acheteur peut être approuvée." };
  }

  // Pre-dispatch reconfirmation gate (Day 7): blocks only when the seller
  // requested one for this order and the buyer has not confirmed.
  if (order.conversation_id) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("slots")
      .eq("id", order.conversation_id as string)
      .maybeSingle();
    const blocked = reconfirmBlocksApproval((conversation?.slots ?? {}) as Record<string, unknown>, orderId);
    if (blocked === "pending") {
      return { ok: false, status: 409, reason: "Reconfirmation avant envoi en attente de l'acheteur." };
    }
    if (blocked === "declined") {
      return { ok: false, status: 409, reason: "L'acheteur a demandé d'attendre avant l'envoi." };
    }
  }

  const loaded = await loadParcel(supabase, orderId);
  if (!loaded.ok) return { ok: false, status: 422, reason: loaded.reason };

  const conversationId = (order.conversation_id as string | null) ?? loaded.conversationId;
  await logEvent(conversationId, "courier.approved", {
    orderId,
    mode: merchant.courier_mode,
    totalMillimes: loaded.totalMillimes,
  });

  if (merchant.courier_mode === "browser") {
    const payload: CourierJobPayload = { parcel: loaded.parcel, conversationId };
    const { data: inserted, error } = await supabase
      .from("courier_jobs")
      .insert({ order_id: orderId, status: "queued", payload })
      .select("id")
      .single();
    if (error || !inserted) return { ok: false, status: 500, reason: `File coursier indisponible : ${error?.message}` };
    return { ok: true, mode: "browser", jobId: inserted.id as string, jobStatus: "queued", already: false };
  }

  try {
    const created = await createShipment(loaded.parcel);
    await recordWaybill({
      orderId,
      conversationId,
      barcode: created.barcode,
      waybillPath: created.waybillPath,
      mode: merchant.courier_mode === "real_api" ? "real_api" : "mock_api",
      totalMillimes: loaded.totalMillimes,
    });
    return { ok: true, mode: merchant.courier_mode === "real_api" ? "real_api" : "mock_api", barcode: created.barcode, printUrl: printPath(created.barcode), already: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "create failed";
    return { ok: false, status: 502, reason: `Création du colis refusée : ${message}` };
  }
}

export async function confirmDispatch(orderId: string): Promise<{ ok: true } | { ok: false; status: number; reason: string }> {
  const supabase = createAdminClient();
  const merchant = await getDemoMerchant(supabase);
  if (!merchant) return { ok: false, status: 500, reason: "Aucune boutique." };

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("merchant_id", merchant.id)
    .maybeSingle();
  if (!order) return { ok: false, status: 404, reason: "Commande introuvable." };

  const job = await latestJob(supabase, orderId);
  if (!job || job.status !== "awaiting_confirm") {
    return { ok: false, status: 409, reason: "Rien à confirmer : l'agent n'a pas encore relu le colis." };
  }
  const prev = (job.result ?? {}) as JobResult;
  const { error } = await supabase
    .from("courier_jobs")
    .update({ result: { ...prev, sellerConfirmed: true } })
    .eq("id", job.id as string)
    .eq("status", "awaiting_confirm");
  if (error) return { ok: false, status: 500, reason: error.message };
  return { ok: true };
}

/** Requeue a failed job. A barcode already issued is recorded instead of submitted twice. */
export async function retryCourierJob(orderId: string): Promise<{ ok: true } | { ok: false; status: number; reason: string }> {
  const supabase = createAdminClient();
  const merchant = await getDemoMerchant(supabase);
  if (!merchant) return { ok: false, status: 500, reason: "Aucune boutique." };

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("merchant_id", merchant.id)
    .maybeSingle();
  if (!order) return { ok: false, status: 404, reason: "Commande introuvable." };

  const { data: shipment } = await supabase.from("shipments").select("id").eq("order_id", orderId).maybeSingle();
  if (shipment) return { ok: false, status: 409, reason: "Le bordereau existe déjà." };

  const job = await latestJob(supabase, orderId);
  if (!job || job.status !== "failed") {
    return { ok: false, status: 409, reason: "Aucun envoi en échec à relancer." };
  }

  const result = (job.result ?? {}) as JobResult;
  const payload = job.payload as CourierJobPayload | null;
  if (result.barcode && payload?.parcel) {
    await recordWaybill({
      orderId,
      conversationId: payload.conversationId,
      barcode: result.barcode,
      waybillPath: `${result.barcode}.pdf`,
      mode: "browser",
      totalMillimes: payload.parcel.prixMillimes,
      jobId: job.id as string,
    });
    return { ok: true };
  }

  const { error } = await supabase
    .from("courier_jobs")
    .update({ status: "queued", claimed_at: null, result: null, screenshot_path: null })
    .eq("id", job.id as string)
    .eq("status", "failed");
  if (error) return { ok: false, status: 500, reason: error.message };
  return { ok: true };
}

export async function recordWaybill(opts: {
  orderId: string;
  conversationId: string | null;
  barcode: string;
  waybillPath: string;
  mode: "mock_api" | "browser" | "real_api";
  totalMillimes: number;
  jobId?: string;
}): Promise<void> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase.from("shipments").select("id").eq("order_id", opts.orderId).maybeSingle();
  if (!existing) {
    const { error } = await supabase.from("shipments").insert({
      order_id: opts.orderId,
      courier: "first_delivery",
      mode: opts.mode,
      barcode: opts.barcode,
      waybill_path: opts.waybillPath,
      fd_state: 0,
    });
    if (error) throw new Error(`shipment insert failed: ${error.message}`);
    const { error: orderError } = await supabase.from("orders").update({ status: "WAYBILL_CREATED" }).eq("id", opts.orderId);
    if (orderError) throw new Error(`order update failed: ${orderError.message}`);
    if (opts.conversationId) {
      await simulatorAdapter.sendText(opts.conversationId, buyerWaybillText(opts.barcode, opts.totalMillimes));
      await logEvent(opts.conversationId, "courier.waybill", {
        orderId: opts.orderId,
        barcode: opts.barcode,
        mode: opts.mode,
      });
    }
  }
  if (opts.jobId) {
    const { data: job } = await supabase.from("courier_jobs").select("result").eq("id", opts.jobId).maybeSingle();
    const prev = (job?.result ?? {}) as JobResult;
    await supabase
      .from("courier_jobs")
      .update({ status: "done", result: { ...prev, sellerConfirmed: true, barcode: opts.barcode } })
      .eq("id", opts.jobId);
  }
}
