import { NextResponse } from "next/server";
import { z } from "zod";
import { channelAdapter } from "@/lib/channels";
import { parseUuid } from "@/lib/dashboard/guard";
import { logEvent } from "@/lib/pipeline/events";
import { requireProMerchant } from "@/lib/pro/guard";

const inboxActionSchema = z.object({
  conversationId: z.string().uuid(),
  action: z.enum(["reply", "pause", "resume"]),
  text: z.string().trim().min(1).max(2500).optional(),
});

function previewBody(kind: string | undefined, body: string | null): string | null {
  if (!body) return null;
  if (kind === "buttons" || kind === "pin_link") {
    try {
      const parsed = JSON.parse(body) as { text?: string };
      return parsed.text ?? body;
    } catch {
      return body;
    }
  }
  return body.length > 180 ? `${body.slice(0, 177)}…` : body;
}

export async function GET(request: Request) {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const url = new URL(request.url);
  const selectedId = url.searchParams.get("conversationId");

  if (selectedId) {
    if (!parseUuid(selectedId)) {
      return NextResponse.json({ error: "Invalid conversationId" }, { status: 400 });
    }
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, channel, ai_paused, slots, customer_id, updated_at")
      .eq("id", selectedId)
      .eq("merchant_id", merchant.id)
      .maybeSingle();
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    const [{ data: msgs }, { data: inquiry }, { data: customer }] = await Promise.all([
      supabase
        .from("messages")
        .select("id, direction, kind, body, media_path, created_at")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true })
        .limit(150),
      supabase
        .from("service_inquiries")
        .select("*")
        .eq("merchant_id", merchant.id)
        .eq("conversation_id", selectedId)
        .maybeSingle(),
      conv.customer_id
        ? supabase.from("customers").select("id, name, phone").eq("id", conv.customer_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return NextResponse.json({
      conversation: conv,
      customer,
      inquiry,
      messages: msgs ?? [],
    });
  }

  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("id, channel, ai_paused, customer_id, slots, updated_at")
    .eq("merchant_id", merchant.id)
    .order("updated_at", { ascending: false })
    .limit(40);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (conversations ?? []).map((c) => String(c.id));
  const customerIds = [
    ...new Set(
      (conversations ?? [])
        .map((c) => c.customer_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];

  const [{ data: customers }, { data: messages }, { data: inquiries }, { data: alerts }] =
    await Promise.all([
      customerIds.length
        ? supabase.from("customers").select("id, name, phone").in("id", customerIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string | null; phone: string | null }> }),
      ids.length
        ? supabase
            .from("messages")
            .select("conversation_id, body, direction, kind, created_at")
            .in("conversation_id", ids)
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({
            data: [] as Array<{
              conversation_id: string;
              body: string | null;
              direction: string;
              kind: string;
              created_at: string;
            }>,
          }),
      ids.length
        ? supabase
            .from("service_inquiries")
            .select("id, conversation_id, status, scope_summary, budget_millimes, requested_date")
            .eq("merchant_id", merchant.id)
            .in("conversation_id", ids)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      ids.length
        ? supabase
            .from("pro_alerts")
            .select("id, conversation_id, severity, title, status")
            .eq("merchant_id", merchant.id)
            .eq("status", "unread")
            .in("conversation_id", ids)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ]);

  const rows = (conversations ?? []).map((conv) => {
    const cid = String(conv.id);
    const customer = (customers ?? []).find((c) => c.id === conv.customer_id);
    const last = (messages ?? []).find((m) => m.conversation_id === cid);
    const inquiry = ((inquiries ?? []) as Array<Record<string, unknown>>).find(
      (i) => i.conversation_id === cid,
    );
    const alert = ((alerts ?? []) as Array<Record<string, unknown>>).find(
      (a) => a.conversation_id === cid,
    );
    const slots = (conv.slots ?? {}) as Record<string, unknown>;
    return {
      id: cid,
      channel: String(conv.channel ?? "simulator"),
      aiPaused: Boolean(conv.ai_paused),
      clientName:
        (typeof slots.clientName === "string" && slots.clientName) ||
        customer?.name ||
        null,
      phone:
        (typeof slots.clientPhone === "string" && slots.clientPhone) ||
        customer?.phone ||
        null,
      matchedServiceTitle:
        typeof slots.matchedServiceTitle === "string" ? slots.matchedServiceTitle : null,
      updatedAt: String(conv.updated_at),
      lastMessage: previewBody(last?.kind, last?.body ?? null),
      lastDirection: last?.direction ?? null,
      inquiry: inquiry
        ? {
            id: String(inquiry.id),
            status: String(inquiry.status),
            scopeSummary: String(inquiry.scope_summary ?? ""),
            budgetMillimes:
              typeof inquiry.budget_millimes === "number" ? inquiry.budget_millimes : null,
            requestedDate:
              typeof inquiry.requested_date === "string" ? inquiry.requested_date : null,
          }
        : null,
      unreadAlert: alert
        ? {
            id: String(alert.id),
            severity: String(alert.severity),
            title: String(alert.title),
          }
        : null,
    };
  });

  return NextResponse.json({ conversations: rows });
}

export async function POST(request: Request) {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const parsed = inboxActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid inbox action payload" }, { status: 400 });
  }
  const { conversationId, action, text } = parsed.data;

  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("merchant_id", merchant.id)
    .maybeSingle();

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (action === "reply") {
    if (!text?.trim()) {
      return NextResponse.json({ error: "Reply text is required" }, { status: 400 });
    }
    await channelAdapter.sendText(conversationId, text.trim());
    await logEvent(conversationId, "pro.human.reply", {});
    return NextResponse.json({ ok: true, action: "reply" });
  }

  const aiPaused = action === "pause";
  await supabase
    .from("conversations")
    .update({ ai_paused: aiPaused })
    .eq("id", conversationId)
    .eq("merchant_id", merchant.id);
  await logEvent(conversationId, aiPaused ? "pro.ai.paused" : "pro.ai.resumed", {});

  return NextResponse.json({ ok: true, action, aiPaused });
}
