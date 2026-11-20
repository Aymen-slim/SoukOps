import { NextResponse } from "next/server";
import { z } from "zod";
import { channelAdapter } from "@/lib/channels";
import { parseUuid } from "@/lib/dashboard/guard";
import { logEvent } from "@/lib/pipeline/events";
import { requireProMerchant } from "@/lib/pro/guard";

const applySchema = z.object({
  pitchText: z.string().trim().min(5).max(2500).optional(),
  sendViaDm: z.boolean().default(true),
});

/**
 * Explicit human-approved Apply / Respond action for an Opportunity match.
 * External opportunities NEVER auto-apply without this explicit human action (AGENTS.md).
 * Accepts either `opportunity_matches.id` or `opportunities.id`.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/pro/opportunities/[id]/apply">,
) {
  const { id } = await ctx.params;
  if (!parseUuid(id)) {
    return NextResponse.json({ error: "Invalid opportunity ID" }, { status: 400 });
  }

  const parsed = applySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid apply payload" }, { status: 400 });
  }

  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  // Match either by opportunity_matches.id or opportunity_id
  let { data: matchRow } = await supabase
    .from("opportunity_matches")
    .select("id, opportunity_id, draft_pitch, status")
    .eq("merchant_id", merchant.id)
    .eq("id", id)
    .maybeSingle();

  if (!matchRow) {
    const byOpp = await supabase
      .from("opportunity_matches")
      .select("id, opportunity_id, draft_pitch, status")
      .eq("merchant_id", merchant.id)
      .eq("opportunity_id", id)
      .maybeSingle();
    matchRow = byOpp.data;
  }

  if (!matchRow) {
    return NextResponse.json({ error: "Opportunity match not found" }, { status: 404 });
  }

  const matchId = String(matchRow.id);
  const opportunityId = String(matchRow.opportunity_id);
  const finalPitch =
    parsed.data.pitchText ?? (typeof matchRow.draft_pitch === "string" ? matchRow.draft_pitch : "");

  if (!finalPitch.trim()) {
    return NextResponse.json({ error: "A pitch message is required to apply" }, { status: 400 });
  }

  const { data: opp } = await supabase
    .from("opportunities")
    .select("id, source, conversation_id, title, apply_url")
    .eq("id", opportunityId)
    .maybeSingle();

  const conversationId =
    opp && typeof opp.conversation_id === "string" ? opp.conversation_id : null;

  let dmSent = false;
  if (conversationId && parsed.data.sendViaDm) {
    await channelAdapter.sendText(conversationId, finalPitch.trim());
    dmSent = true;
  }

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("opportunity_matches")
    .update({
      draft_pitch: finalPitch.trim(),
      status: "applied",
      updated_at: nowIso,
    })
    .eq("id", matchId)
    .eq("merchant_id", merchant.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Mark any linked alerts as acted
  await supabase
    .from("pro_alerts")
    .update({ status: "acted", updated_at: nowIso })
    .eq("merchant_id", merchant.id)
    .eq("opportunity_id", opportunityId)
    .eq("status", "unread");

  await logEvent(conversationId, "pro.opportunity.applied", {
    matchId,
    opportunityId,
    dmSent,
  });

  return NextResponse.json({
    ok: true,
    matchId,
    opportunityId,
    status: "applied",
    dmSent,
    applyUrl: opp && typeof opp.apply_url === "string" ? opp.apply_url : null,
  });
}
