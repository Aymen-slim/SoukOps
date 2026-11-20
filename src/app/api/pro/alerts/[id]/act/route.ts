import { NextResponse } from "next/server";
import { z } from "zod";
import { channelAdapter } from "@/lib/channels";
import { parseUuid } from "@/lib/dashboard/guard";
import { logEvent } from "@/lib/pipeline/events";
import { requireProMerchant } from "@/lib/pro/guard";

const actSchema = z.object({
  action: z.enum(["approve_send", "acknowledge", "dismiss", "takeover"]),
  replyText: z.string().trim().min(1).max(2500).optional(),
});

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/pro/alerts/[id]/act">,
) {
  const { id } = await ctx.params;
  if (!parseUuid(id)) {
    return NextResponse.json({ error: "Invalid alert ID" }, { status: 400 });
  }

  const parsed = actSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid alert action payload" }, { status: 400 });
  }

  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const { data: alert, error: fetchErr } = await supabase
    .from("pro_alerts")
    .select("id, conversation_id, opportunity_id, draft_reply, status")
    .eq("id", id)
    .eq("merchant_id", merchant.id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  const { action, replyText } = parsed.data;
  const conversationId = typeof alert.conversation_id === "string" ? alert.conversation_id : null;
  let nextStatus: "acknowledged" | "acted" | "dismissed" = "acknowledged";
  let sentMessage = false;

  if (action === "approve_send") {
    const textToSend = replyText ?? (typeof alert.draft_reply === "string" ? alert.draft_reply : "");
    if (!textToSend.trim()) {
      return NextResponse.json({ error: "No reply text or draft_reply available to send" }, { status: 400 });
    }
    if (conversationId) {
      await channelAdapter.sendText(conversationId, textToSend.trim());
      sentMessage = true;
      await logEvent(conversationId, "pro.alert.approved_send", { alertId: id });
    }
    if (typeof alert.opportunity_id === "string") {
      await supabase
        .from("opportunity_matches")
        .update({ status: "applied", updated_at: new Date().toISOString() })
        .eq("merchant_id", merchant.id)
        .eq("opportunity_id", alert.opportunity_id);
    }
    nextStatus = "acted";
  } else if (action === "takeover") {
    if (conversationId) {
      await supabase
        .from("conversations")
        .update({ ai_paused: true })
        .eq("id", conversationId)
        .eq("merchant_id", merchant.id);
      await logEvent(conversationId, "pro.alert.takeover", { alertId: id });
    }
    nextStatus = "acted";
  } else if (action === "dismiss") {
    nextStatus = "dismissed";
  } else {
    nextStatus = "acknowledged";
  }

  const { error: updateErr } = await supabase
    .from("pro_alerts")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("merchant_id", merchant.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id,
    status: nextStatus,
    sentMessage,
    conversationId,
  });
}
