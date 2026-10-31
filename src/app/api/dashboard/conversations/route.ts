import { NextResponse } from "next/server";
import { requireMerchant } from "@/lib/dashboard/guard";

function previewMessage(kind: string | undefined, body: string | null): string | null {
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

export async function GET() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("id, ai_paused, customer_id, updated_at")
    .eq("merchant_id", merchant.id)
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (conversations ?? []).map((row) => row.id as string);
  const customerIds = [...new Set((conversations ?? []).map((row) => row.customer_id).filter((id): id is string => Boolean(id)))];
  const [{ data: customers }, { data: messages }, { data: logs }] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id, name, phone").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null; phone: string | null }[] }),
    ids.length
      ? supabase
          .from("messages")
          .select("conversation_id, body, direction, kind, created_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as { conversation_id: string; body: string | null; direction: string; kind: string; created_at: string }[] }),
    ids.length
      ? supabase
          .from("handover_logs")
          .select("conversation_id, reason, created_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { conversation_id: string; reason: string; created_at: string }[] }),
  ]);

  const rows = (conversations ?? []).map((row) => {
    const customer = (customers ?? []).find((entry) => entry.id === row.customer_id);
    const last = (messages ?? []).find((entry) => entry.conversation_id === row.id);
    const lastBody = previewMessage(last?.kind as string | undefined, (last?.body as string | null) ?? null);
    const handover = (logs ?? []).find((entry) => entry.conversation_id === row.id);
    return {
      id: row.id as string,
      aiPaused: Boolean(row.ai_paused),
      customerName: (customer?.name as string | null) ?? null,
      phone: (customer?.phone as string | null) ?? null,
      updatedAt: row.updated_at as string,
      lastMessage: lastBody,
      lastDirection: (last?.direction as string | null) ?? null,
      handoverReason: row.ai_paused ? ((handover?.reason as string | null) ?? null) : null,
    };
  });
  return NextResponse.json({ conversations: rows });
}
