import { channelAdapter } from "@/lib/channels";
import { draftFromSlots } from "@/lib/domain/draft";
import { agreedUnitMillimes, parseNegotiationState } from "@/lib/domain/negotiation";
import { computeCartTotals, computeTotals, firewallChecked, formatMillimesForChat, type Totals } from "@/lib/domain/pricing";
import { computeRisk, PIN_FAR_KM, type RiskResult } from "@/lib/domain/risk";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "./events";

type SupabaseClient = ReturnType<typeof createAdminClient>;

export const SUMMARY_HEADING = "Récap el commande:";

export interface OrderPreviewItem {
  productId: string;
  productName: string;
  size: string | null;
  quantity: number;
  listUnitMillimes: number;
  agreedUnitMillimes: number;
  stock: number;
}

export interface OrderPreview {
  conversationId: string;
  merchantId: string;
  customerId: string | null;
  productId: string;
  productName: string;
  size: string | null;
  quantity: number;
  items?: OrderPreviewItem[];
  listUnitMillimes: number;
  agreedUnitMillimes: number;
  stock: number;
  totals: Totals;
  risk: RiskResult;
  pinDistanceKm: number | null;
  addressId: string;
  customerName: string | null;
  phone: string | null;
  landmark: string | null;
  paymentLink: string | null;
}

function slotStr(slots: Record<string, unknown>, key: string): string | null {
  const v = slots[key];
  return typeof v === "string" && v.trim() ? v : null;
}

async function loadPreview(supabase: SupabaseClient, conversationId: string): Promise<OrderPreview | null> {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, merchant_id, customer_id, slots, negotiation")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return null;
  const slots = (conversation.slots ?? {}) as Record<string, unknown>;
  const productId = slotStr(slots, "matchedProductId");
  const addressId = slotStr(slots, "confirmedAddressId");
  if (!productId || !addressId) return null;

  const [{ data: product }, { data: merchant }, { data: customer }, { data: address }] = await Promise.all([
    supabase.from("products").select("id, name, price_millimes, floor_millimes, stock").eq("id", productId).maybeSingle(),
    supabase
      .from("merchants")
      .select("id, free_delivery_threshold_millimes, payment_link")
      .eq("id", conversation.merchant_id as string)
      .maybeSingle(),
    conversation.customer_id
      ? supabase.from("customers").select("id, name, phone").eq("id", conversation.customer_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("addresses").select("id, landmark, governorate, delegation, confirmed_at").eq("id", addressId).maybeSingle(),
  ]);
  if (!product || !address?.confirmed_at) return null;

  let feeMillimes = 0;
  if (address.governorate) {
    const { data: fees } = await supabase
      .from("delivery_fees")
      .select("delegation, fee_millimes")
      .eq("merchant_id", conversation.merchant_id as string)
      .eq("governorate", address.governorate as string);
    const match =
      (fees ?? []).find((f) => f.delegation && address.delegation && f.delegation === address.delegation) ??
      (fees ?? []).find((f) => !f.delegation) ??
      (fees ?? [])[0];
    feeMillimes = (match?.fee_millimes as number) ?? 0;
  }

  const negotiation = parseNegotiationState(conversation.negotiation);
  const agreed = agreedUnitMillimes(negotiation, product.price_millimes as number);
  const quantity = typeof slots.quantity === "number" && slots.quantity > 0 ? Math.floor(slots.quantity) : 1;
  // Cart: the draft (synced with the flat matched* slots) wins when present.
  const draftItems = draftFromSlots(slots).items;
  const itemSpecs =
    draftItems.length > 0
      ? draftItems
          .map((i) => ({ productId: i.productId, size: i.size, quantity: i.quantity }))
          .filter((i): i is { productId: string; size: string | null; quantity: number } => Boolean(i.productId))
      : [{ productId: product.id as string, size: slotStr(slots, "size"), quantity }];
  const items: OrderPreviewItem[] = [];
  for (const spec of itemSpecs) {
    const { data: ip } =
      spec.productId === (product.id as string)
        ? { data: product }
        : await supabase.from("products").select("id, name, price_millimes, floor_millimes, stock").eq("id", spec.productId).maybeSingle();
    if (!ip) return null;
    const list = ip.price_millimes as number;
    items.push({
      productId: ip.id as string,
      productName: ip.name as string,
      size: spec.size,
      quantity: spec.quantity,
      listUnitMillimes: list,
      // Negotiation ladder applies to the primary item; added items stay at list.
      agreedUnitMillimes: spec.productId === (product.id as string) ? agreed : list,
      stock: ip.stock as number,
    });
  }
  if (items.length === 0) return null;
  const totals =
    items.length === 1
      ? computeTotals({
          listUnitMillimes: items[0].listUnitMillimes,
          agreedUnitMillimes: items[0].agreedUnitMillimes,
          quantity: items[0].quantity,
          feeMillimes,
          freeDeliveryThresholdMillimes: (merchant?.free_delivery_threshold_millimes as number | null) ?? null,
        })
      : computeCartTotals({
          items: items.map((i) => ({ listUnitMillimes: i.listUnitMillimes, agreedUnitMillimes: i.agreedUnitMillimes, quantity: i.quantity })),
          feeMillimes,
          freeDeliveryThresholdMillimes: (merchant?.free_delivery_threshold_millimes as number | null) ?? null,
        });

  let historyKinds: string[] = [];
  if (conversation.customer_id) {
    const { data: events } = await supabase
      .from("risk_events")
      .select("kind")
      .eq("customer_id", conversation.customer_id as string);
    historyKinds = (events ?? []).map((e) => e.kind as string);
  }
  const pinDistanceKm = typeof slots.pinDistanceKm === "number" ? slots.pinDistanceKm : null;
  const risk = computeRisk({ historyKinds, pinDistanceKm });

  return {
    conversationId,
    merchantId: conversation.merchant_id as string,
    customerId: (conversation.customer_id as string | null) ?? null,
    productId: product.id as string,
    productName: product.name as string,
    size: slotStr(slots, "size"),
    quantity,
    items,
    listUnitMillimes: product.price_millimes as number,
    agreedUnitMillimes: agreed,
    stock: product.stock as number,
    totals,
    risk,
    pinDistanceKm,
    addressId,
    customerName: slotStr(slots, "customerName") ?? ((customer?.name as string | null) ?? null),
    phone: slotStr(slots, "phone") ?? ((customer?.phone as string | null) ?? null),
    landmark: (address.landmark as string | null) ?? null,
    paymentLink: (merchant?.payment_link as string | null) ?? null,
  };
}

/** Fixed summary template — never model text. Every amount comes from pricing.ts. */
export function buildSummaryText(p: OrderPreview): string {
  const items = p.items && p.items.length > 0 ? p.items : null;
  const lines = ["Mrigel! Haka el commande mte3ek, choufha bel 3ayni w akked:", SUMMARY_HEADING];
  if (items) {
    for (const item of items) {
      lines.push(`• Produit: ${item.productName}${item.size ? ` (taille ${item.size})` : ""} x${item.quantity}`);
      lines.push(`• Soum: ${formatMillimesForChat(item.agreedUnitMillimes)}`);
    }
  } else {
    lines.push(`• Produit: ${p.productName}${p.size ? ` (taille ${p.size})` : ""} x${p.quantity}`);
    lines.push(`• Soum: ${formatMillimesForChat(p.agreedUnitMillimes)}`);
  }
  if (p.totals.discountMillimes > 0) lines.push(`• Remise: -${formatMillimesForChat(p.totals.discountMillimes)}`);
  lines.push(
    p.totals.freeDelivery
      ? "• Livraison: gratuite"
      : `• Livraison: ${formatMillimesForChat(p.totals.deliveryFeeMillimes)}`,
  );
  lines.push(`• Total: ${formatMillimesForChat(p.totals.totalMillimes)}`);
  if (p.customerName) lines.push(`• Esm: ${p.customerName}`);
  if (p.phone) lines.push(`• Téléphone: ${p.phone}`);
  if (p.landmark) lines.push(`• Adresse: 9rib le ${p.landmark} (pin m2akked)`);
  if (p.risk.level === "red") {
    lines.push(
      p.paymentLink
        ? `• Lezem t5allas avance houni bch nakkedou el envoi: ${p.paymentLink}`
        : "• Lezem tekhou el commande mel bureau el mouwasel (pickup), ma najmnach el livraison lel dar lel commande hethi.",
    );
  }
  lines.push("Ken el ma3loumet koll s7a7, e8et [Akked]. Ken t7eb tbaddel haja, e8et [Beddel], 3adi.");
  return lines.join("\n");
}

export function summaryAllowedAmounts(p: OrderPreview): number[] {
  const itemAmounts = (p.items ?? []).flatMap((i) => [i.agreedUnitMillimes, i.listUnitMillimes]);
  return [
    p.agreedUnitMillimes,
    ...itemAmounts,
    p.totals.subtotalMillimes,
    p.totals.discountMillimes,
    p.totals.deliveryFeeMillimes,
    p.totals.totalMillimes,
  ].filter((n) => n > 0);
}

/** Computes risk + totals and sends the fixed summary with Akked/Beddel. */
export async function sendSummary(supabase: SupabaseClient, conversationId: string): Promise<boolean> {
  const preview = await loadPreview(supabase, conversationId);
  if (!preview) return false;

  const { data: conversation } = await supabase
    .from("conversations")
    .select("slots")
    .eq("id", conversationId)
    .single();
  const slots = { ...((conversation?.slots ?? {}) as Record<string, unknown>) };
  slots.summaryPending = true;
  slots.summary = {
    agreedUnitMillimes: preview.agreedUnitMillimes,
    totalMillimes: preview.totals.totalMillimes,
    deliveryFeeMillimes: preview.totals.deliveryFeeMillimes,
    riskLevel: preview.risk.level,
    riskScore: preview.risk.score,
  };
  await supabase
    .from("conversations")
    .update({ slots })
    .eq("id", conversationId);

  const text = firewallChecked(buildSummaryText(preview), summaryAllowedAmounts(preview)) ?? SUMMARY_HEADING;
  await channelAdapter.sendButtons(conversationId, text, [
    { id: "akked", title: "Akked" },
    { id: "beddel", title: "Beddel" },
  ]);
  await logEvent(conversationId, "risk.scored", {
    score: preview.risk.score,
    level: preview.risk.level,
    reasons: preview.risk.reasons,
  });
  await logEvent(conversationId, "order.summary_sent", {
    totalMillimes: preview.totals.totalMillimes,
    riskLevel: preview.risk.level,
  });
  return true;
}

export type AkkedResult =
  | { ok: true; orderId: string; alreadyExisted: boolean }
  | { ok: false; reason: string };

/**
 * The ONLY order-creation path (AGENTS.md): explicit buyer Akked, after
 * phone + confirmed pin. Re-validates every gate and stock at write time,
 * and is idempotent per conversation.
 */
export async function createOrderFromAkked(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<AkkedResult> {
  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("status", "CONFIRMED_BY_BUYER")
    .maybeSingle();
  if (existing) return { ok: true, orderId: existing.id as string, alreadyExisted: true };

  const { data: conversation } = await supabase
    .from("conversations")
    .select("slots")
    .eq("id", conversationId)
    .maybeSingle();
  const slots = { ...((conversation?.slots ?? {}) as Record<string, unknown>) };
  if (slots.summaryPending !== true) return { ok: false, reason: "no_pending_summary" };
  if (!slotStr(slots, "phone")) return { ok: false, reason: "missing_phone" };

  const preview = await loadPreview(supabase, conversationId);
  if (!preview) return { ok: false, reason: "missing_product_or_confirmed_address" };
  const cartItems = preview.items && preview.items.length > 0 ? preview.items : null;
  if (cartItems ? cartItems.some((i) => i.stock < i.quantity) : preview.stock < preview.quantity) {
    return { ok: false, reason: "out_of_stock" };
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      merchant_id: preview.merchantId,
      customer_id: preview.customerId,
      conversation_id: conversationId,
      address_id: preview.addressId,
      status: "CONFIRMED_BY_BUYER",
      subtotal_millimes: preview.totals.subtotalMillimes,
      discount_millimes: preview.totals.discountMillimes,
      delivery_fee_millimes: preview.totals.deliveryFeeMillimes,
      total_millimes: preview.totals.totalMillimes,
      risk_score: preview.risk.score,
      risk_level: preview.risk.level,
      risk_reasons: preview.risk.reasons,
    })
    .select("id")
    .single();
  if (orderError || !order) return { ok: false, reason: `order insert failed: ${orderError?.message}` };

  const rows = (
    preview.items && preview.items.length > 0
      ? preview.items
      : [
          {
            productId: preview.productId,
            productName: preview.productName,
            size: preview.size,
            quantity: preview.quantity,
            agreedUnitMillimes: preview.agreedUnitMillimes,
          },
        ]
  ).map((item) => ({
    order_id: order.id as string,
    product_id: item.productId,
    variant_id: null,
    name_snapshot: item.size ? `${item.productName} (${item.size})` : item.productName,
    unit_price_millimes: item.agreedUnitMillimes,
    quantity: item.quantity,
  }));
  const { error: itemError } = await supabase.from("order_items").insert(rows);
  if (itemError) return { ok: false, reason: `order item insert failed: ${itemError.message}` };

  if (preview.pinDistanceKm !== null && preview.pinDistanceKm > PIN_FAR_KM) {
    await supabase.from("risk_events").insert({
      merchant_id: preview.merchantId,
      customer_id: preview.customerId,
      order_id: order.id as string,
      kind: "pin_far",
      detail: { distanceKm: preview.pinDistanceKm },
    });
  }

  slots.summaryPending = false;
  slots.orderId = order.id as string;
  await supabase
    .from("conversations")
    .update({ slots })
    .eq("id", conversationId);

  const name = preview.customerName?.trim();
  await channelAdapter.sendText(
    conversationId,
    name
      ? `Takkdet el commande, yesss! ${name}, 3aychek. El vendeur ychoufha taw w yab3athha. Ken t7eb haja okhra, ana houni.`
      : "Takkdet el commande, yesss! 3aychek. El vendeur ychoufha taw w yab3athha. Ken t7eb haja okhra, ana houni.",
  );
  await logEvent(conversationId, "order.created", {
    orderId: order.id as string,
    totalMillimes: preview.totals.totalMillimes,
    riskLevel: preview.risk.level,
    riskScore: preview.risk.score,
  });
  return { ok: true, orderId: order.id as string, alreadyExisted: false };
}

/** Beddel: drop the pending summary, create nothing, ask what to change. */
export async function handleBeddel(supabase: SupabaseClient, conversationId: string): Promise<void> {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("slots")
    .eq("id", conversationId)
    .maybeSingle();
  const slots = { ...((conversation?.slots ?? {}) as Record<string, unknown>) };
  slots.summaryPending = false;
  delete slots.summary;
  await supabase
    .from("conversations")
    .update({ slots })
    .eq("id", conversationId);
  await channelAdapter.sendText(
    conversationId,
    "Ma femma hatta mochkel, 3adi. Chnowa nbedlou? El taille, el quantité, el produit, walla el adresse? 9olli direct (ex: beddel el taille l XL) w nbeddelha taw.",
  );
  await logEvent(conversationId, "order.beddel", {});
}
