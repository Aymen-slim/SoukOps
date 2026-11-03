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

  try {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("merchants")
      .select("id")
      .eq("owner_user_id", signed.data.user.id)
      .maybeSingle();
    if (!existing) {
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
    // The session is valid even if the shop row could not be checked.
  }
  clearMerchantSessionCache();
  return NextResponse.json({ ok: true });
}
