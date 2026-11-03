import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveRequestMerchant } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DemoMerchant } from "./merchant";

type Admin = ReturnType<typeof createAdminClient>;

export function parseUuid(id: string): string | null {
  return z.string().uuid().safeParse(id).success ? id : null;
}

export async function requireMerchant(): Promise<
  { supabase: Admin; merchant: DemoMerchant } | { error: NextResponse }
> {
  let supabase: Admin;
  try {
    supabase = createAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Supabase is not configured";
    return { error: NextResponse.json({ error: message }, { status: 500 }) };
  }
  const merchant = await resolveRequestMerchant();
  if (!merchant) {
    return { error: NextResponse.json({ error: "Sign in to open your shop." }, { status: 401 }) };
  }
  return { supabase, merchant };
}

export function rejectSandbox(merchant: DemoMerchant): NextResponse | null {
  if (!merchant.is_sandbox) return null;
  return NextResponse.json(
    { error: "Channel connect is off on the demo account. Sign up to link WhatsApp, Messenger, or Instagram." },
    { status: 403 },
  );
}
