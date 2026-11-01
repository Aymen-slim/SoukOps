import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export interface AnalyticsPayload {
  ordersByStatus: Array<{ status: string; count: number }>;
  ordersByRisk: Array<{ level: string; count: number }>;
  totals: {
    orders: number;
    revenueMillimes: number;
    discountMillimes: number;
    deliveryMillimes: number;
    delivered: number;
    returned: number;
    cancelled: number;
    returnRatePercent: number | null;
  };
  activity: {
    conversations: number;
    handovers: number;
    unmatchedDemands: number;
    landmarkMisses: number;
  };
}

function countBy(values: Array<string | null>): Array<{ status: string; count: number }> {
  const map = new Map<string, number>();
  for (const value of values) {
    const key = value ?? "—";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
}

/** Deterministic aggregates only — every number comes from stored rows, never from a model. */
export async function loadAnalytics(supabase: Admin, merchantId: string): Promise<AnalyticsPayload> {
  const [{ data: orders }, { data: riskEvents }, conversations, handovers, unmatched, misses] = await Promise.all([
    supabase
      .from("orders")
      .select("status, risk_level, total_millimes, discount_millimes, delivery_fee_millimes")
      .eq("merchant_id", merchantId)
      .limit(1000),
    supabase.from("risk_events").select("kind").eq("merchant_id", merchantId).limit(1000),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("merchant_id", merchantId),
    supabase.from("handover_logs").select("id", { count: "exact", head: true }),
    supabase.from("unmatched_demands").select("id", { count: "exact", head: true }).eq("merchant_id", merchantId),
    supabase.from("landmark_misses").select("id", { count: "exact", head: true }),
  ]);

  const rows = orders ?? [];
  const kinds = (riskEvents ?? []).map((row) => row.kind as string);
  const delivered = kinds.filter((k) => k === "delivered").length;
  const returned = kinds.filter((k) => k === "returned").length;
  const cancelled = kinds.filter((k) => k === "cancelled").length;
  const terminal = delivered + returned;

  return {
    ordersByStatus: countBy(rows.map((row) => row.status as string)),
    ordersByRisk: countBy(rows.map((row) => row.risk_level as string | null)).map(({ status, count }) => ({
      level: status,
      count,
    })),
    totals: {
      orders: rows.length,
      revenueMillimes: rows.reduce((sum, row) => sum + ((row.total_millimes as number) ?? 0), 0),
      discountMillimes: rows.reduce((sum, row) => sum + ((row.discount_millimes as number) ?? 0), 0),
      deliveryMillimes: rows.reduce((sum, row) => sum + ((row.delivery_fee_millimes as number) ?? 0), 0),
      delivered,
      returned,
      cancelled,
      returnRatePercent: terminal > 0 ? Math.round((returned / terminal) * 1000) / 10 : null,
    },
    activity: {
      conversations: conversations.count ?? 0,
      handovers: handovers.count ?? 0,
      unmatchedDemands: unmatched.count ?? 0,
      landmarkMisses: misses.count ?? 0,
    },
  };
}
