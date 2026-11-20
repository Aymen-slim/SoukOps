import { NextResponse } from "next/server";
import { z } from "zod";
import { shopNameFromEmail, slugFromEmail } from "@/lib/auth/sandbox";
import { clearMerchantSessionCache, WORKSPACE_MODE_COOKIE, workspaceModeCookieOptions } from "@/lib/auth/session";
import { workspaceHomePath } from "@/lib/auth/workspace-routing";
import { getProPreset } from "@/lib/pro/presets";
import { seedProWorkspace } from "@/lib/pro/seed";
import { PRO_CATEGORIES, WORKSPACE_MODES } from "@/lib/pro/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(72),
  workspaceMode: z.enum(WORKSPACE_MODES).default("ecommerce"),
  proCategory: z.enum(PRO_CATEGORIES).optional(),
  displayName: z.string().trim().max(80).optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Use a valid email and a password of at least 8 characters." }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();
  const password = parsed.data.password;
  const workspaceMode = parsed.data.workspaceMode;
  const proCategory = workspaceMode === "pro" ? (parsed.data.proCategory ?? "creator") : null;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Supabase is not configured" }, { status: 500 });
  }

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    const message = created.error?.message ?? "Could not create the account";
    const status = /already|registered|exists/i.test(message) ? 409 : 400;
    return NextResponse.json(
      { error: status === 409 ? "That email already has an account. Log in instead." : message },
      { status },
    );
  }
  const userId = created.data.user.id;

  const slug = await slugFromEmail(admin, email);
  const preset = proCategory ? getProPreset(proCategory) : null;
  const defaultName =
    parsed.data.displayName || (preset ? preset.defaultDisplayName : await shopNameFromEmail(email));

  let merchantId: string | null = null;
  let shopError: { message: string } | null = null;
  const withMode = await admin
    .from("merchants")
    .insert({
      name: defaultName,
      slug,
      owner_user_id: userId,
      is_sandbox: false,
      reply_language: "derja",
      ai_instructions: preset ? preset.styleRules.slice(0, 380) : "",
      workspace_mode: workspaceMode,
      pro_category: proCategory,
    })
    .select("id")
    .single();

  if (!withMode.error && withMode.data) {
    merchantId = withMode.data.id as string;
  } else if (workspaceMode === "ecommerce" && /workspace_mode|pro_category/i.test(withMode.error?.message ?? "")) {
    const legacy = await admin
      .from("merchants")
      .insert({
        name: defaultName,
        slug,
        owner_user_id: userId,
        is_sandbox: false,
        reply_language: "derja",
        ai_instructions: "",
      })
      .select("id")
      .single();
    merchantId = (legacy.data?.id as string | undefined) ?? null;
    shopError = legacy.error;
  } else {
    shopError = withMode.error;
  }

  if (shopError || !merchantId) {
    await admin.auth.admin.deleteUser(userId);
    const msg = shopError?.message ?? "Could not create workspace";
    const hint = /workspace_mode|pro_category/i.test(msg)
      ? " Apply supabase/migrations/0007_pro_workspace_and_ai_upgrade.sql."
      : /column|schema/i.test(msg)
        ? " Apply supabase/migrations/0004_seller_accounts.sql."
        : "";
    return NextResponse.json({ error: `${msg}.${hint}` }, { status: 500 });
  }

  if (workspaceMode === "pro" && proCategory) {
    const seeded = await seedProWorkspace(admin, merchantId, proCategory, defaultName);
    if (!seeded.seeded && seeded.missingSchema) {
      await admin.from("merchants").delete().eq("id", merchantId);
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: "Creator/Pro tables are not migrated yet. Apply supabase/migrations/0007_pro_workspace_and_ai_upgrade.sql." },
        { status: 500 },
      );
    }
  }

  try {
    const supabase = await createClient();
    const signed = await supabase.auth.signInWithPassword({ email, password });
    if (signed.error) {
      return NextResponse.json({ error: "Account created. Log in with the same email and password." }, { status: 201 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not start the session" }, { status: 500 });
  }
  clearMerchantSessionCache();
  const redirectTo = workspaceHomePath(workspaceMode);
  const response = NextResponse.json({ ok: true, workspaceMode, proCategory, redirectTo });
  response.cookies.set(WORKSPACE_MODE_COOKIE, workspaceMode, workspaceModeCookieOptions());
  return response;
}
