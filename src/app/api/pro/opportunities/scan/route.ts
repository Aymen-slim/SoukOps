import { NextResponse } from "next/server";
import { requireProMerchant } from "@/lib/pro/guard";
import { scanMerchantOpportunities } from "@/lib/pro/opportunities";

export async function POST() {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;

  try {
    const summary = await scanMerchantOpportunities(gate.supabase, gate.merchant.id);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Opportunity scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
