import { NextResponse } from "next/server";
import { requireMerchant } from "@/lib/dashboard/guard";

export async function GET() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;
  const [{ data: customers, error }, { data: orders }, { data: conversations }, { data: addresses }] = await Promise.all([
    supabase.from("customers").select("id, name, phone, created_at").eq("merchant_id", merchant.id).order("created_at", { ascending: false }).limit(200),
    supabase.from("orders").select("id, customer_id, status").eq("merchant_id", merchant.id).limit(1000),
    supabase.from("conversations").select("id, customer_id, updated_at").eq("merchant_id", merchant.id).order("updated_at", { ascending: false }).limit(500),
    supabase.from("addresses").select("customer_id, governorate, created_at").order("created_at", { ascending: false }).limit(1000),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const cityByCustomer = new Map<string, string | null>();
  for (const address of addresses ?? []) {
    const customerId = address.customer_id as string;
    if (!cityByCustomer.has(customerId)) cityByCustomer.set(customerId, (address.governorate as string | null) ?? null);
  }
  const ordersByCustomer = new Map<string, { count: number; latestId: string | null }>();
  for (const order of orders ?? []) {
    const customerId = order.customer_id as string | null;
    if (!customerId || order.status === "CANCELLED") continue;
    const current = ordersByCustomer.get(customerId) ?? { count: 0, latestId: null };
    current.count += 1;
    current.latestId ??= order.id as string;
    ordersByCustomer.set(customerId, current);
  }
  const conversationByCustomer = new Map<string, string>();
  for (const conversation of conversations ?? []) {
    const customerId = conversation.customer_id as string | null;
    if (customerId && !conversationByCustomer.has(customerId)) conversationByCustomer.set(customerId, conversation.id as string);
  }
  return NextResponse.json({
    clients: (customers ?? []).map((customer) => {
      const id = customer.id as string;
      const ordersFor = ordersByCustomer.get(id);
      return {
        id,
        name: (customer.name as string | null) ?? "Buyer",
        phone: (customer.phone as string | null) ?? null,
        city: cityByCustomer.get(id) ?? null,
        orderCount: ordersFor?.count ?? 0,
        latestOrderId: ordersFor?.latestId ?? null,
        conversationId: conversationByCustomer.get(id) ?? null,
      };
    }),
  });
}
