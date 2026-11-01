import { NextResponse } from "next/server";
import { loadDemand } from "@/lib/dashboard/demand";
import { requireMerchant } from "@/lib/dashboard/guard";

export async function GET() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  try {
    return NextResponse.json(await loadDemand(gate.supabase, gate.merchant.id));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "lecture impossible" }, { status: 500 });
  }
}
