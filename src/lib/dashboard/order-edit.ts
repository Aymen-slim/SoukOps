import { z } from "zod";
import { computeTotals } from "@/lib/domain/pricing";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export const orderEditSchema = z.object({
  customerName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(6).max(40).optional(),
  landmark: z.string().trim().max(200).optional(),
  driverNote: z.string().trim().max(300).optional(),
  quantity: z.number().int().min(1).max(20).optional(),
});

export async function editOrder(
  supabase: Admin,
  merchantId: string,
  orderId: string,
  input: z.infer<typeof orderEditSchema>,
  freeDeliveryThresholdMillimes: number | null,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, customer_id, address_id, subtotal_millimes, discount_millimes, delivery_fee_millimes, status")
    .eq("id", orderId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!order) return { ok: false, error: "Order not found.", status: 404 };
  if (order.status === "CANCELLED") return { ok: false, error: "This order is cancelled.", status: 400 };

  if ((input.customerName || input.phone) && order.customer_id) {
    const customerUpdate: Record<string, string> = {};
    if (input.customerName) customerUpdate.name = input.customerName;
    if (input.phone) customerUpdate.phone = input.phone;
    const { error: customerError } = await supabase.from("customers").update(customerUpdate).eq("id", order.customer_id as string);
    if (customerError) return { ok: false, error: customerError.message, status: 400 };
  }

  if (input.landmark !== undefined || input.driverNote !== undefined) {
    const addressUpdate: Record<string, string | null> = {};
    if (input.landmark !== undefined) addressUpdate.landmark = input.landmark || null;
    if (input.driverNote !== undefined) addressUpdate.driver_note = input.driverNote || null;
    if (order.address_id) {
      const { error: addressError } = await supabase.from("addresses").update(addressUpdate).eq("id", order.address_id as string);
      if (addressError) return { ok: false, error: addressError.message, status: 500 };
    } else if (order.customer_id) {
      const { data: address, error: addressError } = await supabase
        .from("addresses")
        .insert({ customer_id: order.customer_id, ...addressUpdate })
        .select("id")
        .single();
      if (addressError || !address) return { ok: false, error: addressError?.message ?? "address failed", status: 500 };
      await supabase.from("orders").update({ address_id: address.id }).eq("id", orderId);
    }
  }

  if (input.quantity !== undefined) {
    const { data: item } = await supabase
      .from("order_items")
      .select("id, quantity, unit_price_millimes")
      .eq("order_id", orderId)
      .limit(1)
      .maybeSingle();
    if (item) {
      const oldQty = Math.max(1, (item.quantity as number) || 1);
      const listUnit = Math.round((order.subtotal_millimes as number) / oldQty);
      const agreedUnit = item.unit_price_millimes as number;
      const totals = computeTotals({
        listUnitMillimes: listUnit,
        agreedUnitMillimes: agreedUnit,
        quantity: input.quantity,
        feeMillimes: order.delivery_fee_millimes as number,
        freeDeliveryThresholdMillimes,
      });
      const { error: itemError } = await supabase.from("order_items").update({ quantity: input.quantity }).eq("id", item.id as string);
      if (itemError) return { ok: false, error: itemError.message, status: 500 };
      const { error: totalError } = await supabase
        .from("orders")
        .update({
          subtotal_millimes: totals.subtotalMillimes,
          discount_millimes: totals.discountMillimes,
          delivery_fee_millimes: totals.deliveryFeeMillimes,
          total_millimes: totals.totalMillimes,
        })
        .eq("id", orderId);
      if (totalError) return { ok: false, error: totalError.message, status: 500 };
    }
  }
  return { ok: true };
}

export async function hideOrder(
  supabase: Admin,
  merchantId: string,
  orderId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data, error } = await supabase
    .from("orders")
    .update({ status: "CANCELLED", hidden_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("merchant_id", merchantId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!data) return { ok: false, error: "Order not found.", status: 404 };
  return { ok: true };
}
