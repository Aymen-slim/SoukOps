import { NextResponse } from "next/server";
import { parseUuid, requireMerchant } from "@/lib/dashboard/guard";
import { editOrder, hideOrder, orderEditSchema } from "@/lib/dashboard/order-edit";
import { loadOrderDetail } from "@/lib/dashboard/orders";

export async function GET(_request: Request, ctx: RouteContext<"/api/dashboard/orders/[id]">) {
  const { id } = await ctx.params;
  if (!parseUuid(id)) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  try {
    const order = await loadOrderDetail(gate.supabase, gate.merchant.id, id);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json({ order });
  } catch (err) {
    const message = err instanceof Error ? err.message : "could not load";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/dashboard/orders/[id]">) {
  const { id } = await ctx.params;
  if (!parseUuid(id)) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });
  const parsed = orderEditSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the name, phone, and quantity." }, { status: 400 });
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const result = await editOrder(
    gate.supabase,
    gate.merchant.id,
    id,
    parsed.data,
    gate.merchant.free_delivery_threshold_millimes,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/dashboard/orders/[id]">) {
  const { id } = await ctx.params;
  if (!parseUuid(id)) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const result = await hideOrder(gate.supabase, gate.merchant.id, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
