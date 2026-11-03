import { NextResponse } from "next/server";
import { clearMerchantSessionCache, SANDBOX_COOKIE } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Still clear the demo cookie below.
  }
  clearMerchantSessionCache();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SANDBOX_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
