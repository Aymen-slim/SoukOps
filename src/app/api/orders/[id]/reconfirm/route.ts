import { NextResponse } from "next/server";
import { parseUuid } from "@/lib/dashboard/guard";
import { requestDispatchReconfirmation } from "@/lib/pipeline/reconfirm";

export async function POST(_request: Request, ctx: RouteContext<"/api/orders/[id]/reconfirm">) {
  const { id } = await ctx.params;
  if (!parseUuid(id)) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });
  const result = await requestDispatchReconfirmation(id);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json(result);
}
