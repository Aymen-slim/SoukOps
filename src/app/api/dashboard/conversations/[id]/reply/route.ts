import { NextResponse } from "next/server";
import { z } from "zod";
import { simulatorAdapter } from "@/lib/channels/simulator";
import { parseUuid, requireMerchant } from "@/lib/dashboard/guard";
import { logEvent } from "@/lib/pipeline/events";

const bodySchema = z.object({ text: z.string().trim().min(1).max(2000) });

export async function POST(request: Request, ctx: RouteContext<"/api/dashboard/conversations/[id]/reply">) {
  const { id } = await ctx.params;
  if (!parseUuid(id)) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "message vide" }, { status: 400 });

  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const { data: conversation } = await gate.supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("merchant_id", gate.merchant.id)
    .maybeSingle();
  if (!conversation) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  await simulatorAdapter.sendText(id, parsed.data.text);
  await logEvent(id, "seller.reply", {});
  return NextResponse.json({ ok: true });
}
