import { NextResponse } from "next/server";
import { z } from "zod";
import { shopNameFromEmail, slugFromEmail } from "@/lib/auth/sandbox";
import { clearMerchantSessionCache } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(72),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Use a valid email and a password of at least 8 characters." }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();
  const password = parsed.data.password;

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
  const { error: shopError } = await admin.from("merchants").insert({
    name: await shopNameFromEmail(email),
    slug,
    owner_user_id: userId,
    is_sandbox: false,
    reply_language: "derja",
    ai_instructions: "",
  });
  if (shopError) {
    await admin.auth.admin.deleteUser(userId);
    const hint = /column|schema/i.test(shopError.message)
      ? " Apply supabase/migrations/0004_seller_accounts.sql."
      : "";
    return NextResponse.json({ error: `${shopError.message}.${hint}` }, { status: 500 });
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
  return NextResponse.json({ ok: true });
}
