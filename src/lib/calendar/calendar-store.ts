import { randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { formatTunisDateTime, TUNIS_TIMEZONE } from "./date-parser";

type AdminClient = ReturnType<typeof createAdminClient>;

export const CALENDAR_EVENT_TYPES = [
  "appointment",
  "shoot",
  "meeting",
  "delivery",
  "blocked",
  "reminder",
  "external_google",
] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export const CALENDAR_EVENT_STATUSES = ["tentative", "confirmed", "cancelled"] as const;
export type CalendarEventStatus = (typeof CALENDAR_EVENT_STATUSES)[number];

export const CALENDAR_EVENT_SOURCES = ["manual", "ai_dm", "inquiry", "google"] as const;
export type CalendarEventSource = (typeof CALENDAR_EVENT_SOURCES)[number];

export interface CalendarEventRow {
  id: string;
  merchant_id: string;
  title: string;
  description: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  timezone: string;
  location: string;
  event_type: CalendarEventType;
  status: CalendarEventStatus;
  source: CalendarEventSource;
  conversation_id: string | null;
  inquiry_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  google_event_id: string | null;
  google_calendar_id: string | null;
  google_etag: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarConnectionRow {
  merchant_id: string;
  provider: "google";
  google_email: string;
  calendar_id: string;
  calendar_name: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  auto_push: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicGoogleConnectionStatus {
  oauthConfigured: boolean;
  redirectUri: string;
  connected: boolean;
  googleEmail: string | null;
  calendarId: string;
  calendarName: string;
  autoPush: boolean;
  lastSyncedAt: string | null;
}

export function toPublicConnectionStatus(
  conn: CalendarConnectionRow | null,
  oauthConfigured: boolean,
  redirectUri: string,
): PublicGoogleConnectionStatus {
  return {
    oauthConfigured,
    redirectUri,
    connected: Boolean(conn),
    googleEmail: conn?.google_email || null,
    calendarId: conn?.calendar_id || "primary",
    calendarName: conn?.calendar_name || "Primary Calendar",
    autoPush: conn?.auto_push ?? true,
    lastSyncedAt: conn?.last_synced_at ?? null,
  };
}

function isOneOf<T extends string>(v: unknown, list: readonly T[]): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined, tableName: string): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes(tableName) &&
    (msg.includes("does not exist") || msg.includes("could not find the table") || msg.includes("schema cache"))
  );
}

function mapEventRow(row: Record<string, unknown>, merchantId: string): CalendarEventRow {
  const now = new Date().toISOString();
  return {
    id: String(row.id ?? randomUUID()),
    merchant_id: String(row.merchant_id ?? merchantId),
    title: String(row.title ?? "Scheduled Event").trim(),
    description: typeof row.description === "string" ? row.description : "",
    start_at: typeof row.start_at === "string" ? row.start_at : now,
    end_at: typeof row.end_at === "string" ? row.end_at : now,
    all_day: Boolean(row.all_day),
    timezone: typeof row.timezone === "string" && row.timezone ? row.timezone : TUNIS_TIMEZONE,
    location: typeof row.location === "string" ? row.location : "",
    event_type: isOneOf(row.event_type, CALENDAR_EVENT_TYPES) ? row.event_type : "appointment",
    status: isOneOf(row.status, CALENDAR_EVENT_STATUSES) ? row.status : "confirmed",
    source: isOneOf(row.source, CALENDAR_EVENT_SOURCES) ? row.source : "manual",
    conversation_id: typeof row.conversation_id === "string" ? row.conversation_id : null,
    inquiry_id: typeof row.inquiry_id === "string" ? row.inquiry_id : null,
    client_name: typeof row.client_name === "string" ? row.client_name : null,
    client_phone: typeof row.client_phone === "string" ? row.client_phone : null,
    google_event_id: typeof row.google_event_id === "string" ? row.google_event_id : null,
    google_calendar_id: typeof row.google_calendar_id === "string" ? row.google_calendar_id : null,
    google_etag: typeof row.google_etag === "string" ? row.google_etag : null,
    last_synced_at: typeof row.last_synced_at === "string" ? row.last_synced_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : now,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : now,
  };
}

function mapConnectionRow(row: Record<string, unknown>, merchantId: string): CalendarConnectionRow {
  const now = new Date().toISOString();
  return {
    merchant_id: String(row.merchant_id ?? merchantId),
    provider: "google",
    google_email: typeof row.google_email === "string" ? row.google_email : "",
    calendar_id: typeof row.calendar_id === "string" && row.calendar_id ? row.calendar_id : "primary",
    calendar_name: typeof row.calendar_name === "string" && row.calendar_name ? row.calendar_name : "Primary Calendar",
    access_token: typeof row.access_token === "string" ? row.access_token : "",
    refresh_token: typeof row.refresh_token === "string" ? row.refresh_token : null,
    token_expires_at: typeof row.token_expires_at === "string" ? row.token_expires_at : null,
    auto_push: typeof row.auto_push === "boolean" ? row.auto_push : true,
    last_synced_at: typeof row.last_synced_at === "string" ? row.last_synced_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : now,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : now,
  };
}

const EVENTS_CACHE_NS = "workspace_calendar_events";
const CONN_CACHE_NS = "workspace_calendar_conn";

function eventsCacheKey(merchantId: string): string {
  return `${EVENTS_CACHE_NS}:${merchantId}`;
}

function connCacheKey(merchantId: string): string {
  return `${CONN_CACHE_NS}:${merchantId}`;
}

async function readEventsCache(supabase: AdminClient, merchantId: string): Promise<CalendarEventRow[]> {
  try {
    const { data, error } = await supabase
      .from("ai_cache")
      .select("value")
      .eq("key", eventsCacheKey(merchantId))
      .maybeSingle();
    if (error || !data) return [];
    const val = (data as { value?: unknown }).value as { events?: unknown } | null;
    if (!val || !Array.isArray(val.events)) return [];
    return val.events
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => mapEventRow(item, merchantId));
  } catch {
    return [];
  }
}

async function writeEventsCache(
  supabase: AdminClient,
  merchantId: string,
  events: CalendarEventRow[],
): Promise<void> {
  const { error } = await supabase.from("ai_cache").upsert(
    {
      key: eventsCacheKey(merchantId),
      namespace: EVENTS_CACHE_NS,
      value: { events },
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(`calendar events cache save failed: ${error.message}`);
}

export async function listCalendarEvents(
  supabase: AdminClient,
  merchantId: string,
  opts?: { fromIso?: string; toIso?: string; includeCancelled?: boolean },
): Promise<CalendarEventRow[]> {
  const filterRows = (rows: CalendarEventRow[]) => {
    const fromMs = opts?.fromIso ? Date.parse(opts.fromIso) : null;
    const toMs = opts?.toIso ? Date.parse(opts.toIso) : null;
    return rows
      .filter((ev) => {
        if (!opts?.includeCancelled && ev.status === "cancelled") return false;
        const evStart = Date.parse(ev.start_at);
        const evEnd = Date.parse(ev.end_at);
        if (fromMs !== null && Number.isFinite(fromMs) && evEnd < fromMs) return false;
        if (toMs !== null && Number.isFinite(toMs) && evStart > toMs) return false;
        return true;
      })
      .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  };

  try {
    const query = supabase
      .from("workspace_calendar_events")
      .select("*")
      .eq("merchant_id", merchantId);
    const res =
      typeof (query as { order?: unknown }).order === "function"
        ? await query.order("start_at", { ascending: true })
        : await query;
    if (res.error) {
      if (isMissingTableError(res.error, "workspace_calendar_events")) {
        return filterRows(await readEventsCache(supabase, merchantId));
      }
      return [];
    }
    const mapped = Array.isArray(res.data)
      ? (res.data as Array<Record<string, unknown>>).map((r) => mapEventRow(r, merchantId))
      : [];
    return filterRows(mapped);
  } catch {
    return filterRows(await readEventsCache(supabase, merchantId));
  }
}

export interface CreateCalendarEventInput {
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  all_day?: boolean;
  timezone?: string;
  location?: string;
  event_type?: CalendarEventType;
  status?: CalendarEventStatus;
  source?: CalendarEventSource;
  conversation_id?: string | null;
  inquiry_id?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  google_event_id?: string | null;
  google_calendar_id?: string | null;
  google_etag?: string | null;
  last_synced_at?: string | null;
}

export async function createCalendarEvent(
  supabase: AdminClient,
  merchantId: string,
  input: CreateCalendarEventInput,
): Promise<CalendarEventRow> {
  const now = new Date().toISOString();
  const payload = {
    merchant_id: merchantId,
    title: input.title.trim().slice(0, 160),
    description: (input.description ?? "").trim().slice(0, 2000),
    start_at: input.start_at,
    end_at: input.end_at,
    all_day: Boolean(input.all_day),
    timezone: input.timezone || TUNIS_TIMEZONE,
    location: (input.location ?? "").trim().slice(0, 240),
    event_type: input.event_type ?? "appointment",
    status: input.status ?? "confirmed",
    source: input.source ?? "manual",
    conversation_id: input.conversation_id ?? null,
    inquiry_id: input.inquiry_id ?? null,
    client_name: input.client_name?.trim() || null,
    client_phone: input.client_phone?.trim() || null,
    google_event_id: input.google_event_id ?? null,
    google_calendar_id: input.google_calendar_id ?? null,
    google_etag: input.google_etag ?? null,
    last_synced_at: input.last_synced_at ?? null,
  };

  const { data, error } = await supabase
    .from("workspace_calendar_events")
    .insert(payload)
    .select("*")
    .single();

  if (!error && data) {
    return mapEventRow(data as Record<string, unknown>, merchantId);
  }
  if (!isMissingTableError(error, "workspace_calendar_events")) {
    throw new Error(error?.message ?? "Could not create calendar event");
  }

  const existing = await readEventsCache(supabase, merchantId);
  const created: CalendarEventRow = {
    ...payload,
    id: randomUUID(),
    created_at: now,
    updated_at: now,
  };
  await writeEventsCache(supabase, merchantId, [...existing, created]);
  return created;
}

export interface UpdateCalendarEventInput {
  id: string;
  title?: string;
  description?: string;
  start_at?: string;
  end_at?: string;
  all_day?: boolean;
  location?: string;
  event_type?: CalendarEventType;
  status?: CalendarEventStatus;
  client_name?: string | null;
  client_phone?: string | null;
  google_event_id?: string | null;
  google_calendar_id?: string | null;
  google_etag?: string | null;
  last_synced_at?: string | null;
}

export async function updateCalendarEvent(
  supabase: AdminClient,
  merchantId: string,
  input: UpdateCalendarEventInput,
): Promise<CalendarEventRow | null> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (input.title !== undefined) patch.title = input.title.trim().slice(0, 160);
  if (input.description !== undefined) patch.description = input.description.trim().slice(0, 2000);
  if (input.start_at !== undefined) patch.start_at = input.start_at;
  if (input.end_at !== undefined) patch.end_at = input.end_at;
  if (input.all_day !== undefined) patch.all_day = input.all_day;
  if (input.location !== undefined) patch.location = input.location.trim().slice(0, 240);
  if (input.event_type !== undefined) patch.event_type = input.event_type;
  if (input.status !== undefined) patch.status = input.status;
  if (input.client_name !== undefined) patch.client_name = input.client_name?.trim() || null;
  if (input.client_phone !== undefined) patch.client_phone = input.client_phone?.trim() || null;
  if (input.google_event_id !== undefined) patch.google_event_id = input.google_event_id;
  if (input.google_calendar_id !== undefined) patch.google_calendar_id = input.google_calendar_id;
  if (input.google_etag !== undefined) patch.google_etag = input.google_etag;
  if (input.last_synced_at !== undefined) patch.last_synced_at = input.last_synced_at;

  const { data, error } = await supabase
    .from("workspace_calendar_events")
    .update(patch)
    .eq("id", input.id)
    .eq("merchant_id", merchantId)
    .select("*")
    .maybeSingle();

  if (!error) {
    return data ? mapEventRow(data as Record<string, unknown>, merchantId) : null;
  }
  if (!isMissingTableError(error, "workspace_calendar_events")) {
    throw new Error(error.message);
  }

  const existing = await readEventsCache(supabase, merchantId);
  let updated: CalendarEventRow | null = null;
  const next = existing.map((ev) => {
    if (ev.id !== input.id) return ev;
    updated = mapEventRow({ ...ev, ...patch }, merchantId);
    return updated;
  });
  if (!updated) return null;
  await writeEventsCache(supabase, merchantId, next);
  return updated;
}

export async function upsertGoogleCalendarEvent(
  supabase: AdminClient,
  merchantId: string,
  input: CreateCalendarEventInput & { google_event_id: string },
): Promise<{ event: CalendarEventRow; created: boolean }> {
  const existingAll = await listCalendarEvents(supabase, merchantId, { includeCancelled: true });
  const existing = existingAll.find((e) => e.google_event_id === input.google_event_id);
  if (existing) {
    const updated = await updateCalendarEvent(supabase, merchantId, {
      id: existing.id,
      title: input.title,
      description: input.description,
      start_at: input.start_at,
      end_at: input.end_at,
      all_day: input.all_day,
      location: input.location,
      status: input.status,
      google_calendar_id: input.google_calendar_id,
      google_etag: input.google_etag,
      last_synced_at: input.last_synced_at ?? new Date().toISOString(),
    });
    return { event: updated ?? existing, created: false };
  }
  const created = await createCalendarEvent(supabase, merchantId, {
    ...input,
    last_synced_at: input.last_synced_at ?? new Date().toISOString(),
  });
  return { event: created, created: true };
}

export async function deleteCalendarEvent(
  supabase: AdminClient,
  merchantId: string,
  id: string,
): Promise<CalendarEventRow | null> {
  const existingAll = await listCalendarEvents(supabase, merchantId, { includeCancelled: true });
  const target = existingAll.find((e) => e.id === id) ?? null;

  const { error } = await supabase
    .from("workspace_calendar_events")
    .delete()
    .eq("id", id)
    .eq("merchant_id", merchantId);

  if (!error) return target;
  if (!isMissingTableError(error, "workspace_calendar_events")) {
    throw new Error(error.message);
  }

  const next = existingAll.filter((e) => e.id !== id);
  await writeEventsCache(supabase, merchantId, next);
  return target;
}

/** Loads upcoming active (confirmed/tentative) events in the next N days for AI availability awareness. */
export async function listUpcomingBusyEvents(
  supabase: AdminClient,
  merchantId: string,
  daysAhead = 14,
): Promise<CalendarEventRow[]> {
  const now = new Date();
  const fromIso = new Date(now.getTime() - 2 * 3_600_000).toISOString();
  const toIso = new Date(now.getTime() + daysAhead * 86_400_000).toISOString();
  const events = await listCalendarEvents(supabase, merchantId, {
    fromIso,
    toIso,
    includeCancelled: false,
  });
  return events.slice(0, 25);
}

/**
 * Pure deterministic formatter for upcoming schedule slots injected into Gemini prompts.
 * Returns `""` when empty (preserving existing cassette keys) and uses zero UUIDs or current-time stamps.
 */
export function formatCalendarScheduleBlock(
  events: Array<Pick<CalendarEventRow, "title" | "start_at" | "end_at" | "all_day" | "status" | "source" | "location">>,
): string {
  const active = events.filter((e) => e.status !== "cancelled");
  if (active.length === 0) return "";
  const lines: string[] = [
    "Upcoming Calendar Schedule & Busy Slots (Africa/Tunis — do NOT double-book these times):",
  ];
  for (const ev of active.slice(0, 20)) {
    const start = formatTunisDateTime(ev.start_at);
    const end = formatTunisDateTime(ev.end_at);
    const timeRange = ev.all_day
      ? `${start.date} (All day)`
      : start.date === end.date
        ? `${start.date} ${start.time}–${end.time}`
        : `${start.date} ${start.time} to ${end.date} ${end.time}`;
    const tag = ev.source === "google" ? "Google Calendar" : ev.status;
    const loc = ev.location ? ` @ ${ev.location.slice(0, 60)}` : "";
    lines.push(`- ${timeRange}: ${ev.title.slice(0, 90)}${loc} [${tag}]`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Google Calendar OAuth connection storage (server-side only, never exposed)
// ---------------------------------------------------------------------------

export async function getCalendarConnection(
  supabase: AdminClient,
  merchantId: string,
): Promise<CalendarConnectionRow | null> {
  try {
    const { data, error } = await supabase
      .from("workspace_calendar_connections")
      .select("*")
      .eq("merchant_id", merchantId)
      .maybeSingle();

    if (!error) {
      return data ? mapConnectionRow(data as Record<string, unknown>, merchantId) : null;
    }
    if (!isMissingTableError(error, "workspace_calendar_connections")) {
      return null;
    }
  } catch {
    // Fall through to ai_cache fallback
  }

  try {
    const { data } = await supabase
      .from("ai_cache")
      .select("value")
      .eq("key", connCacheKey(merchantId))
      .maybeSingle();
    const val = (data as { value?: unknown } | null)?.value;
    if (val && typeof val === "object" && !Array.isArray(val) && (val as { access_token?: unknown }).access_token) {
      return mapConnectionRow(val as Record<string, unknown>, merchantId);
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveCalendarConnection(
  supabase: AdminClient,
  merchantId: string,
  input: {
    google_email?: string;
    calendar_id?: string;
    calendar_name?: string;
    access_token: string;
    refresh_token?: string | null;
    token_expires_at?: string | null;
    auto_push?: boolean;
    last_synced_at?: string | null;
  },
): Promise<CalendarConnectionRow> {
  const existing = await getCalendarConnection(supabase, merchantId);
  const now = new Date().toISOString();
  const merged = {
    merchant_id: merchantId,
    provider: "google" as const,
    google_email: input.google_email ?? existing?.google_email ?? "",
    calendar_id: input.calendar_id ?? existing?.calendar_id ?? "primary",
    calendar_name: input.calendar_name ?? existing?.calendar_name ?? "Primary Calendar",
    access_token: input.access_token,
    refresh_token: input.refresh_token !== undefined ? input.refresh_token : (existing?.refresh_token ?? null),
    token_expires_at: input.token_expires_at !== undefined ? input.token_expires_at : (existing?.token_expires_at ?? null),
    auto_push: input.auto_push !== undefined ? input.auto_push : (existing?.auto_push ?? true),
    last_synced_at: input.last_synced_at !== undefined ? input.last_synced_at : (existing?.last_synced_at ?? null),
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("workspace_calendar_connections")
    .upsert(merged, { onConflict: "merchant_id" })
    .select("*")
    .single();

  if (!error && data) {
    return mapConnectionRow(data as Record<string, unknown>, merchantId);
  }
  if (!isMissingTableError(error, "workspace_calendar_connections")) {
    throw new Error(error?.message ?? "Could not save Google Calendar connection");
  }

  const row: CalendarConnectionRow = {
    ...merged,
    created_at: existing?.created_at ?? now,
  };
  const { error: cacheErr } = await supabase.from("ai_cache").upsert(
    {
      key: connCacheKey(merchantId),
      namespace: CONN_CACHE_NS,
      value: row,
    },
    { onConflict: "key" },
  );
  if (cacheErr) throw new Error(`calendar connection cache save failed: ${cacheErr.message}`);
  return row;
}

export async function deleteCalendarConnection(
  supabase: AdminClient,
  merchantId: string,
): Promise<void> {
  const { error } = await supabase
    .from("workspace_calendar_connections")
    .delete()
    .eq("merchant_id", merchantId);

  if (!error) return;
  if (!isMissingTableError(error, "workspace_calendar_connections")) {
    throw new Error(error.message);
  }
  await supabase.from("ai_cache").delete().eq("key", connCacheKey(merchantId));
}
