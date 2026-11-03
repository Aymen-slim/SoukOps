import { NextResponse } from "next/server";
import { z } from "zod";
import { getPinSession, searchLocationByDescription } from "@/lib/pipeline/address";
import { createAdminClient } from "@/lib/supabase/admin";

const searchBodySchema = z.object({
  query: z.string().trim().min(2).max(240),
});

export async function POST(request: Request, ctx: RouteContext<"/api/pin/[token]/search">) {
  const { token } = await ctx.params;
  const parsed = searchBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Describe a street, café, mosque, or neighborhood." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const session = await getPinSession(supabase, token);
  if (session.status !== "ok") {
    return NextResponse.json(
      { error: session.status },
      { status: session.status === "expired" ? 410 : 404 },
    );
  }

  const result = await searchLocationByDescription(supabase, {
    description: parsed.data.query,
    governorate: session.pending.governorate,
    delegation: session.pending.delegation,
    conversationId: session.conversationId,
  });

  return NextResponse.json({
    candidates: result.candidates.slice(0, 5).map((c) => ({
      id: c.id,
      name: c.name,
      governorate: c.governorate,
      delegation: c.delegation,
      lat: c.lat,
      lng: c.lng,
      source: c.source ?? "nominatim",
    })),
    triangulated: result.triangulated,
    floor: result.interpretation.floor,
    driverNote: result.interpretation.driverNote,
    aiUsed: result.aiUsed,
  });
}

