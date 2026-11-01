import { PERSONAS } from "@/lib/sim/personas";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export interface DemoResetCounts {
  orders: number;
  conversations: number;
  customers: number;
  shipments: number;
  courierJobs: number;
  fdParcels: number;
  unmatchedDemands: number;
}

/**
 * Clears demo traffic for one merchant so the stage flow can restart from a
 * clean shop: conversations/messages (cascade), orders and everything that
 * hangs off them, clone parcels, unmatched demands, and non-persona
 * customers. Preserves the catalog, landmarks, fees, merchant settings and
 * the seeded persona customers + their Day-5 risk histories.
 * Re-run `npm run seed:day5` afterwards if persona addresses were cleared.
 */
export async function resetDemoData(supabase: Admin, merchantId: string): Promise<DemoResetCounts> {
  const personaPhones = new Set(PERSONAS.map((p) => p.phone));

  const { data: orderRows } = await supabase.from("orders").select("id").eq("merchant_id", merchantId).limit(1000);
  const orderIds = (orderRows ?? []).map((row) => row.id as string);

  const { data: convRows } = await supabase.from("conversations").select("id").eq("merchant_id", merchantId).limit(1000);
  const conversationIds = (convRows ?? []).map((row) => row.id as string);

  const { data: customerRows } = await supabase
    .from("customers")
    .select("id, phone")
    .eq("merchant_id", merchantId)
    .limit(1000);
  const allCustomers = customerRows ?? [];
  const personaCustomerIds = allCustomers.filter((c) => personaPhones.has(c.phone as string)).map((c) => c.id as string);
  const extraCustomerIds = allCustomers.filter((c) => !personaPhones.has(c.phone as string)).map((c) => c.id as string);

  let shipments = 0;
  let courierJobs = 0;
  let fdParcels = 0;
  if (orderIds.length) {
    shipments = (await supabase.from("shipments").delete().in("order_id", orderIds).select("id")).data?.length ?? 0;
    courierJobs = (await supabase.from("courier_jobs").delete().in("order_id", orderIds).select("id")).data?.length ?? 0;
    fdParcels = (await supabase.from("fd_clone_parcels").delete().in("order_id", orderIds).select("id")).data?.length ?? 0;
    // Order-linked risk events only; persona histories have order_id = null and stay.
    await supabase.from("risk_events").delete().in("order_id", orderIds);
    await supabase.from("orders").delete().in("id", orderIds);
  }

  if (conversationIds.length) {
    await supabase.from("agent_events").delete().in("conversation_id", conversationIds);
    await supabase.from("landmark_misses").delete().in("conversation_id", conversationIds);
    await supabase.from("conversations").delete().in("id", conversationIds);
  }

  const unmatched = (await supabase.from("unmatched_demands").delete().eq("merchant_id", merchantId).select("id")).data
    ?.length ?? 0;

  // Persona buyers start fresh too: drop their addresses so the pin flow demos again.
  if (personaCustomerIds.length) {
    await supabase.from("addresses").delete().in("customer_id", personaCustomerIds);
  }
  let customers = 0;
  if (extraCustomerIds.length) {
    customers = (await supabase.from("customers").delete().in("id", extraCustomerIds).select("id")).data?.length ?? 0;
  }

  return {
    orders: orderIds.length,
    conversations: conversationIds.length,
    customers,
    shipments,
    courierJobs,
    fdParcels,
    unmatchedDemands: unmatched,
  };
}

export async function resetDemoForMerchant(merchantId: string): Promise<DemoResetCounts> {
  return resetDemoData(createAdminClient(), merchantId);
}
