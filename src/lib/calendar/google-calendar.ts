import { getServerEnv } from "@/lib/env";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  getCalendarConnection,
  listCalendarEvents,
  saveCalendarConnection,
  updateCalendarEvent,
  upsertGoogleCalendarEvent,
  type CalendarEventRow,
} from "./calendar-store";
import { formatTunisDateTime, TUNIS_TIMEZONE } from "./date-parser";

type AdminClient = ReturnType<typeof createAdminClient>;

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export function googleCalendarOAuthConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function googleCalendarRedirectUri(): string {
  const env = getServerEnv();
  if (env.GOOGLE_OAUTH_REDIRECT_URI?.trim()) return env.GOOGLE_OAUTH_REDIRECT_URI.trim();
  return `${env.APP_BASE_URL.replace(/\/$/, "")}/api/calendar/google/callback`;
}

export function buildGoogleCalendarAuthUrl(input: { state: string; redirectUri?: string }): string {
  const env = getServerEnv();
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: input.redirectUri ?? googleCalendarRedirectUri(),
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export async function exchangeGoogleOAuthCode(
  code: string,
  redirectUri = googleCalendarRedirectUri(),
): Promise<GoogleTokenResponse> {
  const env = getServerEnv();
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error("Google Calendar OAuth is not configured on this server.");
  }
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => null)) as (GoogleTokenResponse & { error_description?: string; error?: string }) | null;
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error_description ?? data?.error ?? `Google token exchange failed (${res.status})`);
  }
  return data;
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const env = getServerEnv();
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error("Google Calendar OAuth is not configured on this server.");
  }
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => null)) as (GoogleTokenResponse & { error_description?: string; error?: string }) | null;
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error_description ?? data?.error ?? `Google token refresh failed (${res.status})`);
  }
  return data;
}

export interface GoogleCalendarListItem {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
}

export async function listGoogleCalendars(accessToken: string): Promise<GoogleCalendarListItem[]> {
  const res = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList?minAccessRole=writer`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Google calendarList failed (${res.status})`);
  }
  const data = (await res.json()) as {
    items?: Array<{ id?: string; summary?: string; primary?: boolean; accessRole?: string }>;
  };
  return (data.items ?? [])
    .filter((item): item is { id: string; summary?: string; primary?: boolean; accessRole?: string } => Boolean(item.id))
    .map((item) => ({
      id: item.id,
      summary: item.summary || item.id,
      primary: Boolean(item.primary),
      accessRole: item.accessRole || "writer",
    }));
}

export async function getValidGoogleAccessToken(
  supabase: AdminClient,
  merchantId: string,
): Promise<{ accessToken: string; calendarId: string } | null> {
  const conn = await getCalendarConnection(supabase, merchantId);
  if (!conn || !conn.access_token) return null;

  const expiresMs = conn.token_expires_at ? Date.parse(conn.token_expires_at) : null;
  const needsRefresh = expiresMs !== null && Number.isFinite(expiresMs) && expiresMs - Date.now() < 120_000;

  if (!needsRefresh) {
    return { accessToken: conn.access_token, calendarId: conn.calendar_id || "primary" };
  }

  if (!conn.refresh_token) {
    return { accessToken: conn.access_token, calendarId: conn.calendar_id || "primary" };
  }

  const refreshed = await refreshGoogleAccessToken(conn.refresh_token);
  const nextExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : null;
  await saveCalendarConnection(supabase, merchantId, {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? conn.refresh_token,
    token_expires_at: nextExpiresAt,
  });
  return { accessToken: refreshed.access_token, calendarId: conn.calendar_id || "primary" };
}

export interface GoogleCalendarEventResource {
  id?: string;
  etag?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
}

/** Pure mapper from a Google Calendar v3 event resource to Wassalha's local calendar event shape. */
export function mapGoogleEventToLocal(
  calendarId: string,
  gEvent: GoogleCalendarEventResource,
): {
  title: string;
  description: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  timezone: string;
  location: string;
  event_type: "external_google";
  status: "tentative" | "confirmed" | "cancelled";
  source: "google";
  google_event_id: string;
  google_calendar_id: string;
  google_etag: string | null;
} | null {
  if (!gEvent.id) return null;
  const allDay = Boolean(gEvent.start?.date && !gEvent.start?.dateTime);
  const startRaw = gEvent.start?.dateTime ?? (gEvent.start?.date ? `${gEvent.start.date}T00:00:00+01:00` : null);
  const endRaw = gEvent.end?.dateTime ?? (gEvent.end?.date ? `${gEvent.end.date}T00:00:00+01:00` : null);
  if (!startRaw || !endRaw) return null;

  const startMs = Date.parse(startRaw);
  const endMs = Date.parse(endRaw);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;

  const status: "tentative" | "confirmed" | "cancelled" =
    gEvent.status === "cancelled"
      ? "cancelled"
      : gEvent.status === "tentative"
        ? "tentative"
        : "confirmed";

  return {
    title: gEvent.summary?.trim() || "(Busy — Google Calendar)",
    description: gEvent.description?.trim() || "",
    start_at: new Date(startMs).toISOString(),
    end_at: new Date(Math.max(endMs, startMs + 15 * 60_000)).toISOString(),
    all_day: allDay,
    timezone: gEvent.start?.timeZone || TUNIS_TIMEZONE,
    location: gEvent.location?.trim() || "",
    event_type: "external_google",
    status,
    source: "google",
    google_event_id: gEvent.id,
    google_calendar_id: calendarId,
    google_etag: gEvent.etag ?? null,
  };
}

/** Pure mapper from a Wassalha local event to a Google Calendar v3 request body. */
export function mapLocalEventToGooglePayload(
  event: Pick<
    CalendarEventRow,
    "title" | "description" | "location" | "start_at" | "end_at" | "all_day" | "timezone" | "status" | "client_name" | "client_phone"
  >,
): Record<string, unknown> {
  const detailsParts = [
    event.description?.trim() || null,
    event.client_name ? `Client: ${event.client_name}` : null,
    event.client_phone ? `Phone: ${event.client_phone}` : null,
  ].filter(Boolean);

  const tz = event.timezone || TUNIS_TIMEZONE;
  const start = event.all_day
    ? { date: formatTunisDateTime(event.start_at).date }
    : { dateTime: event.start_at, timeZone: tz };
  const end = event.all_day
    ? { date: formatTunisDateTime(event.end_at).date }
    : { dateTime: event.end_at, timeZone: tz };

  return {
    summary: event.title,
    description: detailsParts.join("\n"),
    location: event.location || undefined,
    start,
    end,
    status: event.status === "cancelled" ? "cancelled" : event.status === "tentative" ? "tentative" : "confirmed",
  };
}

/** Pulls events (-7d .. +60d) from the connected Google Calendar into Wassalha's built-in calendar. */
export async function pullFromGoogleCalendar(
  supabase: AdminClient,
  merchantId: string,
  opts?: { daysPast?: number; daysAhead?: number },
): Promise<{ pulled: number; created: number; updated: number }> {
  const auth = await getValidGoogleAccessToken(supabase, merchantId);
  if (!auth) throw new Error("Google Calendar is not connected.");

  const now = Date.now();
  const timeMin = new Date(now - (opts?.daysPast ?? 7) * 86_400_000).toISOString();
  const timeMax = new Date(now + (opts?.daysAhead ?? 60) * 86_400_000).toISOString();

  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    timeMin,
    timeMax,
  });

  const url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(auth.calendarId)}/events?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google Calendar pull failed (${res.status}): ${errText.slice(0, 140)}`);
  }

  const body = (await res.json()) as { items?: GoogleCalendarEventResource[] };
  const items = Array.isArray(body.items) ? body.items : [];
  let createdCount = 0;
  let updatedCount = 0;

  for (const item of items) {
    const mapped = mapGoogleEventToLocal(auth.calendarId, item);
    if (!mapped) continue;
    const { created } = await upsertGoogleCalendarEvent(supabase, merchantId, mapped);
    if (created) createdCount += 1;
    else updatedCount += 1;
  }

  const conn = await getCalendarConnection(supabase, merchantId);
  if (conn) {
    await saveCalendarConnection(supabase, merchantId, {
      access_token: auth.accessToken,
      last_synced_at: new Date().toISOString(),
    });
  }

  return { pulled: createdCount + updatedCount, created: createdCount, updated: updatedCount };
}

/** Pushes a single Wassalha event (create or update) to the connected Google Calendar. */
export async function pushEventToGoogleCalendar(
  supabase: AdminClient,
  merchantId: string,
  event: CalendarEventRow,
): Promise<CalendarEventRow> {
  const auth = await getValidGoogleAccessToken(supabase, merchantId);
  if (!auth) throw new Error("Google Calendar is not connected.");

  const targetCalId = event.google_calendar_id || auth.calendarId;
  const payload = mapLocalEventToGooglePayload(event);

  const isUpdate = Boolean(event.google_event_id);
  const endpoint = isUpdate
    ? `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(targetCalId)}/events/${encodeURIComponent(event.google_event_id!)}`
    : `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(targetCalId)}/events`;

  const res = await fetch(endpoint, {
    method: isUpdate ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google Calendar push failed (${res.status}): ${errText.slice(0, 140)}`);
  }

  const remote = (await res.json()) as { id?: string; etag?: string };
  const updated = await updateCalendarEvent(supabase, merchantId, {
    id: event.id,
    google_event_id: remote.id ?? event.google_event_id,
    google_calendar_id: targetCalId,
    google_etag: remote.etag ?? event.google_etag,
    last_synced_at: new Date().toISOString(),
  });
  return updated ?? event;
}

/** Deletes an event from Google Calendar when it had a `google_event_id`. Best-effort on 404/410. */
export async function deleteEventFromGoogleCalendar(
  supabase: AdminClient,
  merchantId: string,
  event: Pick<CalendarEventRow, "google_event_id" | "google_calendar_id">,
): Promise<boolean> {
  if (!event.google_event_id) return false;
  const auth = await getValidGoogleAccessToken(supabase, merchantId);
  if (!auth) return false;

  const targetCalId = event.google_calendar_id || auth.calendarId;
  const endpoint = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(targetCalId)}/events/${encodeURIComponent(event.google_event_id)}`;
  const res = await fetch(endpoint, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${auth.accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok || res.status === 404 || res.status === 410;
}

/** Runs pull, push, or two-way sync between Wassalha's built-in calendar and Google Calendar. */
export async function syncWorkspaceWithGoogleCalendar(
  supabase: AdminClient,
  merchantId: string,
  direction: "pull" | "push" | "both" = "both",
): Promise<{ pulled: number; pushed: number; errors: string[] }> {
  const errors: string[] = [];
  let pulled = 0;
  let pushed = 0;

  if (direction === "pull" || direction === "both") {
    try {
      const pullRes = await pullFromGoogleCalendar(supabase, merchantId);
      pulled = pullRes.pulled;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Pull failed");
    }
  }

  if (direction === "push" || direction === "both") {
    const nowIso = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const localEvents = await listCalendarEvents(supabase, merchantId, {
      fromIso: nowIso,
      includeCancelled: false,
    });
    const toPush = localEvents.filter((ev) => ev.source !== "google" && !ev.google_event_id);
    for (const ev of toPush) {
      try {
        await pushEventToGoogleCalendar(supabase, merchantId, ev);
        pushed += 1;
      } catch (err) {
        errors.push(`${ev.title}: ${err instanceof Error ? err.message : "Push failed"}`);
      }
    }
    const conn = await getCalendarConnection(supabase, merchantId);
    if (conn) {
      await saveCalendarConnection(supabase, merchantId, {
        access_token: conn.access_token,
        last_synced_at: new Date().toISOString(),
      });
    }
  }

  return { pulled, pushed, errors };
}
