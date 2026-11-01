import { NextResponse } from "next/server";
import { syncOrderShipment } from "@/lib/couriers/statusSync";
import { parseUuid } from "@/lib/dashboard/guard";

export async function POST(_request: Request, ctx: RouteContext<"/api/orders/[id]/sync-status">) {
  const { id } = await ctx.params;
  if (!parseUuid(id)) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });
  const result = await syncOrderShipment(id);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json(result);
}
