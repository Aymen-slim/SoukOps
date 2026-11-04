import { NextResponse } from "next/server";
import { requireMerchant } from "@/lib/dashboard/guard";
import { governoratePoint } from "@/lib/geo/tunisia";

export async function GET() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, customer_id, address_id, total_millimes, status, created_at")
    .eq("merchant_id", merchant.id)
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = orders ?? [];
  const customerIds = [...new Set(rows.map((row) => row.customer_id).filter((id): id is string => Boolean(id)))];
  const addressIds = [...new Set(rows.map((row) => row.address_id).filter((id): id is string => Boolean(id)))];
  const [{ data: customers }, { data: addresses }, { data: items }] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id, name, phone").in("id", customerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null; phone: string | null }> }),
    addressIds.length
      ? supabase.from("addresses").select("id, lat, lng, governorate, landmark, delegation").in("id", addressIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            lat: number | null;
            lng: number | null;
            governorate: string | null;
            landmark: string | null;
            delegation: string | null;
          }>,
        }),
    rows.length
      ? supabase.from("order_items").select("order_id, name_snapshot, quantity").in(
          "order_id",
          rows.map((row) => row.id as string),
        )
      : Promise.resolve({ data: [] as Array<{ order_id: string; name_snapshot: string; quantity: number }> }),
  ]);
  const customerById = new Map(
    (customers ?? []).map((customer) => [
      customer.id as string,
      { name: (customer.name as string | null) ?? "Buyer", phone: (customer.phone as string | null) ?? null },
    ]),
  );
  const addressById = new Map((addresses ?? []).map((address) => [address.id as string, address]));
  const summaryByOrder = new Map<string, string>();
  for (const item of items ?? []) {
    const orderId = item.order_id as string;
    const label = `${(item.name_snapshot as string) || "Item"} x${(item.quantity as number) || 1}`;
    summaryByOrder.set(orderId, summaryByOrder.has(orderId) ? `${summaryByOrder.get(orderId)}, ${label}` : label);
  }
  const pins = rows.flatMap((order) => {
    const address = order.address_id ? addressById.get(order.address_id as string) : undefined;
    const exact = address && typeof address.lat === "number" && typeof address.lng === "number";
    const approx = exact ? null : governoratePoint((address?.governorate as string | null) ?? null);
    const point = exact ? { lat: address.lat as number, lng: address.lng as number } : approx;
    if (!point) return [];
    const customer = customerById.get(order.customer_id as string);
    return [
      {
        orderId: order.id as string,
        lat: point.lat,
        lng: point.lng,
        approximated: !exact,
        label: customer?.name ?? "Buyer",
        phone: customer?.phone ?? null,
        governorate: (address?.governorate as string | null) ?? null,
        landmark: (address?.landmark as string | null) ?? null,
        delegation: (address?.delegation as string | null) ?? null,
        itemSummary: summaryByOrder.get(order.id as string) ?? "Order",
        totalMillimes: order.total_millimes as number,
        status: order.status as string,
        canPrint: Boolean(exact),
      },
    ];
  });
  return NextResponse.json({
    pins,
    mapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null,
  });
}
