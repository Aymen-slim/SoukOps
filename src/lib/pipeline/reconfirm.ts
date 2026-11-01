import { channelAdapter } from "@/lib/channels";
import { getDemoMerchant } from "@/lib/dashboard/merchant";
import {
  buildDispatchReconfirmText,
  parseDispatchReconfirm,
  RECONFIRM_BUTTONS,
  type DispatchReconfirmStatus,
} from "@/lib/domain/reconfirm";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "./events";

type Admin = ReturnType<typeof createAdminClient>;

export type ReconfirmRequestResult =
  | { ok: true; already: boolean }
  | { ok: false; status: number; reason: string };

/**
 * Seller-triggered pre-dispatch reconfirmation: stores the pending state in
 * the conversation slots (no migration, no model text) and sends the fixed
 * Derja template with Oui/La buttons. Only for buyer-confirmed orders that
 * have not been dispatched yet.
 */
export async function requestDispatchReconfirmation(orderId: string): Promise<ReconfirmRequestResult> {
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
  if (order.status !== "CONFIRMED_BY_BUYER") {
    return { ok: false, status: 409, reason: "Seule une commande confirmÃ©e par l'acheteur peut Ãªtre reconfirmÃ©e." };
  }
  const { data: shipment } = await supabase.from("shipments").select("id").eq("order_id", orderId).maybeSingle();
  if (shipment) return { ok: false, status: 409, reason: "Le bordereau existe dÃ©jÃ ." };

  const conversationId = (order.conversation_id as string | null) ?? null;
  if (!conversationId) return { ok: false, status: 409, reason: "Conversation introuvable pour cette commande." };

  const { data: conversation } = await supabase
    .from("conversations")
    .select("slots")
    .eq("id", conversationId)
    .maybeSingle();
  const slots = { ...((conversation?.slots ?? {}) as Record<string, unknown>) };
  const existing = parseDispatchReconfirm(slots);
  if (existing?.orderId === orderId && existing.status === "pending") return { ok: true, already: true };
  if (existing?.orderId === orderId && existing.status === "confirmed") return { ok: true, already: true };

  const { data: item } = await supabase
    .from("order_items")
    .select("name_snapshot")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();

  slots.dispatchReconfirm = { status: "pending", orderId };
  const { error } = await supabase.from("conversations").update({ slots }).eq("id", conversationId);
  if (error) return { ok: false, status: 500, reason: error.message };

  await channelAdapter.sendButtons(
    conversationId,
    buildDispatchReconfirmText((item?.name_snapshot as string | null) ?? null),
    [...RECONFIRM_BUTTONS],
  );
  await logEvent(conversationId, "courier.reconfirm_requested", { orderId });
  return { ok: true, already: false };
}

/**
 * Applies the buyer's reconfirmation answer (called from handleTurn's
 * deterministic intercept, before any model call). Returns true when the
 * turn was consumed by the reconfirmation flow.
 */
export async function applyDispatchReconfirmReply(
  supabase: Admin,
  conversationId: string,
  slots: Record<string, unknown>,
  answer: "confirmed" | "declined",
): Promise<void> {
  const state = parseDispatchReconfirm(slots);
  const next: DispatchReconfirmStatus = answer;
  const updated = { ...slots, dispatchReconfirm: { status: next, orderId: state?.orderId ?? null } };
  await supabase.from("conversations").update({ slots: updated }).eq("id", conversationId);
  await channelAdapter.sendText(
    conversationId,
    answer === "confirmed"
      ? "Mrigel, takked el envoi! El vendeur yab3athha taw, w yousallek el code mta3 el bordereau houni."
      : "Ma femma hatta mochkel, nestannew. 9olli houni wa9teh ywali sa7i7 lel envoi, walla ken t7eb tbaddel haja.",
  );
  await logEvent(conversationId, answer === "confirmed" ? "courier.reconfirm_confirmed" : "courier.reconfirm_declined", {
    orderId: state?.orderId ?? null,
  });
}
