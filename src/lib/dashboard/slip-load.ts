import { NextResponse } from "next/server";
import { renderDeliverySlip, slipPinError, type SlipFields } from "@/lib/couriers/slip";
import { parseUuid, requireMerchant } from "@/lib/dashboard/guard";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export async function loadDeliverySlip(
  supabase: Admin,
  merchantId: string,
  orderId: string,
): Promise<{ ok: true; slip: SlipFields } | { ok: false; status: number; error: string }> {
  const { data: order } = await supabase
    .from("orders")
    .select("id, merchant_id, customer_id, address_id, total_millimes, status")
    .eq("id", orderId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!order || order.status === "CANCELLED") {
    return { ok: false, status: 404, error: "Order not found." };
  }
  const [{ data: customer }, { data: address }, { data: items }, { data: merchant }] = await Promise.all([
    order.customer_id
      ? supabase.from("customers").select("name, phone").eq("id", order.customer_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
    order.address_id
      ? supabase
          .from("addresses")
          .select("lat, lng, landmark, floor, driver_note, governorate, delegation")
          .eq("id", order.address_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("order_items").select("name_snapshot, quantity").eq("order_id", orderId),
    supabase.from("merchants").select("name").eq("id", merchantId).maybeSingle(),
  ]);
  const lat = (address?.lat as number | null) ?? null;
  const lng = (address?.lng as number | null) ?? null;
  const pinError = slipPinError(lat, lng);
  if (pinError || lat == null || lng == null) {
    return { ok: false, status: 409, error: pinError ?? "Confirm the buyer pin before printing a courier slip." };
  }
  return {
    ok: true,
    slip: {
      orderId,
      shopName: (merchant?.name as string | null) ?? "Shop",
      customerName: (customer?.name as string | null) ?? "Buyer",
      phone: (customer?.phone as string | null) ?? "",
      items: (items ?? []).map((item) => ({
        name: (item.name_snapshot as string) || "Item",
        quantity: typeof item.quantity === "number" ? item.quantity : 1,
      })),
      totalMillimes: order.total_millimes as number,
      landmark: (address?.landmark as string | null) ?? null,
      floor: (address?.floor as string | null) ?? null,
      driverNote: (address?.driver_note as string | null) ?? null,
      governorate: (address?.governorate as string | null) ?? null,
      delegation: (address?.delegation as string | null) ?? null,
      lat,
      lng,
    },
  };
}

export async function slipPdfResponse(slip: SlipFields): Promise<NextResponse> {
  const pdf = await renderDeliverySlip(slip);
  const bytes = Buffer.from(pdf);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="slip-${slip.orderId.slice(0, 8)}.pdf"`,
    },
  });
}

export async function requireSlipOrder(id: string) {
  if (!parseUuid(id)) return { error: NextResponse.json({ error: "identifiant invalide" }, { status: 400 }) } as const;
  const gate = await requireMerchant();
  if ("error" in gate) return { error: gate.error } as const;
  return { gate } as const;
}
