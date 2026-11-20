import { NextResponse } from "next/server";
import { requireProMerchant } from "@/lib/pro/guard";
import { ingestAndScoreOpportunity, opportunityIngestSchema } from "@/lib/pro/opportunities";

export async function POST(request: Request) {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;

  const parsed = opportunityIngestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid opportunity brief payload" },
      { status: 400 },
    );
  }

  try {
    const result = await ingestAndScoreOpportunity(gate.supabase, gate.merchant.id, parsed.data);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Opportunity ingest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
