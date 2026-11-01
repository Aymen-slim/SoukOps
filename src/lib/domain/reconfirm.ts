/**
 * Pre-dispatch reconfirmation (Day 7). Deterministic, no model text:
 * the seller optionally asks the buyer to reconfirm just before dispatch;
 * the buyer's button reply is intercepted by code before any model call,
 * and seller approval stays blocked while the answer is pending/declined.
 */

export type DispatchReconfirmStatus = "pending" | "confirmed" | "declined";

export interface DispatchReconfirmState {
  status: DispatchReconfirmStatus;
  orderId: string;
}

export function parseDispatchReconfirm(slots: Record<string, unknown>): DispatchReconfirmState | null {
  const raw = slots.dispatchReconfirm as { status?: unknown; orderId?: unknown } | undefined;
  if (!raw || typeof raw !== "object") return null;
  if (raw.status !== "pending" && raw.status !== "confirmed" && raw.status !== "declined") return null;
  if (typeof raw.orderId !== "string" || !raw.orderId) return null;
  return { status: raw.status, orderId: raw.orderId };
}

/** Parses the buyer's reconfirmation button/text reply. Code decides, never the model. */
export function parseDispatchReconfirmReply(text: string): "confirmed" | "declined" | null {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[.!،؟?]+$/g, "")
    .trim();
  if (!normalized) return null;
  if (
    normalized === "oui, ab3ath" ||
    normalized === "oui" ||
    normalized === "ab3ath" ||
    normalized === "akked" ||
    normalized.startsWith("oui, ab3ath") ||
    normalized.startsWith("oui ab3ath")
  ) {
    return "confirmed";
  }
  if (
    normalized === "la, stannew" ||
    normalized === "la" ||
    normalized === "stannew" ||
    normalized === "non" ||
    normalized.startsWith("la, stannew") ||
    normalized.startsWith("la stannew")
  ) {
    return "declined";
  }
  return null;
}

/** Fixed Derja template — no amount, so nothing for the firewall to invent. */
export function buildDispatchReconfirmText(productName: string | null): string {
  const item = productName ? ` (${productName})` : "";
  return `9rib nab3athou el commande mte3ek${item}. Mazelt m2akked el envoi? E8et [Oui, ab3ath] ken mrigel, w [La, stannew] ken t7eb nestannew.`;
}

export const RECONFIRM_BUTTONS = [
  { id: "reconfirm_yes", title: "Oui, ab3ath" },
  { id: "reconfirm_no", title: "La, stannew" },
] as const;

/**
 * Approval gate: only blocks when a reconfirmation was requested for this
 * exact order and the buyer has not confirmed. No request -> no block, so
 * the normal approve -> waybill path is unchanged.
 */
export function reconfirmBlocksApproval(
  slots: Record<string, unknown>,
  orderId: string,
): "pending" | "declined" | null {
  const state = parseDispatchReconfirm(slots);
  if (!state || state.orderId !== orderId) return null;
  if (state.status === "confirmed") return null;
  return state.status;
}
