import { NextResponse } from "next/server";
import { z } from "zod";
import { buildDeterministicProBriefing, generateProBriefing } from "@/lib/pro/briefing";
import { requireProMerchant } from "@/lib/pro/guard";

const refreshSchema = z.object({
  windowHours: z.number().int().min(1).max(168).default(24),
});

export async function GET() {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const [{ data: briefings, error }, { count: unreadAlerts }, { count: newOpportunities }] =
    await Promise.all([
      supabase
        .from("agent_briefings")
        .select("id, merchant_id, period_start, period_end, headline, highlights, stats, action_items, created_at")
        .eq("merchant_id", merchant.id)
        .order("created_at", { ascending: false })
        .limit(7),
      supabase
        .from("pro_alerts")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchant.id)
        .eq("status", "unread"),
      supabase
        .from("opportunity_matches")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchant.id)
        .in("status", ["new", "shortlisted"]),
    ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let latest = briefings?.[0] ?? null;
  if (!latest) {
    // Never auto-call a reasoning LLM during GET / sidebar polling; build deterministic snapshot instead.
    latest = await buildDeterministicProBriefing(supabase, merchant.id);
  }

  return NextResponse.json({
    briefing: latest,
    history: briefings ?? [],
    badges: {
      unreadAlerts: unreadAlerts ?? 0,
      newOpportunities: newOpportunities ?? 0,
    },
  });
}

export async function POST(request: Request) {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;

  const parsed = refreshSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid windowHours parameter" }, { status: 400 });
  }

  const briefing = await generateProBriefing(gate.supabase, gate.merchant.id, {
    windowHours: parsed.data.windowHours,
  });

  return NextResponse.json({ briefing });
}
