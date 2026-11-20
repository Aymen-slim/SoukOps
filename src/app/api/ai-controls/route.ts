import { NextResponse } from "next/server";
import {
  loadWorkspaceAiControls,
  saveWorkspaceAiControls,
  workspaceAiControlsPatchSchema,
} from "@/lib/context/ai-controls";
import { requireMerchant } from "@/lib/dashboard/guard";

export async function GET() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const controls = await loadWorkspaceAiControls(gate.supabase, gate.merchant.id);
  return NextResponse.json({
    controls,
    workspaceMode: gate.merchant.workspace_mode,
  });
}

export async function PATCH(request: Request) {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;

  const parsed = workspaceAiControlsPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid AI control settings." },
      { status: 400 },
    );
  }

  try {
    const controls = await saveWorkspaceAiControls(gate.supabase, gate.merchant.id, parsed.data);
    return NextResponse.json({ controls });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save AI controls." },
      { status: 500 },
    );
  }
}
