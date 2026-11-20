import { NextResponse } from "next/server";
import {
  loadWorkspaceAiControls,
  saveWorkspaceAiControls,
  workspaceAiControlsPatchSchema,
} from "@/lib/context/ai-controls";
import { parseUuid } from "@/lib/dashboard/guard";
import { simulatorGuard } from "@/lib/security/simulatorGuard";
import { createAdminClient } from "@/lib/supabase/admin";

async function resolveConversationMerchant(conversationId: string) {
  if (!parseUuid(conversationId)) return null;
  const supabase = createAdminClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, merchant_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv?.merchant_id) return null;
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id, workspace_mode")
    .eq("id", String(conv.merchant_id))
    .maybeSingle();
  return {
    supabase,
    merchantId: String(conv.merchant_id),
    workspaceMode: (merchant as { workspace_mode?: string } | null)?.workspace_mode === "pro" ? ("pro" as const) : ("ecommerce" as const),
  };
}

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/sim/conversations/[id]/controls">,
) {
  const blocked = simulatorGuard(request, "sim-controls-get", 90);
  if (blocked) return blocked;
  const { id } = await ctx.params;
  const resolved = await resolveConversationMerchant(id);
  if (!resolved) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const controls = await loadWorkspaceAiControls(resolved.supabase, resolved.merchantId);
  return NextResponse.json({
    controls,
    workspaceMode: resolved.workspaceMode,
  });
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/sim/conversations/[id]/controls">,
) {
  const blocked = simulatorGuard(request, "sim-controls-patch", 60);
  if (blocked) return blocked;
  const { id } = await ctx.params;
  const resolved = await resolveConversationMerchant(id);
  if (!resolved) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const parsed = workspaceAiControlsPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid AI control settings." },
      { status: 400 },
    );
  }

  try {
    const controls = await saveWorkspaceAiControls(resolved.supabase, resolved.merchantId, parsed.data);
    return NextResponse.json({ controls });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save AI controls." },
      { status: 500 },
    );
  }
}
