import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmPin, getPinSession } from "@/lib/pipeline/address";
import { sendSummary } from "@/lib/pipeline/order";
import { createAdminClient } from "@/lib/supabase/admin";

const confirmSchema = z.object({
  lat: z.number().min(30).max(38),
  lng: z.number().min(7).max(12),
  floor: z.string().max(50).optional().nullable(),
  driverNote: z.string().max(300).optional().nullable(),
});

export async function GET(_request: Request, ctx: RouteContext<"/api/pin/[token]">) {
  const { token } = await ctx.params;
  const supabase = createAdminClient();
  const session = await getPinSession(supabase, token);
  if (session.status !== "ok") {
    return NextResponse.json({ error: session.status }, { status: session.status === "expired" ? 410 : 404 });
  }
  return NextResponse.json({ pending: session.pending });
}

export async function POST(request: Request, ctx: RouteContext<"/api/pin/[token]">) {
  const { token } = await ctx.params;
  const parsed = confirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const supabase = createAdminClient();
  const result = await confirmPin({
    supabase,
    rawToken: token,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    floor: parsed.data.floor ?? null,
    driverNote: parsed.data.driverNote ?? null,
  });
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "expired" ? 410 : 404 },
    );
  }

  // Advance the conversation deterministically: risk + fixed summary.
  await sendSummary(supabase, result.conversationId);
  return NextResponse.json({ ok: true, conversationId: result.conversationId });
}
