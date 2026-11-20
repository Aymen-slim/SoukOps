import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { saveCalendarConnection } from "@/lib/calendar/calendar-store";
import {
  exchangeGoogleOAuthCode,
  googleCalendarRedirectUri,
  listGoogleCalendars,
  pullFromGoogleCalendar,
} from "@/lib/calendar/google-calendar";
import { requireMerchant } from "@/lib/dashboard/guard";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const [trackTag] = state.split(".");
  const basePath = trackTag === "ecom" ? "/dashboard/calendar" : "/pro/calendar";

  const redirectWith = (params: Record<string, string>) =>
    NextResponse.redirect(new URL(`${basePath}?${new URLSearchParams(params).toString()}`, url.origin));

  const cookieStore = await cookies();
  if (!state || cookieStore.get("google_cal_oauth_state")?.value !== state) {
    return redirectWith({ gcal: "error", msg: "state_mismatch" });
  }

  const gErr = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (gErr) {
    return redirectWith({ gcal: "error", msg: gErr.slice(0, 120) });
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return redirectWith({ gcal: "error", msg: "missing_code" });
  }

  const gate = await requireMerchant();
  if ("error" in gate) {
    return redirectWith({ gcal: "error", msg: "not_signed_in" });
  }

  try {
    const tokens = await exchangeGoogleOAuthCode(code, googleCalendarRedirectUri());
    const calendars = await listGoogleCalendars(tokens.access_token).catch(() => []);
    const primary = calendars.find((c) => c.primary) ?? calendars[0] ?? null;

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    await saveCalendarConnection(gate.supabase, gate.merchant.id, {
      google_email: primary?.id ?? "",
      calendar_id: primary?.id ?? "primary",
      calendar_name: primary?.summary ?? "Primary Calendar",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? undefined,
      token_expires_at: expiresAt,
      auto_push: true,
    });

    const pullRes = await pullFromGoogleCalendar(gate.supabase, gate.merchant.id).catch(() => ({
      pulled: 0,
      created: 0,
      updated: 0,
    }));

    const res = redirectWith({
      gcal: "connected",
      pulled: String(pullRes.pulled),
    });
    res.cookies.delete("google_cal_oauth_state");
    return res;
  } catch (err) {
    return redirectWith({
      gcal: "error",
      msg: (err instanceof Error ? err.message : "google_connect_failed").slice(0, 120),
    });
  }
}
