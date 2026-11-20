import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addContextEntry,
  CONTEXT_CATEGORIES,
  deleteContextEntry,
  listContextEntries,
  updateContextEntry,
} from "@/lib/context/workspace-context";
import { parseUuid } from "@/lib/dashboard/guard";
import { simulatorGuard } from "@/lib/security/simulatorGuard";
import { createAdminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  content: z.string().trim().min(2, "Write a short context note first.").max(1000),
  category: z.enum(CONTEXT_CATEGORIES).optional(),
});

const patchSchema = z
  .object({
    id: z.string().uuid(),
    content: z.string().trim().min(2).max(1000).optional(),
    category: z.enum(CONTEXT_CATEGORIES).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (v) => v.content !== undefined || v.category !== undefined || v.active !== undefined,
    { message: "Provide content, category, or active status to update." },
  );

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
    .select("id, name, workspace_mode, pro_category")
    .eq("id", String(conv.merchant_id))
    .maybeSingle();
  return {
    supabase,
    merchantId: String(conv.merchant_id),
    workspaceMode: (merchant as { workspace_mode?: string } | null)?.workspace_mode === "pro" ? ("pro" as const) : ("ecommerce" as const),
    proCategory: (merchant as { pro_category?: string | null } | null)?.pro_category ?? null,
  };
}

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/sim/conversations/[id]/context">,
) {
  const blocked = simulatorGuard(request, "sim-context-get", 90);
  if (blocked) return blocked;
  const { id } = await ctx.params;
  const resolved = await resolveConversationMerchant(id);
  if (!resolved) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const entries = await listContextEntries(resolved.supabase, resolved.merchantId);
  return NextResponse.json({
    entries,
    workspaceMode: resolved.workspaceMode,
    proCategory: resolved.proCategory,
    autoSummary: {
      track: resolved.workspaceMode,
      primaryLabel: resolved.workspaceMode === "pro" ? "Services & voice synced" : "Catalog & stock synced",
      secondaryLabel: resolved.workspaceMode === "pro" ? "Boundaries active" : "Delivery fees synced",
      activeNotes: entries.filter((e) => e.active).length,
    },
  });
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/sim/conversations/[id]/context">,
) {
  const blocked = simulatorGuard(request, "sim-context-post", 60);
  if (blocked) return blocked;
  const { id } = await ctx.params;
  const resolved = await resolveConversationMerchant(id);
  if (!resolved) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid context note." },
      { status: 400 },
    );
  }

  try {
    const entry = await addContextEntry(resolved.supabase, resolved.merchantId, parsed.data);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save context note." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/sim/conversations/[id]/context">,
) {
  const blocked = simulatorGuard(request, "sim-context-patch", 60);
  if (blocked) return blocked;
  const { id } = await ctx.params;
  const resolved = await resolveConversationMerchant(id);
  if (!resolved) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid context update." },
      { status: 400 },
    );
  }

  try {
    const entry = await updateContextEntry(resolved.supabase, resolved.merchantId, parsed.data);
    if (!entry) return NextResponse.json({ error: "Context note not found." }, { status: 404 });
    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update context note." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/sim/conversations/[id]/context">,
) {
  const blocked = simulatorGuard(request, "sim-context-delete", 60);
  if (blocked) return blocked;
  const { id } = await ctx.params;
  const resolved = await resolveConversationMerchant(id);
  if (!resolved) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const url = new URL(request.url);
  const entryId = url.searchParams.get("id") ?? "";
  if (!parseUuid(entryId)) {
    return NextResponse.json({ error: "Valid context note id required." }, { status: 400 });
  }

  try {
    await deleteContextEntry(resolved.supabase, resolved.merchantId, entryId);
    return NextResponse.json({ ok: true, id: entryId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete context note." },
      { status: 500 },
    );
  }
}
