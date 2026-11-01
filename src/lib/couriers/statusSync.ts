import { channelAdapter } from "@/lib/channels";
import { getDemoMerchant } from "@/lib/dashboard/merchant";
import { logEvent } from "@/lib/pipeline/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { getShipmentState } from "./firstDeliveryApi";
import { isFdState, type FdState } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

export type OrderStatusFromFd = "WAYBILL_CREATED" | "SHIPPED" | "DELIVERED" | "RETURNED" | "CANCELLED";
export type RiskKindFromFd = "delivered" | "returned" | "cancelled";

export interface FdMapping {
  orderStatus: OrderStatusFromFd;
  riskKind: RiskKindFromFd | null;
  /** Fixed buyer notice (amount-free template) sent only on a real transition. */
  buyerText: string | null;
}

const RETURN_STATES: ReadonlySet<number> = new Set([5, 7, 11, 30, 31]);

/**
 * Pure First Delivery state -> order/risk mapping (SPEC "Courier").
 * 0 pending, 1 in progress, 2 delivered, 5/7/11/30/31 returns, 6 cancelled.
 * Unknown codes are refused by the caller via isFdState.
 */
export function mapFdState(state: FdState): FdMapping {
  if (state === 0) return { orderStatus: "WAYBILL_CREATED", riskKind: null, buyerText: null };
  if (state === 1) {
    return {
      orderStatus: "SHIPPED",
      riskKind: null,
      buyerText: "El commande mte3ek 5arjet lel livraison. El livreur yetsarref m3ak 9rib.",
    };
  }
  if (state === 2) {
    return {
      orderStatus: "DELIVERED",
      riskKind: "delivered",
      buyerText: "El commande weslet, hamdullah! Ken femma ay mochkla, 9olli houni.",
    };
  }
  if (state === 6) {
    return {
      orderStatus: "CANCELLED",
      riskKind: "cancelled",
      buyerText: "Samahni, el envoi mte3 el commande tlagha. El vendeur m3ak houni ken t7eb n3awdou.",
    };
  }
  if (RETURN_STATES.has(state)) {
    return {
      orderStatus: "RETURNED",
      riskKind: "returned",
      buyerText: "Samahni, el commande rja3et lel vendeur. Ken t7eb n3awdou el envoi, 9olli houni.",
    };
  }
  throw new Error(`unknown FD state: ${state}`);
}

export type SyncResult =
  | {
      ok: true;
      orderId: string;
      barcode: string;
      fdState: number;
      orderStatus: string;
      changed: boolean;
      riskEventCreated: boolean;
    }
  | { ok: false; status: number; reason: string };

async function syncOne(supabase: Admin, merchantId: string, orderId: string): Promise<SyncResult> {
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, merchant_id, customer_id, conversation_id")
    .eq("id", orderId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!order) return { ok: false, status: 404, reason: "Order not found." };

  const { data: shipment } = await supabase
    .from("shipments")
    .select("id, barcode, fd_state")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!shipment?.barcode) return { ok: false, status: 409, reason: "No waybill to sync." };
  const barcode = shipment.barcode as string;

  let fdState: number;
  try {
    fdState = (await getShipmentState(barcode)).state;
  } catch (err) {
    return { ok: false, status: 502, reason: err instanceof Error ? err.message : "etat FD illisible" };
  }
  if (!isFdState(fdState)) return { ok: false, status: 502, reason: `unknown FD state: ${fdState}` };
  const mapping = mapFdState(fdState);

  const prevFdState = (shipment.fd_state as number | null) ?? null;
  const prevStatus = order.status as string;
  const changed = prevFdState !== fdState || prevStatus !== mapping.orderStatus;

  if (prevFdState !== fdState) {
    const { error } = await supabase.from("shipments").update({ fd_state: fdState }).eq("id", shipment.id as string);
    if (error) return { ok: false, status: 500, reason: error.message };
  }
  if (prevStatus !== mapping.orderStatus) {
    const { error } = await supabase.from("orders").update({ status: mapping.orderStatus }).eq("id", orderId);
    if (error) return { ok: false, status: 500, reason: error.message };
  }

  // Risk history feeds the next order's score: exactly one event per
  // order + terminal kind, however many times sync runs.
  let riskEventCreated = false;
  if (mapping.riskKind) {
    const { data: existing } = await supabase
      .from("risk_events")
      .select("id")
      .eq("order_id", orderId)
      .eq("kind", mapping.riskKind)
      .limit(1)
      .maybeSingle();
    if (!existing) {
      const { error } = await supabase.from("risk_events").insert({
        merchant_id: merchantId,
        customer_id: (order.customer_id as string | null) ?? null,
        order_id: orderId,
        kind: mapping.riskKind,
        detail: { source: "fd_status_sync", barcode, fdState },
      });
      if (error) return { ok: false, status: 500, reason: error.message };
      riskEventCreated = true;
    }
  }

  const conversationId = (order.conversation_id as string | null) ?? null;
  if (changed) {
    if (mapping.buyerText && conversationId && prevStatus !== mapping.orderStatus) {
      await channelAdapter.sendText(conversationId, mapping.buyerText);
    }
    await logEvent(conversationId, "courier.status_sync", {
      orderId,
      barcode,
      fdState,
      fromStatus: prevStatus,
      orderStatus: mapping.orderStatus,
      riskKind: mapping.riskKind,
      riskEventCreated,
    });
  }

  return {
    ok: true,
    orderId,
    barcode,
    fdState,
    orderStatus: mapping.orderStatus,
    changed,
    riskEventCreated,
  };
}

/** Sync one order's First Delivery state into orders/shipments/risk_events. */
export async function syncOrderShipment(orderId: string): Promise<SyncResult> {
  const supabase = createAdminClient();
  const merchant = await getDemoMerchant(supabase);
  if (!merchant) return { ok: false, status: 500, reason: "No shop. Run npm run seed:catalog." };
  return syncOne(supabase, merchant.id, orderId);
}

/** Sync every shipped order of the demo merchant. /etat pacing (1 req/s) is handled by the adapter. */
export async function syncMerchantShipments(): Promise<{ synced: SyncResult[]; failures: Array<{ orderId: string; reason: string }> }> {
  const supabase = createAdminClient();
  const merchant = await getDemoMerchant(supabase);
  if (!merchant) return { synced: [], failures: [{ orderId: "-", reason: "No shop." }] };
  const { data: shipments } = await supabase
    .from("shipments")
    .select("order_id, barcode")
    .not("barcode", "is", null)
    .order("created_at", { ascending: true })
    .limit(100);
  const orderIds = [...new Set((shipments ?? []).map((s) => s.order_id as string))];
  // Only orders of this merchant that are not already in a terminal state still need polling,
  // but terminal rows are cheap to re-check and keep risk events idempotent.
  const { data: orders } = orderIds.length
    ? await supabase.from("orders").select("id").eq("merchant_id", merchant.id).in("id", orderIds)
    : { data: [] as Array<{ id: string }> };
  const synced: SyncResult[] = [];
  const failures: Array<{ orderId: string; reason: string }> = [];
  for (const row of orders ?? []) {
    const result = await syncOne(supabase, merchant.id, row.id as string);
    if (result.ok) synced.push(result);
    else failures.push({ orderId: row.id as string, reason: result.reason });
  }
  return { synced, failures };
}
