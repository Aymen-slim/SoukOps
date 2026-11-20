import { NextResponse } from "next/server";
import { requireProMerchant } from "@/lib/pro/guard";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  urgent: 1,
  important: 2,
  info: 3,
};

export async function GET(request: Request) {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");
  const severityFilter = url.searchParams.get("severity");

  let query = supabase
    .from("pro_alerts")
    .select(
      "id, merchant_id, conversation_id, opportunity_id, inquiry_id, severity, category, title, summary, recommended_action, draft_reply, status, notified_channels, created_at, updated_at",
    )
    .eq("merchant_id", merchant.id)
    .order("created_at", { ascending: false })
    .limit(60);

  if (statusFilter && ["unread", "acknowledged", "acted", "dismissed"].includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  }
  if (severityFilter && ["info", "important", "urgent", "critical"].includes(severityFilter)) {
    query = query.eq("severity", severityFilter);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const alerts = [...(data ?? [])].sort((a, b) => {
    const aUnread = a.status === "unread" ? 0 : 1;
    const bUnread = b.status === "unread" ? 0 : 1;
    if (aUnread !== bUnread) return aUnread - bUnread;
    const sevDiff =
      (SEVERITY_ORDER[String(a.severity)] ?? 9) - (SEVERITY_ORDER[String(b.severity)] ?? 9);
    if (sevDiff !== 0) return sevDiff;
    return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
  });

  const unreadCount = alerts.filter((a) => a.status === "unread").length;
  return NextResponse.json({ alerts, unreadCount });
}
