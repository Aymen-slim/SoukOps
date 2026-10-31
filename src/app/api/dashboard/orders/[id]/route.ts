import { NextResponse } from "next/server";
import { parseUuid, requireMerchant } from "@/lib/dashboard/guard";
import { loadOrderDetail } from "@/lib/dashboard/orders";

export async function GET(_request: Request, ctx: RouteContext<"/api/dashboard/orders/[id]">) {
  const { id } = await ctx.params;
  if (!parseUuid(id)) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  try {
    const order = await loadOrderDetail(gate.supabase, gate.merchant.id, id);
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
    return NextResponse.json({ order });
  } catch (err) {
    const message = err instanceof Error ? err.message : "lecture impossible";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
