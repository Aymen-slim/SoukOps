import { passesPriceFirewall } from "./firewall";

/**
 * The only source of money in replies (AGENTS.md). Amounts are integer
 * millimes everywhere (1 DT = 1000). Delivery fees and negotiation totals
 * extend this module on Day 4; the catalog list price lives here already so
 * price questions can be answered deterministically.
 */

/** Formats millimes for Derja chat: 120000 -> "120DT", 120500 -> "120,500 DT". */
export function formatMillimesForChat(millimes: number): string {
  const dinars = Math.floor(millimes / 1000);
  const rest = millimes % 1000;
  if (rest === 0) return `${dinars}DT`;
  return `${dinars},${String(rest).padEnd(3, "0")} DT`;
}

/**
 * Returns the reply only if every amount in it is producible from the given
 * allowed millimes (price firewall); otherwise null so the caller falls back
 * to a fixed amount-free template.
 */
export function firewallChecked(reply: string, allowedMillimes: number[]): string | null {
  return passesPriceFirewall(reply, new Set(allowedMillimes)) ? reply : null;
}

export interface Totals {
  subtotalMillimes: number;
  discountMillimes: number;
  deliveryFeeMillimes: number;
  totalMillimes: number;
  freeDelivery: boolean;
}

/**
 * Order totals in integer millimes: subtotal (list x qty) - discount
 * (list - agreed, x qty) + delivery fee. Delivery is free when the net
 * merchandise total reaches the merchant threshold. The fee itself comes
 * from the seller's `delivery_fees` table (looked up by the caller).
 */
export function computeTotals(input: {
  listUnitMillimes: number;
  agreedUnitMillimes: number;
  quantity: number;
  feeMillimes: number;
  freeDeliveryThresholdMillimes?: number | null;
}): Totals {
  const qty = Math.max(1, Math.floor(input.quantity));
  const subtotalMillimes = input.listUnitMillimes * qty;
  const discountMillimes = Math.max(0, input.listUnitMillimes - input.agreedUnitMillimes) * qty;
  const net = subtotalMillimes - discountMillimes;
  const freeDelivery =
    input.freeDeliveryThresholdMillimes !== null &&
    input.freeDeliveryThresholdMillimes !== undefined &&
    input.freeDeliveryThresholdMillimes > 0 &&
    net >= input.freeDeliveryThresholdMillimes;
  const deliveryFeeMillimes = freeDelivery ? 0 : input.feeMillimes;
  return {
    subtotalMillimes,
    discountMillimes,
    deliveryFeeMillimes,
    totalMillimes: net + deliveryFeeMillimes,
    freeDelivery,
  };
}
