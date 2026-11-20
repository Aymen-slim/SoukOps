import { NextResponse } from "next/server";
import { z } from "zod";
import { shopNameFromEmail, slugFromEmail } from "@/lib/auth/sandbox";
import { clearMerchantSessionCache, WORKSPACE_MODE_COOKIE, workspaceModeCookieOptions } from "@/lib/auth/session";
import { workspaceHomePath } from "@/lib/auth/workspace-routing";
import { selectMerchantRow } from "@/lib/dashboard/merchant";
import type { WorkspaceMode } from "@/lib/pro/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(72),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Supabase is not configured" }, { status: 500 });
  }
  const signed = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (signed.error || !signed.data.user) {
    return NextResponse.json({ error: "Those details don't match an account." }, { status: 401 });
  }

  let workspaceMode: WorkspaceMode = "ecommerce";
  try {
    const admin = createAdminClient();
    const existing = await selectMerchantRow((cols) =>
      admin.from("merchants").select(cols).eq("owner_user_id", signed.data.user.id).maybeSingle(),
    );
    if (existing) {
      workspaceMode = existing.workspace_mode;
    } else {
      const slug = await slugFromEmail(admin, email);
      await admin.from("merchants").insert({
        name: await shopNameFromEmail(email),
        slug,
        owner_user_id: signed.data.user.id,
        is_sandbox: false,
        reply_language: "derja",
        ai_instructions: "",
      });
    }
  } catch {
    // The session is valid even if the workspace row could not be checked.
  }
  clearMerchantSessionCache();
  const redirectTo = workspaceHomePath(workspaceMode);
  const response = NextResponse.json({ ok: true, workspaceMode, redirectTo });
  response.cookies.set(WORKSPACE_MODE_COOKIE, workspaceMode, workspaceModeCookieOptions());
  return response;
}
