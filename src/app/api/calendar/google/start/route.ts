import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildGoogleCalendarAuthUrl,
  googleCalendarOAuthConfigured,
  googleCalendarRedirectUri,
} from "@/lib/calendar/google-calendar";
import { requireMerchant } from "@/lib/dashboard/guard";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const gate = await requireMerchant();
  if ("error" in gate) {
    return NextResponse.redirect(new URL("/login?next=/pro/calendar", url.origin));
  }

  const returnPath =
    url.searchParams.get("returnTo") === "/dashboard/calendar" ||
    gate.merchant.workspace_mode === "ecommerce"
      ? "/dashboard/calendar"
      : "/pro/calendar";

  if (!googleCalendarOAuthConfigured()) {
    return NextResponse.redirect(
      new URL(`${returnPath}?gcal=error&msg=oauth_not_configured`, url.origin),
    );
  }

  const nonce = randomBytes(16).toString("hex");
  const trackTag = returnPath === "/dashboard/calendar" ? "ecom" : "pro";
  const state = `${trackTag}.${nonce}`;
  const authUrl = buildGoogleCalendarAuthUrl({
    state,
    redirectUri: googleCalendarRedirectUri(),
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("google_cal_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/api/calendar/google",
    maxAge: 600,
  });
  return response;
}
