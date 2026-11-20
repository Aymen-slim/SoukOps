"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CalendarCheck01,
  CalendarPlus01,
  CheckCircle,
  ChevronLeft,
  Clock,
  ClockRefresh,
  Download01,
  LinkExternal01,
  Trash01,
} from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { Alert } from "@/components/foundations/alert/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import type {
  CalendarEventRow,
  CalendarEventStatus,
  CalendarEventType,
  PublicGoogleConnectionStatus,
} from "@/lib/calendar/calendar-store";
import {
  buildGoogleCalendarQuickLink,
  formatTunisDateTime,
  tunisLocalToUtcIso,
} from "@/lib/calendar/date-parser";
import type { CalendarAutoBookMode } from "@/lib/context/ai-controls";

interface CalendarApiResponse {
  events?: CalendarEventRow[];
  calendarAutoBook?: CalendarAutoBookMode;
  google?: PublicGoogleConnectionStatus;
  error?: string;
}

interface GoogleCalendarOption {
  id: string;
  summary: string;
  primary: boolean;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function todayTunisYmd(): string {
  return formatTunisDateTime(new Date().toISOString()).date;
}

function addDaysYmdStr(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function parseYmd(ymd: string): { year: number; month: number; day: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { year: y || 2026, month: m || 1, day: d || 1 };
}

function buildMonthGrid(year: number, monthIndex0: number): Array<{ ymd: string; inMonth: boolean; dayNum: number }> {
  const firstDay = new Date(Date.UTC(year, monthIndex0, 1));
  const startDowMon0 = (firstDay.getUTCDay() + 6) % 7; // 0 = Monday
  const daysInMonth = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  const cells: Array<{ ymd: string; inMonth: boolean; dayNum: number }> = [];

  for (let i = startDowMon0 - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(year, monthIndex0, -i));
    cells.push({
      ymd: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`,
      inMonth: false,
      dayNum: dt.getUTCDate(),
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      ymd: `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      inMonth: true,
      dayNum: d,
    });
  }
  while (cells.length < 42) {
    const offset = cells.length - (startDowMon0 + daysInMonth) + 1;
    const dt = new Date(Date.UTC(year, monthIndex0 + 1, offset));
    cells.push({
      ymd: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`,
      inMonth: false,
      dayNum: dt.getUTCDate(),
    });
  }
  return cells;
}

function statusBadgeColor(status: CalendarEventStatus, source: CalendarEventRow["source"]): "success" | "warning" | "blue" | "gray" {
  if (source === "google") return "blue";
  if (status === "tentative") return "warning";
  if (status === "confirmed") return "success";
  return "gray";
}

export function WorkspaceCalendar({
  apiBase,
  mode,
  controlsApiBase,
  compact = false,
  onCountChange,
}: {
  apiBase: string;
  mode: "ecommerce" | "pro";
  controlsApiBase?: string;
  compact?: boolean;
  onCountChange?: (count: number) => void;
}) {
  const [today, setToday] = useState<string>("");
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [google, setGoogle] = useState<PublicGoogleConnectionStatus | null>(null);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendarOption[]>([]);
  const [autoBook, setAutoBook] = useState<CalendarAutoBookMode>("tentative");
  const [viewYear, setViewYear] = useState(2026);
  const [viewMonth, setViewMonth] = useState(10);
  const [selectedDay, setSelectedDay] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Add event form state
  const [title, setTitle] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [allDay, setAllDay] = useState(false);
  const [eventType, setEventType] = useState<CalendarEventType>(mode === "pro" ? "appointment" : "delivery");
  const [location, setLocation] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [description, setDescription] = useState("");
  const [pushToGoogle, setPushToGoogle] = useState(true);

  // Initialize current date on client mount (keeps Next.js 16 Cache Components prerender deterministic)
  useEffect(() => {
    const t = todayTunisYmd();
    const parsed = parseYmd(t);
    setToday(t);
    setViewYear(parsed.year);
    setViewMonth(parsed.month - 1);
    setSelectedDay((prev) => prev || t);
    setDateStr((prev) => prev || addDaysYmdStr(t, 1));
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(apiBase);
      const body = (await res.json().catch(() => null)) as CalendarApiResponse | null;
      if (!res.ok || body?.error) {
        setError(body?.error ?? "Couldn't load calendar.");
        return;
      }
      const list = body?.events ?? [];
      setEvents(list);
      onCountChange?.(list.length);
      if (body?.calendarAutoBook) setAutoBook(body.calendarAutoBook);
      if (body?.google) {
        setGoogle(body.google);
        if (body.google.connected && !compact) {
          void fetch("/api/calendar/google/sync")
            .then((r) => r.json())
            .then((calRes: { calendars?: GoogleCalendarOption[] }) => {
              if (Array.isArray(calRes.calendars)) setGoogleCalendars(calRes.calendars);
            })
            .catch(() => undefined);
        }
      }
    } catch {
      setError("Couldn't load calendar.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, compact, onCountChange]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Read OAuth redirect query banner (?gcal=connected|error) on mount
  useEffect(() => {
    if (compact || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get("gcal");
    if (gcal === "connected") {
      const pulled = params.get("pulled") ?? "0";
      setFeedback(`Google Calendar connected! Pulled ${pulled} upcoming event(s).`);
    } else if (gcal === "error") {
      const msg = params.get("msg") ?? "connection_failed";
      setError(`Google Calendar connection error: ${msg}`);
    }
  }, [compact]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEventRow[]>();
    for (const ev of events) {
      const dayKey = formatTunisDateTime(ev.start_at).date;
      const list = map.get(dayKey) ?? [];
      list.push(ev);
      map.set(dayKey, list);
    }
    return map;
  }, [events]);

  const monthCells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const selectedDayEvents = eventsByDay.get(selectedDay) ?? [];

  async function addEvent(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const effectiveDate = dateStr || today || todayTunisYmd();
      const ymd = parseYmd(effectiveDate);
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const startIso = allDay
        ? tunisLocalToUtcIso(ymd, 0, 0)
        : tunisLocalToUtcIso(ymd, sh || 10, sm || 0);
      const endIso = allDay
        ? tunisLocalToUtcIso(ymd, 23, 59)
        : tunisLocalToUtcIso(ymd, eh || 11, em || 0);

      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          start_at: startIso,
          end_at: endIso,
          all_day: allDay,
          location: location.trim(),
          event_type: eventType,
          status: "confirmed",
          client_name: clientName.trim() || null,
          client_phone: clientPhone.trim() || null,
          pushToGoogle: Boolean(google?.connected && pushToGoogle),
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        event?: CalendarEventRow;
        conflicts?: Array<{ title: string }>;
        googleSyncError?: string | null;
        error?: string;
      } | null;
      if (!res.ok || !body?.event) {
        setError(body?.error ?? "Couldn't add calendar event.");
        return;
      }

      setEvents((prev) => {
        const next = [...prev, body.event!].sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
        onCountChange?.(next.length);
        return next;
      });
      setSelectedDay(effectiveDate);
      setTitle("");
      setLocation("");
      setClientName("");
      setClientPhone("");
      setDescription("");

      const notes: string[] = ["Event added to calendar."];
      if (body.event.google_event_id) notes.push("Pushed straight to Google Calendar.");
      if (body.googleSyncError) notes.push(`(Google sync warning: ${body.googleSyncError})`);
      if (body.conflicts && body.conflicts.length > 0) {
        notes.push(`Note: overlaps with "${body.conflicts[0]!.title}".`);
      }
      setFeedback(notes.join(" "));
    } finally {
      setSaving(false);
    }
  }

  async function confirmEvent(ev: CalendarEventRow) {
    setBusyId(ev.id);
    setError(null);
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ev.id, status: "confirmed", pushToGoogle: Boolean(google?.connected) }),
      });
      const body = (await res.json().catch(() => null)) as { event?: CalendarEventRow; error?: string } | null;
      if (!res.ok || !body?.event) {
        setError(body?.error ?? "Couldn't confirm event.");
        return;
      }
      setEvents((prev) => prev.map((e) => (e.id === ev.id ? body.event! : e)));
      setFeedback(
        body.event.google_event_id
          ? "Booking confirmed & synced to Google Calendar."
          : "Booking confirmed on workspace calendar.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeEvent(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const sep = apiBase.includes("?") ? "&" : "?";
      const res = await fetch(`${apiBase}${sep}id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Couldn't delete event.");
        return;
      }
      setEvents((prev) => {
        const next = prev.filter((e) => e.id !== id);
        onCountChange?.(next.length);
        return next;
      });
    } finally {
      setBusyId(null);
    }
  }

  async function runGoogleSync(direction: "pull" | "push" | "both", extra?: { calendarId?: string; calendarName?: string; autoPush?: boolean }) {
    setSyncing(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/calendar/google/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, ...extra }),
      });
      const body = (await res.json().catch(() => null)) as {
        pulled?: number;
        pushed?: number;
        errors?: string[];
        google?: PublicGoogleConnectionStatus;
        error?: string;
      } | null;
      if (!res.ok || body?.error) {
        setError(body?.error ?? "Google Calendar sync failed.");
        return;
      }
      if (body?.google) setGoogle(body.google);
      await load();
      const summary =
        direction === "pull"
          ? `Pulled ${body?.pulled ?? 0} event(s) from Google Calendar.`
          : direction === "push"
            ? `Pushed ${body?.pushed ?? 0} event(s) to Google Calendar.`
            : `Two-way sync complete: pulled ${body?.pulled ?? 0}, pushed ${body?.pushed ?? 0}.`;
      setFeedback(body?.errors?.length ? `${summary} (${body.errors[0]})` : summary);
    } finally {
      setSyncing(false);
    }
  }

  async function disconnectGoogle() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/google/disconnect", { method: "POST" });
      if (!res.ok) {
        setError("Couldn't disconnect Google Calendar.");
        return;
      }
      await load();
      setFeedback("Disconnected Google Calendar. Local calendar events remain intact.");
    } finally {
      setSyncing(false);
    }
  }

  async function changeAutoBookMode(nextMode: CalendarAutoBookMode) {
    setAutoBook(nextMode);
    if (!controlsApiBase) return;
    await fetch(controlsApiBase, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarAutoBook: nextMode }),
    }).catch(() => undefined);
  }

  function shiftMonth(delta: number) {
    const dt = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(dt.getUTCFullYear());
    setViewMonth(dt.getUTCMonth());
  }

  const returnPath = mode === "ecommerce" ? "/dashboard/calendar" : "/pro/calendar";

  // -------------------------------------------------------------------------
  // COMPACT MODE (Simulator Column 3 tab)
  // -------------------------------------------------------------------------
  if (compact) {
    return (
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-secondary bg-tertiary/45 px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium text-primary">
            <Calendar className="size-3.5 text-brand-secondary" aria-hidden="true" />
            {events.length} scheduled slot{events.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex cursor-pointer items-center gap-1 font-mono text-[11px] text-[#15704C] hover:underline"
          >
            <ClockRefresh className="size-3" aria-hidden="true" />
            Refresh
          </button>
        </div>

        {error ? <Alert color="error">{error}</Alert> : null}
        {feedback ? (
          <div className="rounded-xl border border-[#A4F4CF] bg-[#F2FBF7] px-3 py-1.5 text-xs text-[#15704C]">
            {feedback}
          </div>
        ) : null}

        {/* Quick Add Busy Block / Appointment */}
        <form onSubmit={(e) => void addEvent(e)} className="flex flex-col gap-2 rounded-xl border border-secondary bg-[#FAFAF9] p-3">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-wide text-[#52525B]">
            Add busy slot or event (AI checks it live)
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={mode === "pro" ? "e.g. Busy — Clinic Surgery / Booked Shoot" : "e.g. Showroom closed / VIP pickup"}
            className="rounded-lg border border-secondary bg-white px-2.5 py-1.5 text-xs text-primary outline-none focus:border-[#1B8A5E]"
          />
          <div className="grid grid-cols-3 gap-1.5">
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="rounded-lg border border-secondary bg-white px-2 py-1 text-xs text-primary outline-none focus:border-[#1B8A5E]"
            />
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-lg border border-secondary bg-white px-2 py-1 text-xs text-primary outline-none focus:border-[#1B8A5E]"
            />
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-lg border border-secondary bg-white px-2 py-1 text-xs text-primary outline-none focus:border-[#1B8A5E]"
            />
          </div>
          <Button type="submit" size="xs" color="primary" iconLeading={CalendarPlus01} isDisabled={saving || !title.trim()}>
            {saving ? "Adding…" : "Add to Calendar"}
          </Button>
        </form>

        {/* Upcoming Events Stream */}
        <div className="flex max-h-[290px] flex-col gap-2 overflow-y-auto pr-0.5">
          {loading ? (
            <p className="py-4 text-center text-xs text-tertiary">Loading schedule…</p>
          ) : events.length === 0 ? (
            <p className="rounded-xl border border-dashed border-secondary py-6 text-center text-xs text-tertiary">
              No events yet. Add a busy block above or complete a booking in the phone chat to see it land here!
            </p>
          ) : (
            events.map((ev) => {
              const s = formatTunisDateTime(ev.start_at);
              const e = formatTunisDateTime(ev.end_at);
              return (
                <div key={ev.id} className="rounded-xl border border-secondary bg-white p-2.5 text-xs shadow-2xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-primary" dir="auto">{ev.title}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] text-tertiary">
                        <Clock className="size-3" aria-hidden="true" />
                        {s.date} · {ev.all_day ? "All day" : `${s.time}–${e.time}`}
                      </p>
                    </div>
                    <Badge color={statusBadgeColor(ev.status, ev.source)} size="sm" className="font-mono text-[9.5px] uppercase">
                      {ev.source === "ai_dm" ? `AI · ${ev.status}` : ev.status}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 border-t border-secondary/60 pt-1.5">
                    <a
                      href={buildGoogleCalendarQuickLink(ev)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[10.5px] text-[#15704C] hover:underline"
                    >
                      Google Cal <LinkExternal01 className="size-3" aria-hidden="true" />
                    </a>
                    <div className="flex items-center gap-1">
                      {ev.status === "tentative" ? (
                        <Button
                          size="xs"
                          color="primary"
                          iconLeading={CheckCircle}
                          isDisabled={busyId === ev.id}
                          onClick={() => void confirmEvent(ev)}
                        >
                          Confirm
                        </Button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busyId === ev.id}
                        aria-label="Delete event"
                        onClick={() => void removeEvent(ev.id)}
                        className="cursor-pointer rounded p-1 text-tertiary hover:bg-red-50 hover:text-[#D13C2E]"
                      >
                        <Trash01 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // FULL DASHBOARD MODE (/pro/calendar & /dashboard/calendar)
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E4E4E7] pb-5">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#52525B]">
            Schedule &amp; Google Calendar Sync
          </p>
          <h1 className="mt-1.5 text-2xl font-medium tracking-[-0.03em] text-[#09090B] sm:text-3xl">
            Built-in Calendar
          </h1>
          <p className="mt-1 text-sm text-[#52525B]">
            Add bookings straight to your calendar, sync two-way (pull &amp; push) with Google Calendar, and let Gemini see every busy slot automatically.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/calendar/export"
            className="inline-flex items-center gap-1.5 rounded-lg border border-secondary bg-white px-3 py-2 text-xs font-medium text-primary no-underline shadow-2xs transition-colors hover:bg-secondary/40"
          >
            <Download01 className="size-3.5" aria-hidden="true" />
            Export .ics
          </a>
          <Button
            size="sm"
            color="secondary"
            iconLeading={ClockRefresh}
            isDisabled={loading}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error ? <Alert color="error">{error}</Alert> : null}
      {feedback ? <Alert color="success">{feedback}</Alert> : null}

      {/* Google Calendar Two-Way Sync Card */}
      <Card>
        <CardHeader className="border-b border-[#E4E4E7]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarCheck01 className="size-4 text-brand-secondary" aria-hidden="true" />
                Google Calendar Two-Way Sync (Pull &amp; Push)
              </CardTitle>
              <CardDescription>
                Pull busy times from Google Calendar so Gemini never double-books you, and push new Wassalha bookings straight to Google Calendar.
              </CardDescription>
            </div>
            <Badge color={google?.connected ? "success" : "gray"} className="font-mono text-[11px] uppercase">
              {google?.connected ? `Connected · ${google.googleEmail || google.calendarName}` : "Not Connected"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-4">
          {google?.connected ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-end gap-3">
                  {googleCalendars.length > 0 ? (
                    <NativeSelect
                      label="Target Google Calendar"
                      size="sm"
                      className="w-60"
                      value={google.calendarId}
                      onChange={(e) => {
                        const chosen = googleCalendars.find((c) => c.id === e.target.value);
                        void runGoogleSync("pull", {
                          calendarId: e.target.value,
                          calendarName: chosen?.summary ?? e.target.value,
                        });
                      }}
                      options={googleCalendars.map((c) => ({
                        value: c.id,
                        label: c.primary ? `${c.summary} (Primary)` : c.summary,
                      }))}
                    />
                  ) : null}
                  <label className="flex cursor-pointer items-center gap-2 pb-1 text-xs font-medium text-primary">
                    <input
                      type="checkbox"
                      checked={google.autoPush}
                      onChange={(e) => void runGoogleSync("both", { autoPush: e.target.checked })}
                      className="size-4 accent-[#1B8A5E]"
                    />
                    Auto-push new Wassalha bookings to Google Calendar
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    color="secondary"
                    isDisabled={syncing}
                    onClick={() => void runGoogleSync("pull")}
                  >
                    Pull from Google
                  </Button>
                  <Button
                    size="sm"
                    color="secondary"
                    isDisabled={syncing}
                    onClick={() => void runGoogleSync("push")}
                  >
                    Push to Google
                  </Button>
                  <Button
                    size="sm"
                    color="primary"
                    iconLeading={ClockRefresh}
                    isDisabled={syncing}
                    onClick={() => void runGoogleSync("both")}
                  >
                    {syncing ? "Syncing…" : "Two-Way Sync"}
                  </Button>
                  <Button
                    size="sm"
                    color="tertiary"
                    isDisabled={syncing}
                    onClick={() => void disconnectGoogle()}
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
              {google.lastSyncedAt ? (
                <p className="font-mono text-[11px] text-tertiary">
                  Last synced: {new Date(google.lastSyncedAt).toLocaleString()}
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="max-w-2xl text-sm text-[#52525B]">
                {google?.oauthConfigured ? (
                  <p>
                    Click below to sign in with Google and authorize read/write access to your Google Calendar. Your OAuth tokens stay strictly server-side.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    <p className="font-medium text-[#09090B]">
                      Built-in calendar is active right now. To enable live Google OAuth two-way sync:
                    </p>
                    <p className="text-xs text-[#52525B]">
                      Add <code className="rounded bg-secondary px-1 py-0.5 font-mono">GOOGLE_OAUTH_CLIENT_ID</code> and{" "}
                      <code className="rounded bg-secondary px-1 py-0.5 font-mono">GOOGLE_OAUTH_CLIENT_SECRET</code> in{" "}
                      <code className="rounded bg-secondary px-1 py-0.5 font-mono">.env.local</code>, and register redirect URI{" "}
                      <code className="rounded bg-secondary px-1 py-0.5 font-mono">
                        {google?.redirectUri ?? "http://localhost:3000/api/calendar/google/callback"}
                      </code>{" "}
                      in Google Cloud Console. Meanwhile, every event already has 1-click Google Calendar links &amp; .ics export.
                    </p>
                  </div>
                )}
              </div>
              {google?.oauthConfigured ? (
                <a
                  href={`/api/calendar/google/start?returnTo=${encodeURIComponent(returnPath)}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1D1E1A] px-4 py-2 text-sm font-medium text-white no-underline transition-colors hover:bg-[#32332D]"
                >
                  <CalendarCheck01 className="size-4" aria-hidden="true" />
                  Connect Google Calendar
                </a>
              ) : null}
            </div>
          )}

          {/* DM Auto-booking setting inline */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E4E7] pt-3">
            <span className="text-xs font-medium text-[#09090B]">
              When a client completes booking details in DM:
            </span>
            <div className="inline-flex rounded-lg border border-secondary bg-[#FAFAF9] p-0.5">
              {(
                [
                  { value: "tentative", label: "Add as Tentative" },
                  { value: "confirmed", label: "Auto-Confirm" },
                  { value: "manual", label: "Manual Only" },
                ] as Array<{ value: CalendarAutoBookMode; label: string }>
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => void changeAutoBookMode(opt.value)}
                  className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    autoBook === opt.value ? "bg-[#1D1E1A] text-white" : "text-tertiary hover:text-primary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Split: Month Calendar Grid + Day Agenda & Add Event */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.9fr)]">
        {/* Month Grid */}
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E4E7]">
            <CardTitle className="text-base">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <Button size="xs" color="secondary" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                size="xs"
                color="secondary"
                onClick={() => {
                  const cur = today || todayTunisYmd();
                  const t = parseYmd(cur);
                  setToday(cur);
                  setViewYear(t.year);
                  setViewMonth(t.month - 1);
                  setSelectedDay(cur);
                }}
              >
                Today
              </Button>
              <Button size="xs" color="secondary" aria-label="Next month" onClick={() => shiftMonth(1)}>
                <ChevronLeft className="size-4 rotate-180" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-7 gap-1 pb-2 text-center font-mono text-[11px] font-medium uppercase text-[#71717A]">
              {WEEKDAYS.map((wd) => (
                <div key={wd}>{wd}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthCells.map((cell) => {
                const dayEvents = eventsByDay.get(cell.ymd) ?? [];
                const isToday = cell.ymd === today;
                const isSelected = cell.ymd === selectedDay;
                return (
                  <button
                    key={cell.ymd}
                    type="button"
                    onClick={() => {
                      setSelectedDay(cell.ymd);
                      setDateStr(cell.ymd);
                    }}
                    className={`flex min-h-[76px] cursor-pointer flex-col items-start justify-between rounded-xl border p-1.5 text-left transition-colors ${
                      isSelected
                        ? "border-[#1B8A5E] bg-[#F2FBF7]"
                        : cell.inMonth
                          ? "border-[#E4E4E7] bg-white hover:bg-[#FAFAF9]"
                          : "border-transparent bg-[#FAFAF9]/60 text-[#A1A1AA]"
                    }`}
                  >
                    <span
                      className={`inline-flex size-6 items-center justify-center rounded-full font-mono text-xs font-medium ${
                        isToday ? "bg-[#1D1E1A] text-white" : cell.inMonth ? "text-[#09090B]" : "text-[#A1A1AA]"
                      }`}
                    >
                      {cell.dayNum}
                    </span>
                    <div className="flex w-full flex-col gap-0.5 overflow-hidden">
                      {dayEvents.slice(0, 2).map((ev) => (
                        <span
                          key={ev.id}
                          className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                            ev.source === "google"
                              ? "bg-blue-50 text-blue-800"
                              : ev.status === "tentative"
                                ? "bg-amber-50 text-amber-800"
                                : "bg-[#E7F7F0] text-[#15704C]"
                          }`}
                        >
                          {ev.title}
                        </span>
                      ))}
                      {dayEvents.length > 2 ? (
                        <span className="px-1 font-mono text-[9.5px] text-tertiary">
                          +{dayEvents.length - 2} more
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Selected Day Agenda + Add Event Form */}
        <div className="flex flex-col gap-5">
          {/* Selected Day Events */}
          <Card>
            <CardHeader className="border-b border-[#E4E4E7]">
              <CardTitle className="text-base">Schedule for {selectedDay}</CardTitle>
              <CardDescription>
                {selectedDayEvents.length === 0
                  ? "Open day — no events scheduled yet."
                  : `${selectedDayEvents.length} event${selectedDayEvents.length === 1 ? "" : "s"} on this date.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 pt-4">
              {selectedDayEvents.length === 0 ? (
                <p className="py-3 text-center text-xs text-tertiary">
                  Add an appointment, shoot, delivery window, or busy block below.
                </p>
              ) : (
                selectedDayEvents.map((ev) => {
                  const s = formatTunisDateTime(ev.start_at);
                  const e = formatTunisDateTime(ev.end_at);
                  return (
                    <div key={ev.id} className="rounded-xl border border-[#E4E4E7] bg-[#FAFAF9] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-[#09090B]" dir="auto">{ev.title}</p>
                          <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-[#52525B]">
                            <Clock className="size-3.5" aria-hidden="true" />
                            {ev.all_day ? "All day" : `${s.time} – ${e.time}`} (Tunis)
                          </p>
                          {ev.location ? <p className="mt-0.5 text-xs text-tertiary">📍 {ev.location}</p> : null}
                          {ev.client_name || ev.client_phone ? (
                            <p className="mt-0.5 text-xs text-tertiary">
                              Client: {[ev.client_name, ev.client_phone].filter(Boolean).join(" · ")}
                            </p>
                          ) : null}
                        </div>
                        <Badge color={statusBadgeColor(ev.status, ev.source)} size="sm" className="font-mono text-[10px] uppercase">
                          {ev.source === "google" ? "Google" : ev.source === "ai_dm" ? `AI · ${ev.status}` : ev.status}
                        </Badge>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#E4E4E7] pt-2">
                        <a
                          href={buildGoogleCalendarQuickLink(ev)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-[11px] text-[#15704C] hover:underline"
                        >
                          Open in Google Calendar
                          <LinkExternal01 className="size-3" aria-hidden="true" />
                        </a>
                        <div className="flex items-center gap-1.5">
                          {ev.status === "tentative" ? (
                            <Button
                              size="xs"
                              color="primary"
                              iconLeading={CheckCircle}
                              isDisabled={busyId === ev.id}
                              onClick={() => void confirmEvent(ev)}
                            >
                              Confirm
                            </Button>
                          ) : null}
                          <Button
                            size="xs"
                            color="tertiary"
                            aria-label="Delete event"
                            iconLeading={Trash01}
                            isDisabled={busyId === ev.id}
                            onClick={() => void removeEvent(ev.id)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Add Event Form */}
          <Card>
            <CardHeader className="border-b border-[#E4E4E7]">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarPlus01 className="size-4 text-brand-secondary" aria-hidden="true" />
                Add to Calendar Straight
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={(e) => void addEvent(e)} className="flex flex-col gap-3">
                <Input
                  label="Event Title"
                  placeholder={mode === "pro" ? "e.g. Consultation — Amine / Wedding Shoot Hammamet" : "e.g. Showroom Fitting / Tunis Dispatch Block"}
                  value={title}
                  onChange={setTitle}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-primary">Date</label>
                    <input
                      type="date"
                      value={dateStr}
                      onChange={(e) => setDateStr(e.target.value)}
                      className="rounded-lg border border-secondary bg-white px-2.5 py-2 text-sm text-primary outline-none focus:border-[#1B8A5E]"
                    />
                  </div>
                  <NativeSelect
                    label="Category"
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as CalendarEventType)}
                    options={[
                      { value: "appointment", label: "Appointment" },
                      { value: "shoot", label: "Shoot / Production" },
                      { value: "meeting", label: "Meeting / Call" },
                      { value: "delivery", label: "Delivery / Pickup" },
                      { value: "blocked", label: "Busy / Blocked" },
                      { value: "reminder", label: "Reminder" },
                    ]}
                  />
                </div>
                {!allDay ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-primary">Start (Tunis)</label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="rounded-lg border border-secondary bg-white px-2.5 py-2 text-sm text-primary outline-none focus:border-[#1B8A5E]"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-primary">End (Tunis)</label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="rounded-lg border border-secondary bg-white px-2.5 py-2 text-sm text-primary outline-none focus:border-[#1B8A5E]"
                      />
                    </div>
                  </div>
                ) : null}
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-primary">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                    className="size-4 accent-[#1B8A5E]"
                  />
                  All-day event
                </label>
                <Input
                  label="Location (optional)"
                  placeholder="Lac 2, Tunis / Studio / Online"
                  value={location}
                  onChange={setLocation}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Client Name" placeholder="Optional" value={clientName} onChange={setClientName} />
                  <Input label="Client Phone" placeholder="+216..." value={clientPhone} onChange={setClientPhone} />
                </div>
                {google?.connected ? (
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-[#15704C]">
                    <input
                      type="checkbox"
                      checked={pushToGoogle}
                      onChange={(e) => setPushToGoogle(e.target.checked)}
                      className="size-4 accent-[#1B8A5E]"
                    />
                    Push straight to connected Google Calendar
                  </label>
                ) : null}
                <Button type="submit" color="primary" iconLeading={CalendarPlus01} isDisabled={saving || !title.trim()}>
                  {saving ? "Saving…" : "Add to Calendar"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
