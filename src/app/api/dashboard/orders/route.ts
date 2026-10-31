import { NextResponse } from "next/server";
import { requireMerchant } from "@/lib/dashboard/guard";
import { loadOrderQueue } from "@/lib/dashboard/orders";

export async function GET() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  try {
    const orders = await loadOrderQueue(gate.supabase, gate.merchant.id);
    return NextResponse.json({ orders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "lecture impossible";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
