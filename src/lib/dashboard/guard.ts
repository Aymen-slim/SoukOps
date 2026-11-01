import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDemoMerchant, type DemoMerchant } from "./merchant";

type Admin = ReturnType<typeof createAdminClient>;

export function parseUuid(id: string): string | null {
  return z.string().uuid().safeParse(id).success ? id : null;
}

export async function requireMerchant(): Promise<
  { supabase: Admin; merchant: DemoMerchant } | { error: NextResponse }
> {
  const supabase = createAdminClient();
  const merchant = await getDemoMerchant(supabase);
  if (!merchant) {
    return { error: NextResponse.json({ error: "No shop. Run npm run seed:catalog." }, { status: 500 }) };
  }
  return { supabase, merchant };
}
