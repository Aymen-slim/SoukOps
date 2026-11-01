import { NextResponse } from "next/server";
import type { FacebookPageOption } from "@/lib/channels/facebook";
import { requireMerchant } from "@/lib/dashboard/guard";

/** Pages cached by the OAuth callback (names/usernames only — page tokens
 * stay in the server-side cache and are used by POST /api/dashboard/facebook). */
export async function GET() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const { data } = await gate.supabase
    .from("ai_cache")
    .select("value")
    .eq("key", `fb_pending:${gate.merchant.id}`)
    .maybeSingle();
  const value = data?.value as { pages?: Array<FacebookPageOption & { accessToken?: string }>; savedAt?: number } | null;
  if (!value?.pages?.length || !value.savedAt || Date.now() - value.savedAt > 10 * 60 * 1000) {
    return NextResponse.json({ pages: [] });
  }
  const pages: FacebookPageOption[] = value.pages.map(({ pageId, pageName, instagram }) => ({ pageId, pageName, instagram }));
  return NextResponse.json({ pages });
}
