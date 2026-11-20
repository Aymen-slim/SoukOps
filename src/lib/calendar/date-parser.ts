/**
 * Deterministic Tunisia-first natural date/time slot parser, conflict checker,
 * Google Calendar quick-add URL generator, and RFC 5545 `.ics` serializer.
 *
 * Tunisia observes `Africa/Tunis` (UTC+01:00) year-round with no daylight saving changes.
 */

export const TUNIS_TIMEZONE = "Africa/Tunis";
export const TUNIS_UTC_OFFSET_MINUTES = 60;

export interface ParsedCalendarSlot {
  startAt: string; // ISO 8601 UTC string
  endAt: string;   // ISO 8601 UTC string
  allDay: boolean;
  confidence: "high" | "medium";
  label: string;
}

export interface ConflictCheckItem {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
  all_day?: boolean;
  source?: string;
}

interface Ymd {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
}

function tunisYmdFromDate(date: Date): Ymd {
  const shifted = new Date(date.getTime() + TUNIS_UTC_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function addDaysYmd(base: Ymd, days: number): Ymd {
  const d = new Date(Date.UTC(base.year, base.month - 1, base.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function dayOfWeekYmd(ymd: Ymd): number {
  // 0 = Sunday .. 6 = Saturday
  return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay();
}

export function tunisLocalToUtcIso(ymd: Ymd, hour: number, minute: number): string {
  const utcMs = Date.UTC(ymd.year, ymd.month - 1, ymd.day, hour, minute) - TUNIS_UTC_OFFSET_MINUTES * 60_000;
  return new Date(utcMs).toISOString();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Formats a UTC ISO timestamp in `Africa/Tunis` wall time (`YYYY-MM-DD HH:mm`). */
export function formatTunisDateTime(iso: string): { date: string; time: string } {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { date: iso.slice(0, 10), time: "00:00" };
  const shifted = new Date(ms + TUNIS_UTC_OFFSET_MINUTES * 60_000);
  const date = `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
  const time = `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
  return { date, time };
}

/** Infers duration in minutes from a Pro service's `duration_label` (e.g. `"30 min"`, `"2h"`, `"Half day"`). */
export function parseDurationMinutes(label?: string | null, fallback = 60): number {
  if (!label) return fallback;
  const clean = label.toLowerCase();
  if (/full\s*day|journ[eé]e\s*compl[eè]te|8h/i.test(clean)) return 480;
  if (/half\s*day|demi[\s-]*journ[eé]e/i.test(clean)) return 240;
  const hm = clean.match(/(\d+)\s*h(?:\s*(\d{1,2}))?/);
  if (hm) {
    const hours = Number(hm[1]);
    const mins = hm[2] ? Number(hm[2]) : 0;
    if (hours > 0 && hours <= 12) return hours * 60 + mins;
  }
  const mOnly = clean.match(/(\d{1,3})\s*(?:min|mn|m\b|دقيقة)/);
  if (mOnly) {
    const mins = Number(mOnly[1]);
    if (mins >= 10 && mins <= 480) return mins;
  }
  return fallback;
}

const MONTH_ALIASES: Array<{ month: number; pattern: RegExp }> = [
  { month: 1, pattern: /^(?:janvier|janv?\.?|january|جانفي|يناير)$/i },
  { month: 2, pattern: /^(?:f[eé]vrier|f[eé]v\.?|february|feb\.?|فيفري|فبراير)$/i },
  { month: 3, pattern: /^(?:mars|march|mar\.?|مارس)$/i },
  { month: 4, pattern: /^(?:avril|avr\.?|april|apr\.?|أفريل|ابريل|أبريل)$/i },
  { month: 5, pattern: /^(?:mai|may|ماي|مايو)$/i },
  { month: 6, pattern: /^(?:juin|june|jun\.?|جوان|يونيو)$/i },
  { month: 7, pattern: /^(?:juillet|juil\.?|july|jul\.?|جويلية|يوليو)$/i },
  { month: 8, pattern: /^(?:ao[uû]t|august|aug\.?|أوت|أغسطس)$/i },
  { month: 9, pattern: /^(?:septembre|sept?\.?|september|سبتمبر)$/i },
  { month: 10, pattern: /^(?:octobre|oct\.?|october|أكتوبر|اكتوبر)$/i },
  { month: 11, pattern: /^(?:novembre|nov\.?|november|نوفمبر)$/i },
  { month: 12, pattern: /^(?:d[eé]cembre|d[eé]c\.?|december|dec\.?|ديسمبر)$/i },
];

const WEEKDAY_PATTERNS: Array<{ dow: number; pattern: RegExp }> = [
  { dow: 0, pattern: /\b(?:dimanche|sunday|a7ad|el\s+a7ad|nhar\s+el\s+a7ad)\b|الأحد|الاحد/i },
  { dow: 1, pattern: /\b(?:lundi|monday|ethnin|tnin|el\s+ethnin|nhar\s+el\s+ethnin)\b|الإثنين|الاثنين/i },
  { dow: 2, pattern: /\b(?:mardi|tuesday|thletha|tletha|el\s+thletha)\b|الثلاثاء/i },
  { dow: 3, pattern: /\b(?:mercredi|wednesday|erb3a|arba3a|el\s+erb3a)\b|الأربعاء|الاربعاء/i },
  { dow: 4, pattern: /\b(?:jeudi|thursday|khmis|khmiss|el\s+khmis)\b|الخميس/i },
  { dow: 5, pattern: /\b(?:vendredi|friday|jom3a|jem3a|el\s+jom3a)\b|الجمعة/i },
  { dow: 6, pattern: /\b(?:samedi|saturday|sebt|sabt|el\s+sebt)\b|السبت/i },
];

function parseMonthToken(token: string): number | null {
  const clean = token.trim();
  for (const m of MONTH_ALIASES) {
    if (m.pattern.test(clean)) return m.month;
  }
  return null;
}

function parseTimeFromText(text: string): { hour: number; minute: number; explicit: boolean } {
  // 14h30, 10h, 14:30, 9:15
  const hMatch = text.match(/(?:^|[\sàa@])(\d{1,2})\s*(?:h|:)\s*(\d{2})?(?:\b|$)/i);
  if (hMatch) {
    const h = Number(hMatch[1]);
    const m = hMatch[2] ? Number(hMatch[2]) : 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { hour: h, minute: m, explicit: true };
    }
  }
  // 2pm, 10 am, 3:30pm
  const ampm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = ampm[2] ? Number(ampm[2]) : 0;
    const meridian = ampm[3]!.toLowerCase();
    if (h >= 1 && h <= 12 && m >= 0 && m <= 59) {
      if (meridian === "pm" && h < 12) h += 12;
      if (meridian === "am" && h === 12) h = 0;
      return { hour: h, minute: m, explicit: true };
    }
  }
  // Arabic/French/Derja period hints
  if (/\b(?:soir|evening|lil)\b|مساء/i.test(text)) return { hour: 18, minute: 0, explicit: false };
  if (/\b(?:3chiya|apr[eè]s[\s-]*midi|afternoon)\b|العشية/i.test(text)) return { hour: 15, minute: 0, explicit: false };
  if (/\b(?:midi|noon)\b|الظهر/i.test(text)) return { hour: 12, minute: 0, explicit: false };
  if (/\b(?:sbah|sba7|matin|morning)\b|الصبح|صباحا/i.test(text)) return { hour: 10, minute: 0, explicit: false };
  return { hour: 10, minute: 0, explicit: false };
}

/**
 * Deterministically parses a client's requested date/time text into a concrete
 * `Africa/Tunis` UTC ISO start/end slot. Returns `null` if no date signal is found.
 */
export function parseRequestedDateToSlot(
  text: string | null | undefined,
  opts?: { referenceDate?: Date; durationMinutes?: number },
): ParsedCalendarSlot | null {
  const clean = text?.trim();
  if (!clean) return null;

  const ref = opts?.referenceDate ?? new Date();
  const today = tunisYmdFromDate(ref);
  const duration = Math.max(15, Math.min(720, opts?.durationMinutes ?? 60));

  let ymd: Ymd | null = null;
  let confidence: "high" | "medium" = "high";

  // 1. ISO date: 2026-11-25
  const isoMatch = clean.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      ymd = { year, month, day };
    }
  }

  // 2. DD/MM(/YYYY) or DD-MM(-YYYY)
  if (!ymd) {
    const dmy = clean.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](20\d{2}|\d{2}))?\b/);
    if (dmy) {
      const day = Number(dmy[1]);
      const month = Number(dmy[2]);
      let year = dmy[3] ? Number(dmy[3]) : today.year;
      if (year < 100) year += 2000;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        ymd = { year, month, day };
        if (!dmy[3]) {
          const candidateMs = Date.UTC(year, month - 1, day);
          const todayMs = Date.UTC(today.year, today.month - 1, today.day);
          if (candidateMs < todayMs - 86_400_000) {
            ymd = { year: year + 1, month, day };
          }
        }
      }
    }
  }

  // 3. Day + named month ("25 novembre", "3 déc", "12 مارس")
  if (!ymd) {
    const namedMonth = clean.match(
      /\b(\d{1,2})\s+([A-Za-zÀ-ÿ\u0600-\u06FF.]{3,14})(?:\s+(20\d{2}))?/u,
    );
    if (namedMonth) {
      const day = Number(namedMonth[1]);
      const month = parseMonthToken(namedMonth[2]!);
      if (month && day >= 1 && day <= 31) {
        let year = namedMonth[3] ? Number(namedMonth[3]) : today.year;
        if (!namedMonth[3]) {
          const candidateMs = Date.UTC(year, month - 1, day);
          const todayMs = Date.UTC(today.year, today.month - 1, today.day);
          if (candidateMs < todayMs - 86_400_000) year += 1;
        }
        ymd = { year, month, day };
      }
    }
  }

  // 4. Relative expressions (ba3d ghodwa / ghodwa / lyoum)
  if (!ymd) {
    if (/\b(?:ba3d\s*ghodwa|apr[eè]s[\s-]*demain|day\s+after\s+tomorrow)\b|بعد\s*غدوة|بعد\s*غد/i.test(clean)) {
      ymd = addDaysYmd(today, 2);
    } else if (/\b(?:ghodwa|demain|tomorrow)\b|غدوة|غداً|غدا/i.test(clean)) {
      ymd = addDaysYmd(today, 1);
    } else if (/\b(?:lyoum|el\s*youm|aujourd['’]?hui|today)\b|اليوم/i.test(clean)) {
      ymd = today;
    }
  }

  // 5. Named weekday (next occurrence; if same weekday and no "next week", +7 if today already passed or +0 if explicit)
  if (!ymd) {
    for (const wd of WEEKDAY_PATTERNS) {
      if (wd.pattern.test(clean)) {
        const currentDow = dayOfWeekYmd(today);
        let delta = (wd.dow - currentDow + 7) % 7;
        if (delta === 0) delta = 7;
        ymd = addDaysYmd(today, delta);
        confidence = "medium";
        break;
      }
    }
  }

  // 6. "next week" / "ce week-end"
  if (!ymd) {
    if (/\b(?:ce\s+week[\s-]*end|this\s+weekend)\b/i.test(clean)) {
      const currentDow = dayOfWeekYmd(today);
      const delta = (6 - currentDow + 7) % 7 || 7;
      ymd = addDaysYmd(today, delta);
      confidence = "medium";
    } else if (/\b(?:la\s+semaine\s+prochaine|next\s+week|el\s+jem3a\s+el\s+jeya)\b/i.test(clean)) {
      const currentDow = dayOfWeekYmd(today);
      const delta = (1 - currentDow + 7) % 7 || 7;
      ymd = addDaysYmd(today, delta);
      confidence = "medium";
    }
  }

  if (!ymd) return null;

  const time = parseTimeFromText(clean);
  const startAt = tunisLocalToUtcIso(ymd, time.hour, time.minute);
  const endAt = new Date(Date.parse(startAt) + duration * 60_000).toISOString();
  const formatted = formatTunisDateTime(startAt);
  const endFormatted = formatTunisDateTime(endAt);

  return {
    startAt,
    endAt,
    allDay: false,
    confidence: time.explicit ? confidence : "medium",
    label: `${formatted.date} ${formatted.time}–${endFormatted.time}`,
  };
}

/** Returns active calendar events that overlap `[startIso, endIso)`. */
export function findCalendarConflicts<T extends ConflictCheckItem>(
  startIso: string,
  endIso: string,
  events: T[],
  ignoreEventId?: string | null,
): T[] {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];

  return events.filter((ev) => {
    if (ev.status === "cancelled") return false;
    if (ignoreEventId && ev.id === ignoreEventId) return false;
    const evStart = Date.parse(ev.start_at);
    const evEnd = Date.parse(ev.end_at);
    if (!Number.isFinite(evStart) || !Number.isFinite(evEnd)) return false;
    return startMs < evEnd && endMs > evStart;
  });
}

function toGoogleUtcStamp(iso: string): string {
  const d = new Date(iso);
  return (
    d.getUTCFullYear().toString().padStart(4, "0") +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    "Z"
  );
}

/** Builds a zero-config 1-click "Add to Google Calendar" URL for any event. */
export function buildGoogleCalendarQuickLink(event: {
  title: string;
  description?: string;
  location?: string;
  start_at: string;
  end_at: string;
  all_day?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("action", "TEMPLATE");
  params.set("text", event.title);
  if (event.all_day) {
    const s = formatTunisDateTime(event.start_at).date.replace(/-/g, "");
    const e = formatTunisDateTime(event.end_at).date.replace(/-/g, "");
    params.set("dates", `${s}/${e === s ? formatTunisDateTime(new Date(Date.parse(event.end_at) + 86_400_000).toISOString()).date.replace(/-/g, "") : e}`);
  } else {
    params.set("dates", `${toGoogleUtcStamp(event.start_at)}/${toGoogleUtcStamp(event.end_at)}`);
  }
  if (event.description?.trim()) params.set("details", event.description.trim());
  if (event.location?.trim()) params.set("location", event.location.trim());
  params.set("ctz", TUNIS_TIMEZONE);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Serializes calendar events into an RFC 5545 `.ics` file for Apple/Google/Outlook Calendar import. */
export function buildIcsContent(
  events: Array<{
    id: string;
    title: string;
    description?: string;
    location?: string;
    start_at: string;
    end_at: string;
    all_day?: boolean;
    status?: string;
  }>,
  calendarName = "Wassalha Schedule",
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wassalha//Workspace Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    `X-WR-TIMEZONE:${TUNIS_TIMEZONE}`,
  ];

  const dtStamp = toGoogleUtcStamp(new Date().toISOString());

  for (const ev of events) {
    if (ev.status === "cancelled") continue;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.id}@wassalha.tn`);
    lines.push(`DTSTAMP:${dtStamp}`);
    if (ev.all_day) {
      const startDay = formatTunisDateTime(ev.start_at).date.replace(/-/g, "");
      const endDay = formatTunisDateTime(ev.end_at).date.replace(/-/g, "");
      lines.push(`DTSTART;VALUE=DATE:${startDay}`);
      lines.push(`DTEND;VALUE=DATE:${endDay}`);
    } else {
      lines.push(`DTSTART:${toGoogleUtcStamp(ev.start_at)}`);
      lines.push(`DTEND:${toGoogleUtcStamp(ev.end_at)}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(ev.title)}`);
    if (ev.description?.trim()) lines.push(`DESCRIPTION:${escapeIcsText(ev.description.trim())}`);
    if (ev.location?.trim()) lines.push(`LOCATION:${escapeIcsText(ev.location.trim())}`);
    lines.push(`STATUS:${ev.status === "tentative" ? "TENTATIVE" : "CONFIRMED"}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
