import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { exchangeCodeForPages } from "@/lib/channels/facebook";
import {
  connectWhatsAppWithToken,
  discoverWhatsAppAccount,
  exchangeOAuthCode,
  resolveWhatsAppConfig,
  type WhatsAppConfig,
} from "@/lib/channels/whatsapp";
import { requireMerchant } from "@/lib/dashboard/guard";

/**
 * OAuth redirect callback for WhatsApp / Messenger / Instagram linking.
 * WhatsApp completes fully server-side (discover WABA + number, subscribe,
 * save). Messenger/Instagram cache the seller's Pages server-side and send
 * the browser back to Settings to pick one (single-Page accounts connect
 * immediately). Tokens never appear in any browser response.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const settings = (params: Record<string, string>) =>
    NextResponse.redirect(new URL(`/dashboard/channels?${new URLSearchParams(params).toString()}`, url.origin));

  const state = url.searchParams.get("state") ?? "";
  const [platform] = state.split(".");
  if (platform !== "whatsapp" && platform !== "messenger" && platform !== "instagram") {
    return settings({ social: "error", msg: "bad_state" });
  }
  const cookieStore = await cookies();
  if (cookieStore.get("social_oauth_state")?.value !== state) {
    return settings({ social: "error", msg: "state_mismatch" });
  }
  const metaError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (metaError) return settings({ social: "error", platform, msg: metaError.slice(0, 120) });
  const code = url.searchParams.get("code");
  if (!code) return settings({ social: "error", platform, msg: "no_code" });

  const gate = await requireMerchant();
  if ("error" in gate) return settings({ social: "error", platform, msg: "no_shop" });
  if (gate.merchant.is_sandbox) return settings({ social: "error", platform, msg: "sandbox" });
  const { supabase, merchant } = gate;

  try {
    if (platform === "whatsapp") {
      const accessToken = await exchangeOAuthCode(code);
      const { wabaId, phoneNumberId } = await discoverWhatsAppAccount(accessToken);
      const existing = await resolveWhatsAppConfig(supabase, merchant.id);
      const config: WhatsAppConfig = {
        phoneNumberId,
        wabaId,
        accessToken,
        verifyToken: existing?.verifyToken ?? `wassalha-${merchant.id.slice(0, 8)}`,
        source: "database",
      };
      const info = await connectWhatsAppWithToken(config);
      const { error } = await supabase
        .from("merchants")
        .update({
          whatsapp_phone_number_id: config.phoneNumberId,
          whatsapp_waba_id: config.wabaId,
          whatsapp_access_token: config.accessToken,
          whatsapp_verify_token: config.verifyToken,
          whatsapp_connected_at: new Date().toISOString(),
        })
        .eq("id", merchant.id);
      if (error) throw new Error(`save failed (${error.message}) — apply supabase/migrations/0002_whatsapp.sql`);
      return settings({
        social: "connected",
        platform,
        name: info.displayPhoneNumber ?? info.verifiedName ?? phoneNumberId,
      });
    }

    // Messenger / Instagram: cache pages (tokens server-side only).
    const pending = await exchangeCodeForPages(code);
    await supabase.from("ai_cache").upsert({
      key: `fb_pending:${merchant.id}`,
      namespace: "channels",
      value: { pages: pending.pages, savedAt: Date.now() },
    });

    if (pending.pages.length === 1) {
      const page = pending.pages[0];
      if (platform === "instagram" && !page.instagram) {
        return settings({ social: "error", platform, msg: "no_instagram_on_page" });
      }
      return settings({ social: "pick", platform, page: page.pageId });
    }
    return settings({ social: "pick", platform });
  } catch (err) {
    return settings({
      social: "error",
      platform,
      msg: (err instanceof Error ? err.message : "connection failed").slice(0, 120),
    });
  }
}
