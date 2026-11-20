import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sparkJsonMock, sparkTextMock, sendTextMock, sendPinLinkMock, geminiTranscribeMock } = vi.hoisted(() => ({
  sparkJsonMock: vi.fn(),
  sparkTextMock: vi.fn(),
  sendTextMock: vi.fn(),
  sendPinLinkMock: vi.fn(),
  geminiTranscribeMock: vi.fn(),
}));

vi.mock("@/lib/ai/spark", () => ({
  sparkJson: sparkJsonMock,
  sparkText: sparkTextMock,
  aiJson: sparkJsonMock,
  aiText: sparkTextMock,
}));

vi.mock("@/lib/ai/providers/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/providers/gemini")>("@/lib/ai/providers/gemini");
  return {
    ...actual,
    geminiConfigured: () => true,
    geminiTranscribeAudio: geminiTranscribeMock,
  };
});

vi.mock("@/lib/ai/embeddings", () => ({
  embedConfigured: () => false,
  embedTexts: vi.fn().mockResolvedValue([]),
  embedImages: vi.fn().mockResolvedValue([]),
  cosineSimilarity: () => 0,
}));

vi.mock("@/lib/channels", () => ({
  channelAdapter: {
    sendText: sendTextMock,
    sendPinLink: sendPinLinkMock,
    sendImage: vi.fn(),
    sendButtons: vi.fn(),
    sendLocationRequest: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
  hasAdminConfig: () => false,
}));

import { transcribeWithGeminiAudio } from "@/lib/ai/asr";
import { formatCalendarScheduleBlock, type CalendarEventRow } from "@/lib/calendar/calendar-store";
import {
  buildGoogleCalendarQuickLink,
  buildIcsContent,
  findCalendarConflicts,
  formatTunisDateTime,
  parseDurationMinutes,
  parseRequestedDateToSlot,
} from "@/lib/calendar/date-parser";
import {
  mapGoogleEventToLocal,
  mapLocalEventToGooglePayload,
  pullFromGoogleCalendar,
  pushEventToGoogleCalendar,
} from "@/lib/calendar/google-calendar";
import { resetEnvCache } from "@/lib/env";
import { getProPreset } from "@/lib/pro/presets";
import { runProTurn, type ProConversationRow, type ProMessageRow } from "@/lib/pro/turn";
import type { ProCategory, ProProfileRow, ProServiceRow } from "@/lib/pro/types";

beforeEach(() => {
  sparkJsonMock.mockReset();
  sparkTextMock.mockReset();
  sendTextMock.mockReset().mockResolvedValue(undefined);
  sendPinLinkMock.mockReset().mockResolvedValue(undefined);
  geminiTranscribeMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetEnvCache();
});

describe("Calendar Date Parser, Conflict Detection, ICS & Google Quick Links", () => {
  // Reference: Friday 2026-11-20 12:00 Africa/Tunis (11:00 UTC)
  const ref = new Date("2026-11-20T11:00:00.000Z");

  it("parses Tunisian Derja, French, Arabic, and ISO booking expressions into Africa/Tunis slots", () => {
    const derja = parseRequestedDateToSlot("ghodwa 10h", { referenceDate: ref, durationMinutes: 45 });
    expect(derja).not.toBeNull();
    expect(formatTunisDateTime(derja!.startAt)).toEqual({ date: "2026-11-21", time: "10:00" });
    expect(formatTunisDateTime(derja!.endAt)).toEqual({ date: "2026-11-21", time: "10:45" });

    const fr = parseRequestedDateToSlot("25 novembre à 15h30", { referenceDate: ref, durationMinutes: 60 });
    expect(fr).not.toBeNull();
    expect(formatTunisDateTime(fr!.startAt)).toEqual({ date: "2026-11-25", time: "15:30" });

    const ar = parseRequestedDateToSlot("غدوة 14:00", { referenceDate: ref, durationMinutes: 30 });
    expect(ar).not.toBeNull();
    expect(formatTunisDateTime(ar!.startAt)).toEqual({ date: "2026-11-21", time: "14:00" });

    const period = parseRequestedDateToSlot("demain après-midi", { referenceDate: ref, durationMinutes: 60 });
    expect(period).not.toBeNull();
    expect(formatTunisDateTime(period!.startAt)).toEqual({ date: "2026-11-21", time: "15:00" });

    expect(parseDurationMinutes("30 min")).toBe(30);
    expect(parseDurationMinutes("2h")).toBe(120);
    expect(parseDurationMinutes("Half day")).toBe(240);
  });

  it("detects overlapping busy slots while ignoring adjacent and cancelled events", () => {
    const events = [
      { id: "e1", title: "Surgery", start_at: "2026-11-21T09:00:00.000Z", end_at: "2026-11-21T10:00:00.000Z", status: "confirmed" },
      { id: "e2", title: "Cancelled", start_at: "2026-11-21T10:00:00.000Z", end_at: "2026-11-21T11:00:00.000Z", status: "cancelled" },
    ];
    // Overlaps e1
    expect(findCalendarConflicts("2026-11-21T09:30:00.000Z", "2026-11-21T10:30:00.000Z", events)).toHaveLength(1);
    // Adjacent right after e1 (and e2 is cancelled) -> open!
    expect(findCalendarConflicts("2026-11-21T10:00:00.000Z", "2026-11-21T11:00:00.000Z", events)).toHaveLength(0);
  });

  it("generates Google Calendar quick-add links, valid .ics files, and deterministic schedule blocks", () => {
    const ev = {
      id: "ev-1",
      title: "Consultation — Amine",
      description: "Cabinet Lac 2",
      location: "Lac 2, Tunis",
      start_at: "2026-11-21T09:00:00.000Z",
      end_at: "2026-11-21T10:00:00.000Z",
      all_day: false,
      status: "confirmed" as const,
      source: "ai_dm" as const,
    };

    const link = buildGoogleCalendarQuickLink(ev);
    expect(link).toContain("calendar.google.com/calendar/render");
    expect(link).toContain("action=TEMPLATE");
    expect(link).toContain("ctz=Africa%2FTunis");

    const ics = buildIcsContent([ev], "Dr. Amira Clinic");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Consultation — Amine");
    expect(ics).toContain("LOCATION:Lac 2\\, Tunis");
    expect(ics).toContain("END:VCALENDAR");

    expect(formatCalendarScheduleBlock([])).toBe("");
    const block = formatCalendarScheduleBlock([ev]);
    expect(block).toContain("2026-11-21 10:00–11:00");
    expect(block).toContain("Consultation — Amine");
    expect(block).not.toContain("ev-1");
  });
});

describe("Two-Way Google Calendar Mapping, Pull & Push", () => {
  it("maps Google Calendar v3 events to local format and local events to Google payloads", () => {
    const mapped = mapGoogleEventToLocal("primary", {
      id: "g-123",
      etag: '"etag-1"',
      status: "confirmed",
      summary: "Dental Follow-up",
      location: "Tunis",
      start: { dateTime: "2026-11-22T09:00:00+01:00", timeZone: "Africa/Tunis" },
      end: { dateTime: "2026-11-22T10:00:00+01:00", timeZone: "Africa/Tunis" },
    });
    expect(mapped?.google_event_id).toBe("g-123");
    expect(mapped?.source).toBe("google");
    expect(mapped?.title).toBe("Dental Follow-up");

    const payload = mapLocalEventToGooglePayload({
      title: "Wedding Shoot",
      description: "Drone + 2 cameras",
      location: "Hammamet",
      start_at: "2026-11-25T13:00:00.000Z",
      end_at: "2026-11-25T17:00:00.000Z",
      all_day: false,
      timezone: "Africa/Tunis",
      status: "confirmed",
      client_name: "Youssef",
      client_phone: "+21655123456",
    });
    expect(payload.summary).toBe("Wedding Shoot");
    expect(payload.description).toContain("Client: Youssef");
    expect(payload.location).toBe("Hammamet");
  });

  it("pulls from Google Calendar and pushes local events via Calendar v3 REST API with ai_cache fallback", async () => {
    const cache = new Map<string, unknown>();
    cache.set("workspace_calendar_conn:m-gcal", {
      merchant_id: "m-gcal",
      provider: "google",
      google_email: "clinic@example.com",
      calendar_id: "primary",
      calendar_name: "Primary",
      access_token: "ya29.test-token",
      refresh_token: "1//refresh",
      token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      auto_push: true,
    });

    const supabaseStub = {
      from: vi.fn((table: string) => {
        if (table === "workspace_calendar_events" || table === "workspace_calendar_connections") {
          const err = { code: "42P01", message: `relation "${table}" does not exist` };
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({ data: null, error: err }),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: err }),
              })),
            })),
            insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error: err }) })) })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: err }) })) })),
              })),
            })),
            upsert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error: err }) })) })),
          };
        }
        if (table === "ai_cache") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((_col: string, key: string) => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: cache.has(key) ? { value: cache.get(key) } : null,
                  error: null,
                }),
              })),
            })),
            upsert: vi.fn((row: { key: string; value: unknown }) => {
              cache.set(row.key, row.value);
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {};
      }),
    };

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/events?") && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "g-evt-99",
                etag: '"e99"',
                status: "confirmed",
                summary: "Pulled Google Meeting",
                start: { dateTime: "2026-11-23T10:00:00+01:00" },
                end: { dateTime: "2026-11-23T11:00:00+01:00" },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/events") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "g-created-77", etag: '"e77"' }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pullRes = await pullFromGoogleCalendar(supabaseStub as never, "m-gcal");
    expect(pullRes.pulled).toBe(1);
    expect(pullRes.created).toBe(1);

    // Second pull updates instead of duplicating
    const pullRes2 = await pullFromGoogleCalendar(supabaseStub as never, "m-gcal");
    expect(pullRes2.created).toBe(0);
    expect(pullRes2.updated).toBe(1);

    // Push local event to Google Calendar
    const storedEvents = ((cache.get("workspace_calendar_events:m-gcal") as { events: CalendarEventRow[] }).events);
    const localEv: CalendarEventRow = {
      ...storedEvents[0]!,
      id: "local-1",
      title: "New Local Appointment",
      source: "ai_dm",
      google_event_id: null,
    };
    cache.set("workspace_calendar_events:m-gcal", { events: [...storedEvents, localEv] });

    const pushed = await pushEventToGoogleCalendar(supabaseStub as never, "m-gcal", localEv);
    expect(pushed.google_event_id).toBe("g-created-77");
  });
});

describe("Pro DM Auto-Booking & Conflict Guard + Any-Language Voice ASR", () => {
  it("auto-adds completed Pro DM booking straight to calendar as tentative and warns AI on busy conflict", async () => {
    const preset = getProPreset("doctor");
    const profile: ProProfileRow = {
      merchant_id: "m-cal-pro",
      display_name: preset.defaultDisplayName,
      headline: preset.headline,
      profession_preset: "doctor" as ProCategory,
      bio: preset.bio,
      location_city: preset.locationCity,
      clinic_or_studio_address: preset.clinicOrStudioAddress,
      lat: preset.lat,
      lng: preset.lng,
      style_samples: preset.styleSamples,
      style_rules: preset.styleRules,
      boundaries_note: preset.boundariesNote,
      opportunity_goals: preset.opportunityGoals,
      opportunity_keywords: preset.opportunityKeywords,
      min_deal_budget_millimes: null,
      auto_reply_enabled: true,
      alert_whatsapp_phone: null,
      alert_email: null,
    };
    const services: ProServiceRow[] = preset.services.map((s, idx) => ({
      id: `svc-${idx + 1}`,
      merchant_id: "m-cal-pro",
      title: s.title,
      category: s.category,
      description: s.description,
      deliverables: s.deliverables,
      duration_label: s.duration_label,
      price_millimes: s.price_millimes,
      price_display: s.price_display,
      floor_millimes: s.floor_millimes,
      pricing_mode: s.pricing_mode,
      intake_questions: s.intake_questions,
      prep_or_details_template: s.prep_or_details_template,
      booking_url: s.booking_url ?? null,
      active: true,
    }));

    const insertedCalendarRows: Array<Record<string, unknown>> = [];
    const tomorrow = new Date(Date.now() + 86_400_000);
    const busyStart = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 9, 0)).toISOString(); // 10:00 Tunis
    const busyEnd = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 10, 0)).toISOString();  // 11:00 Tunis

    const makeSupabase = (existingBusy: CalendarEventRow[]) => ({
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      storage: { from: vi.fn(() => ({ download: vi.fn() })) },
      from: vi.fn((table: string) => {
        if (table === "pro_profiles") {
          return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: profile, error: null }) })) })) };
        }
        if (table === "pro_services") {
          return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: services, error: null }) })) })) })) };
        }
        if (table === "workspace_calendar_events") {
          return {
            select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: existingBusy, error: null }) })) })),
            insert: vi.fn((row: Record<string, unknown>) => {
              const created = { id: "cal-auto-1", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row };
              insertedCalendarRows.push(created);
              return { select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: created, error: null }) })) };
            }),
          };
        }
        if (table === "workspace_calendar_connections") {
          return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) };
        }
        if (table === "merchants") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { name: profile.display_name, pro_category: "doctor", reply_language: "derja", ai_controls: { calendarAutoBook: "tentative" } },
                  error: null,
                }),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              lt: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })) })),
              order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
          insert: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "row-1" }, error: null }) })) })),
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })),
        };
      }),
    });

    const conv: ProConversationRow = {
      id: "conv-cal-open",
      merchant_id: "m-cal-pro",
      customer_id: "cust-1",
      slots: {},
      negotiation: null,
      ai_paused: false,
      updated_at: "2026-11-20T08:00:00.000Z",
    };

    // Case 1: Open slot -> auto-books as tentative in 1 Gemini call
    sparkJsonMock.mockResolvedValue({
      intent: "service_inquiry",
      matchedServiceIndex: 0,
      clientName: "Youssef Ben Ali",
      clientPhone: "+21655123456",
      requestedDate: "ghodwa 14h",
      locationOrVenue: null,
      scopeSummary: "Consultation au Cabinet",
      deliverablesRequested: null,
      proposedBudgetMillimes: null,
      asksDiscountOrGifted: false,
      flags: { isMedicalEmergency: false, asksMedicalDiagnosisOrPrescription: false, insultOrAngry: false, wantsHuman: false, isHighValueOpportunity: false },
      replyText: "Mrigel Youssef! Sajaltlek rendez-vous ghodwa 14h fel cabinet b 80DT w taw nakkedhoulek.",
    });

    const msgOpen: ProMessageRow[] = [
      { id: "m1", kind: "text", body: "Ahla docteur, esmi Youssef Ben Ali 55123456 n7eb consultation ghodwa 14h", media_path: null, created_at: "2026-11-20T09:00:00.000Z" },
    ];
    await runProTurn("conv-cal-open", { supabase: makeSupabase([]) as never, conversation: conv, messages: msgOpen, proCategory: "doctor" });
    expect(insertedCalendarRows).toHaveLength(1);
    expect(insertedCalendarRows[0]!.status).toBe("tentative");
    expect(insertedCalendarRows[0]!.source).toBe("ai_dm");
    expect(insertedCalendarRows[0]!.client_name).toBe("Youssef Ben Ali");

    // Case 2: Busy slot conflict -> informs Gemini via CONFLICT hint and does NOT double-book
    sparkJsonMock.mockReset();
    sparkJsonMock.mockResolvedValue({
      intent: "service_inquiry",
      matchedServiceIndex: 0,
      clientName: "Sami",
      clientPhone: "+21622333444",
      requestedDate: "ghodwa 10h",
      locationOrVenue: null,
      scopeSummary: "Consultation au Cabinet",
      deliverablesRequested: null,
      proposedBudgetMillimes: null,
      asksDiscountOrGifted: false,
      flags: { isMedicalEmergency: false, asksMedicalDiagnosisOrPrescription: false, insultOrAngry: false, wantsHuman: false, isHighValueOpportunity: false },
      replyText: "Ahla Sami! Ghodwa 10h deja mahjouz, t7eb njarbou 11h30 walla 14h?",
    });

    const busyEvent: CalendarEventRow = {
      id: "busy-1",
      merchant_id: "m-cal-pro",
      title: "Existing Surgery (Google)",
      description: "",
      start_at: busyStart,
      end_at: busyEnd,
      all_day: false,
      timezone: "Africa/Tunis",
      location: "",
      event_type: "external_google",
      status: "confirmed",
      source: "google",
      conversation_id: null,
      inquiry_id: null,
      client_name: null,
      client_phone: null,
      google_event_id: "g-busy",
      google_calendar_id: "primary",
      google_etag: null,
      last_synced_at: null,
      created_at: busyStart,
      updated_at: busyStart,
    };

    const msgBusy: ProMessageRow[] = [
      { id: "m2", kind: "text", body: "Esmi Sami 22333444 n7eb consultation ghodwa 10h", media_path: null, created_at: "2026-11-20T09:05:00.000Z" },
    ];
    await runProTurn("conv-cal-busy", {
      supabase: makeSupabase([busyEvent]) as never,
      conversation: { ...conv, id: "conv-cal-busy" },
      messages: msgBusy,
      proCategory: "doctor",
    });

    const userPrompt = (sparkJsonMock.mock.calls[0]![0] as { user: string }).user;
    expect(userPrompt).toContain("CONFLICT:");
    expect(insertedCalendarRows).toHaveLength(1); // still 1 — did NOT double-book!
  });

  it("forwards anyLanguage=true to Gemini native audio transcription for voice context input", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.AI_MODE = "live";
    resetEnvCache();
    geminiTranscribeMock.mockResolvedValue("Cerrado los domingos, entregas gratis en Túnez.");

    const text = await transcribeWithGeminiAudio({
      wav: Buffer.from("RIFF0000WAVEfmt test-audio-bytes"),
      mimeType: "audio/wav",
      anyLanguage: true,
    });
    expect(text).toBe("Cerrado los domingos, entregas gratis en Túnez.");
    expect(geminiTranscribeMock).toHaveBeenCalledWith(
      expect.objectContaining({ anyLanguage: true, mimeType: "audio/wav" }),
    );
  });
});
