import { NextResponse } from "next/server";
import { requireMerchant } from "@/lib/dashboard/guard";
import type { DemoMerchant } from "@/lib/dashboard/merchant";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Auth & track guard for all `/api/pro/*` routes.
 * Enforces an authenticated session AND `workspace_mode === "pro"`.
 */
export async function requireProMerchant(): Promise<
  { supabase: AdminClient; merchant: DemoMerchant } | { error: NextResponse }
> {
  const gate = await requireMerchant();
  if ("error" in gate) return gate;
  if (gate.merchant.workspace_mode !== "pro") {
    return {
      error: NextResponse.json(
        { error: "This endpoint is only available for Creator & Professional workspaces." },
        { status: 403 },
      ),
    };
  }
  return gate;
}
