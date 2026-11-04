/**
 * Slot policy: code — never the model — decides the next action from the
 * collected slots. Fixed priority:
 * product -> size -> name -> phone -> governorate -> landmark -> pin ->
 * summary -> Akked. Name and phone are whatever the buyer just said.
 */

export type NextAction =
  | "need_product"
  | "need_size"
  | "need_name"
  | "need_phone"
  | "need_governorate"
  | "need_landmark"
  | "need_pin"
  | "awaiting_pin"
  | "need_summary"
  | "awaiting_confirmation"
  | "ordered";

function str(slots: Record<string, unknown>, key: string): string | null {
  const v = slots[key];
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Draft-aware next action: same funnel as nextAction, but a multi-item draft
 * needs every item sized, and a cancelled draft restarts at the product.
 */
export function nextDraftAction(slots: Record<string, unknown>): NextAction {
  if (slots.draftCancelled === true && !str(slots, "matchedProductId")) return "need_product";
  const items = slots.items;
  if (Array.isArray(items) && items.length > 0) {
    if (slots.summaryPending === true) return "awaiting_confirmation";
    if (str(slots, "orderId")) return "ordered";
    const list = items as Array<Record<string, unknown>>;
    if (list.some((i) => !i || typeof i.productId !== "string" || !i.productId)) return "need_product";
    if (list.some((i) => typeof i.size !== "string" || !String(i.size).trim())) return "need_size";
    if (!str(slots, "customerName")) return "need_name";
    if (!str(slots, "phone")) return "need_phone";
    if (!str(slots, "governorate")) return "need_governorate";
    const landmarks = slots.landmarks;
    if (!Array.isArray(landmarks) || landmarks.length === 0) return "need_landmark";
    if (str(slots, "confirmedAddressId")) return "need_summary";
    if (slots.pinPending === true) return "awaiting_pin";
    return "need_pin";
  }
  return nextAction(slots);
}

export function nextAction(slots: Record<string, unknown>): NextAction {
  if (str(slots, "orderId")) return "ordered";
  if (slots.summaryPending === true) return "awaiting_confirmation";
  if (!str(slots, "matchedProductId")) return "need_product";
  if (!str(slots, "size")) return "need_size";
  if (!str(slots, "customerName")) return "need_name";
  if (!str(slots, "phone")) return "need_phone";
  if (!str(slots, "governorate")) return "need_governorate";
  const landmarks = slots.landmarks;
  if (!Array.isArray(landmarks) || landmarks.length === 0) return "need_landmark";
  if (str(slots, "confirmedAddressId")) return "need_summary";
  if (slots.pinPending === true) return "awaiting_pin";
  return "need_pin";
}
