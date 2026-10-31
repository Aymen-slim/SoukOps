import { NextResponse } from "next/server";
import { confirmDispatch } from "@/lib/couriers/dispatch";
import { parseUuid } from "@/lib/dashboard/guard";

export async function POST(_request: Request, ctx: RouteContext<"/api/orders/[id]/confirm-dispatch">) {
  const { id } = await ctx.params;
  if (!parseUuid(id)) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });
  const result = await confirmDispatch(id);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json(result);
}
