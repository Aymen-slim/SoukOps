import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CALENDAR_EVENT_SOURCES,
  CALENDAR_EVENT_STATUSES,
  CALENDAR_EVENT_TYPES,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarConnection,
  listCalendarEvents,
  toPublicConnectionStatus,
  updateCalendarEvent,
} from "@/lib/calendar/calendar-store";
import { findCalendarConflicts } from "@/lib/calendar/date-parser";
import {
  deleteEventFromGoogleCalendar,
  googleCalendarOAuthConfigured,
  googleCalendarRedirectUri,
  pushEventToGoogleCalendar,
} from "@/lib/calendar/google-calendar";
import { loadWorkspaceAiControls } from "@/lib/context/ai-controls";
import { parseUuid, requireMerchant } from "@/lib/dashboard/guard";

const createEventSchema = z.object({
  title: z.string().trim().min(2, "Event title is required.").max(160),
  description: z.string().trim().max(2000).optional(),
  start_at: z.string().refine((v) => Number.isFinite(Date.parse(v)), "Invalid start date/time."),
  end_at: z.string().refine((v) => Number.isFinite(Date.parse(v)), "Invalid end date/time."),
  all_day: z.boolean().optional(),
  location: z.string().trim().max(240).optional(),
  event_type: z.enum(CALENDAR_EVENT_TYPES).optional(),
  status: z.enum(CALENDAR_EVENT_STATUSES).optional(),
  source: z.enum(CALENDAR_EVENT_SOURCES).optional(),
  conversation_id: z.string().uuid().nullable().optional(),
  inquiry_id: z.string().uuid().nullable().optional(),
  client_name: z.string().trim().max(120).nullable().optional(),
  client_phone: z.string().trim().max(40).nullable().optional(),
  pushToGoogle: z.boolean().optional(),
});

const patchEventSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  start_at: z.string().refine((v) => Number.isFinite(Date.parse(v)), "Invalid start date/time.").optional(),
  end_at: z.string().refine((v) => Number.isFinite(Date.parse(v)), "Invalid end date/time.").optional(),
  all_day: z.boolean().optional(),
  location: z.string().trim().max(240).optional(),
  event_type: z.enum(CALENDAR_EVENT_TYPES).optional(),
  status: z.enum(CALENDAR_EVENT_STATUSES).optional(),
  client_name: z.string().trim().max(120).nullable().optional(),
  client_phone: z.string().trim().max(40).nullable().optional(),
  pushToGoogle: z.boolean().optional(),
});

export async function GET(request: Request) {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const url = new URL(request.url);
  const fromIso = url.searchParams.get("from") ?? undefined;
  const toIso = url.searchParams.get("to") ?? undefined;
  const includeCancelled = url.searchParams.get("includeCancelled") === "true";

  const [events, conn, controls] = await Promise.all([
    listCalendarEvents(supabase, merchant.id, { fromIso, toIso, includeCancelled }),
    getCalendarConnection(supabase, merchant.id),
    loadWorkspaceAiControls(supabase, merchant.id),
  ]);

  return NextResponse.json({
    events,
    workspaceMode: merchant.workspace_mode,
    calendarAutoBook: controls.calendarAutoBook,
    google: toPublicConnectionStatus(
      conn,
      googleCalendarOAuthConfigured(),
      googleCalendarRedirectUri(),
    ),
  });
}

export async function POST(request: Request) {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const parsed = createEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid calendar event." },
      { status: 400 },
    );
  }
  const v = parsed.data;
  if (Date.parse(v.end_at) < Date.parse(v.start_at)) {
    return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
  }

  try {
    const existing = await listCalendarEvents(supabase, merchant.id, { includeCancelled: false });
    const conflicts = findCalendarConflicts(v.start_at, v.end_at, existing);

    let event = await createCalendarEvent(supabase, merchant.id, {
      title: v.title,
      description: v.description,
      start_at: new Date(v.start_at).toISOString(),
      end_at: new Date(v.end_at).toISOString(),
      all_day: v.all_day,
      location: v.location,
      event_type: v.event_type,
      status: v.status,
      source: v.source ?? "manual",
      conversation_id: v.conversation_id ?? null,
      inquiry_id: v.inquiry_id ?? null,
      client_name: v.client_name ?? null,
      client_phone: v.client_phone ?? null,
    });

    let googleSyncError: string | null = null;
    const conn = await getCalendarConnection(supabase, merchant.id);
    const shouldPush = conn && (v.pushToGoogle ?? conn.auto_push);
    if (shouldPush) {
      try {
        event = await pushEventToGoogleCalendar(supabase, merchant.id, event);
      } catch (err) {
        googleSyncError = err instanceof Error ? err.message : "Google Calendar push failed.";
      }
    }

    return NextResponse.json(
      {
        event,
        conflicts: conflicts.map((c) => ({ id: c.id, title: c.title, start_at: c.start_at, end_at: c.end_at })),
        googleSyncError,
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create calendar event." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const parsed = patchEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid event update." },
      { status: 400 },
    );
  }
  const v = parsed.data;
  if (v.start_at && v.end_at && Date.parse(v.end_at) < Date.parse(v.start_at)) {
    return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
  }

  try {
    let event = await updateCalendarEvent(supabase, merchant.id, {
      id: v.id,
      title: v.title,
      description: v.description,
      start_at: v.start_at ? new Date(v.start_at).toISOString() : undefined,
      end_at: v.end_at ? new Date(v.end_at).toISOString() : undefined,
      all_day: v.all_day,
      location: v.location,
      event_type: v.event_type,
      status: v.status,
      client_name: v.client_name,
      client_phone: v.client_phone,
    });
    if (!event) return NextResponse.json({ error: "Calendar event not found." }, { status: 404 });

    let googleSyncError: string | null = null;
    const conn = await getCalendarConnection(supabase, merchant.id);
    const shouldPush = conn && (v.pushToGoogle === true || (conn.auto_push && Boolean(event.google_event_id)));
    if (shouldPush) {
      try {
        event = await pushEventToGoogleCalendar(supabase, merchant.id, event);
      } catch (err) {
        googleSyncError = err instanceof Error ? err.message : "Google Calendar update failed.";
      }
    }

    return NextResponse.json({ event, googleSyncError });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update calendar event." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!parseUuid(id)) {
    return NextResponse.json({ error: "Valid calendar event id required." }, { status: 400 });
  }

  try {
    const deleted = await deleteCalendarEvent(supabase, merchant.id, id);
    if (deleted?.google_event_id) {
      await deleteEventFromGoogleCalendar(supabase, merchant.id, deleted).catch(() => false);
    }
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete calendar event." },
      { status: 500 },
    );
  }
}
