import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProMerchant } from "@/lib/pro/guard";

const patchMatchSchema = z.object({
  matchId: z.string().uuid(),
  status: z.enum(["new", "shortlisted", "dismissed"]).optional(),
  draftPitch: z.string().trim().min(5).max(2000).optional(),
});

export async function GET(request: Request) {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const url = new URL(request.url);
  const sourceFilter = url.searchParams.get("source");
  const statusFilter = url.searchParams.get("status");

  let matchQuery = supabase
    .from("opportunity_matches")
    .select(
      "id, merchant_id, opportunity_id, fit_score, urgency, fit_reasons, draft_pitch, status, created_at, updated_at",
    )
    .eq("merchant_id", merchant.id)
    .order("fit_score", { ascending: false })
    .limit(60);

  if (statusFilter && ["new", "shortlisted", "applied", "dismissed"].includes(statusFilter)) {
    matchQuery = matchQuery.eq("status", statusFilter);
  }

  const { data: matches, error } = await matchQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const oppIds = [...new Set((matches ?? []).map((m) => String(m.opportunity_id)).filter(Boolean))];
  const { data: opps } = oppIds.length
    ? await supabase
        .from("opportunities")
        .select(
          "id, source, conversation_id, title, brand_or_client, category, description, compensation_text, budget_millimes, deadline_at, apply_url, created_at",
        )
        .in("id", oppIds)
    : { data: [] as Array<Record<string, unknown>> };

  const oppMap = new Map(
    ((opps ?? []) as Array<Record<string, unknown>>).map((o) => [String(o.id), o]),
  );

  let combined = (matches ?? [])
    .map((m) => {
      const opp = oppMap.get(String(m.opportunity_id)) ?? null;
      return {
        ...m,
        opportunity: opp,
      };
    })
    .filter((item) => item.opportunity !== null);

  if (sourceFilter === "dm") {
    combined = combined.filter((item) => {
      const src = String((item.opportunity as Record<string, unknown>).source);
      return src === "dm" || src === "comment";
    });
  } else if (sourceFilter === "board") {
    combined = combined.filter((item) => {
      const src = String((item.opportunity as Record<string, unknown>).source);
      return src === "board" || src === "manual";
    });
  }

  return NextResponse.json({
    opportunities: combined,
    counts: {
      total: combined.length,
      dm: combined.filter((i) => {
        const src = String((i.opportunity as Record<string, unknown>).source);
        return src === "dm" || src === "comment";
      }).length,
      board: combined.filter((i) => {
        const src = String((i.opportunity as Record<string, unknown>).source);
        return src === "board" || src === "manual";
      }).length,
    },
  });
}

export async function PATCH(request: Request) {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const parsed = patchMatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid opportunity update payload" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.status) patch.status = parsed.data.status;
  if (parsed.data.draftPitch) patch.draft_pitch = parsed.data.draftPitch;

  const { data, error } = await supabase
    .from("opportunity_matches")
    .update(patch)
    .eq("id", parsed.data.matchId)
    .eq("merchant_id", merchant.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Opportunity match not found" }, { status: 404 });
  }

  return NextResponse.json({ match: data });
}
