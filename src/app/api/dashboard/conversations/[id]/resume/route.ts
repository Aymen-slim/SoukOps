import { NextResponse } from "next/server";
import { parseUuid, requireMerchant } from "@/lib/dashboard/guard";
import { logEvent } from "@/lib/pipeline/events";

export async function POST(_request: Request, ctx: RouteContext<"/api/dashboard/conversations/[id]/resume">) {
  const { id } = await ctx.params;
  if (!parseUuid(id)) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const { data: conversation } = await gate.supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("merchant_id", gate.merchant.id)
    .maybeSingle();
  if (!conversation) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const { error } = await gate.supabase.from("conversations").update({ ai_paused: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logEvent(id, "seller.resumed", {});
  return NextResponse.json({ ok: true });
}
