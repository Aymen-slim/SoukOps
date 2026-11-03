import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildOAuthDialogUrl, FACEBOOK_PLATFORM_SCOPES } from "@/lib/channels/facebook";
import { requireMerchant } from "@/lib/dashboard/guard";
import { getServerEnv } from "@/lib/env";

/**
 * Starts the one-click social link WITHOUT the Facebook JS SDK: the SDK
 * refuses to run on http pages, so the browser simply navigates to the
 * facebook.com OAuth dialog (HTTPS there) and Meta redirects back to
 * /api/meta/oauth/callback. Works from http://localhost in dev.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform");
  if (platform !== "whatsapp" && platform !== "messenger" && platform !== "instagram") {
    return NextResponse.json({ error: "unknown platform" }, { status: 400 });
  }
  const env = getServerEnv();
  const gate = await requireMerchant();
  if ("error" in gate) {
    return NextResponse.redirect(new URL("/login?next=/dashboard/channels", url.origin));
  }
  if (gate.merchant.is_sandbox) {
    return NextResponse.redirect(new URL("/dashboard/channels?social=error&msg=sandbox", url.origin));
  }
  if (!env.META_APP_ID) {
    return NextResponse.redirect(new URL("/dashboard/channels?social=error&msg=meta_app_missing", url.origin));
  }
  if (platform === "whatsapp" && !env.WHATSAPP_EMBEDDED_CONFIG_ID) {
    return NextResponse.redirect(new URL("/dashboard/channels?social=error&msg=config_missing", url.origin));
  }

  const nonce = randomBytes(16).toString("hex");
  const redirectUri = `${env.APP_BASE_URL.replace(/\/$/, "")}/api/meta/oauth/callback`;
  const dialog = buildOAuthDialogUrl({
    appId: env.META_APP_ID,
    redirectUri,
    state: `${platform}.${nonce}`,
    configId: platform === "whatsapp" ? env.WHATSAPP_EMBEDDED_CONFIG_ID : undefined,
    scope: platform === "whatsapp" ? undefined : FACEBOOK_PLATFORM_SCOPES[platform],
  });

  const response = NextResponse.redirect(dialog);
  response.cookies.set("social_oauth_state", `${platform}.${nonce}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/api/meta/oauth",
    maxAge: 600,
  });
  return response;
}
