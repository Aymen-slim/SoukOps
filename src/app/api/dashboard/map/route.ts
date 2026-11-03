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
  const [{ data: customers }, { data: addresses }] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id, name").in("id", customerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
    addressIds.length
      ? supabase.from("addresses").select("id, lat, lng, governorate, landmark").in("id", addressIds)
      : Promise.resolve({ data: [] as Array<{ id: string; lat: number | null; lng: number | null; governorate: string | null; landmark: string | null }> }),
  ]);
  const customerName = new Map((customers ?? []).map((customer) => [customer.id as string, (customer.name as string | null) ?? "Buyer"]));
  const addressById = new Map((addresses ?? []).map((address) => [address.id as string, address]));
  const pins = rows.flatMap((order) => {
    const address = order.address_id ? addressById.get(order.address_id as string) : undefined;
    const exact = address && typeof address.lat === "number" && typeof address.lng === "number";
    const approx = exact ? null : governoratePoint((address?.governorate as string | null) ?? null);
    const point = exact ? { lat: address.lat as number, lng: address.lng as number } : approx;
    if (!point) return [];
    return [
      {
        orderId: order.id as string,
        lat: point.lat,
        lng: point.lng,
        approximated: !exact,
        label: customerName.get(order.customer_id as string) ?? "Buyer",
        governorate: (address?.governorate as string | null) ?? null,
        landmark: (address?.landmark as string | null) ?? null,
        totalMillimes: order.total_millimes as number,
        status: order.status as string,
      },
    ];
  });
  return NextResponse.json({
    pins,
    mapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null,
  });
}
