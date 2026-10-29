import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, ctx: RouteContext<"/api/sim/conversations/[id]/trace">) {
  const { id } = await ctx.params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("agent_events")
    .select("id, kind, model, provider, latency_ms, ok, detail, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
