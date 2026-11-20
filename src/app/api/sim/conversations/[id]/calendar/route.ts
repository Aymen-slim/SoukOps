import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CALENDAR_EVENT_STATUSES,
  CALENDAR_EVENT_TYPES,
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  toPublicConnectionStatus,
  updateCalendarEvent,
} from "@/lib/calendar/calendar-store";
import { findCalendarConflicts } from "@/lib/calendar/date-parser";
import { googleCalendarOAuthConfigured, googleCalendarRedirectUri } from "@/lib/calendar/google-calendar";
import { loadWorkspaceAiControls } from "@/lib/context/ai-controls";
import { parseUuid } from "@/lib/dashboard/guard";
import { simulatorGuard } from "@/lib/security/simulatorGuard";
import { createAdminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional(),
  start_at: z.string().refine((v) => Number.isFinite(Date.parse(v)), "Invalid start date/time."),
  end_at: z.string().refine((v) => Number.isFinite(Date.parse(v)), "Invalid end date/time."),
  all_day: z.boolean().optional(),
  location: z.string().trim().max(240).optional(),
  event_type: z.enum(CALENDAR_EVENT_TYPES).optional(),
  status: z.enum(CALENDAR_EVENT_STATUSES).optional(),
  client_name: z.string().trim().max(120).nullable().optional(),
  client_phone: z.string().trim().max(40).nullable().optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  start_at: z.string().refine((v) => Number.isFinite(Date.parse(v))).optional(),
  end_at: z.string().refine((v) => Number.isFinite(Date.parse(v))).optional(),
  all_day: z.boolean().optional(),
  location: z.string().trim().max(240).optional(),
  event_type: z.enum(CALENDAR_EVENT_TYPES).optional(),
  status: z.enum(CALENDAR_EVENT_STATUSES).optional(),
});

async function resolveConversationMerchant(conversationId: string) {
  if (!parseUuid(conversationId)) return null;
  const supabase = createAdminClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, merchant_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv?.merchant_id) return null;
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id, workspace_mode")
    .eq("id", String(conv.merchant_id))
    .maybeSingle();
  return {
    supabase,
    merchantId: String(conv.merchant_id),
    workspaceMode: (merchant as { workspace_mode?: string } | null)?.workspace_mode === "pro" ? ("pro" as const) : ("ecommerce" as const),
  };
}

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/sim/conversations/[id]/calendar">,
) {
  const blocked = simulatorGuard(request, "sim-calendar-get", 90);
  if (blocked) return blocked;
  const { id } = await ctx.params;
  const resolved = await resolveConversationMerchant(id);
  if (!resolved) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const [events, controls] = await Promise.all([
    listCalendarEvents(resolved.supabase, resolved.merchantId, { includeCancelled: false }),
    loadWorkspaceAiControls(resolved.supabase, resolved.merchantId),
  ]);

  return NextResponse.json({
    events,
    workspaceMode: resolved.workspaceMode,
    calendarAutoBook: controls.calendarAutoBook,
    google: toPublicConnectionStatus(null, googleCalendarOAuthConfigured(), googleCalendarRedirectUri()),
  });
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/sim/conversations/[id]/calendar">,
) {
  const blocked = simulatorGuard(request, "sim-calendar-post", 60);
  if (blocked) return blocked;
  const { id } = await ctx.params;
  const resolved = await resolveConversationMerchant(id);
  if (!resolved) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid event." }, { status: 400 });
  }
  const v = parsed.data;
  if (Date.parse(v.end_at) < Date.parse(v.start_at)) {
    return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
  }

  const existing = await listCalendarEvents(resolved.supabase, resolved.merchantId, { includeCancelled: false });
  const conflicts = findCalendarConflicts(v.start_at, v.end_at, existing);
  const event = await createCalendarEvent(resolved.supabase, resolved.merchantId, {
    ...v,
    start_at: new Date(v.start_at).toISOString(),
    end_at: new Date(v.end_at).toISOString(),
    source: "manual",
  });
  return NextResponse.json({ event, conflicts }, { status: 201 });
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/sim/conversations/[id]/calendar">,
) {
  const blocked = simulatorGuard(request, "sim-calendar-patch", 60);
  if (blocked) return blocked;
  const { id } = await ctx.params;
  const resolved = await resolveConversationMerchant(id);
  if (!resolved) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid update." }, { status: 400 });
  }

  const event = await updateCalendarEvent(resolved.supabase, resolved.merchantId, {
    ...parsed.data,
    start_at: parsed.data.start_at ? new Date(parsed.data.start_at).toISOString() : undefined,
    end_at: parsed.data.end_at ? new Date(parsed.data.end_at).toISOString() : undefined,
  });
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  return NextResponse.json({ event });
}

export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/sim/conversations/[id]/calendar">,
) {
  const blocked = simulatorGuard(request, "sim-calendar-delete", 60);
  if (blocked) return blocked;
  const { id } = await ctx.params;
  const resolved = await resolveConversationMerchant(id);
  if (!resolved) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const url = new URL(request.url);
  const eventId = url.searchParams.get("id") ?? "";
  if (!parseUuid(eventId)) {
    return NextResponse.json({ error: "Valid event id required." }, { status: 400 });
  }
  await deleteCalendarEvent(resolved.supabase, resolved.merchantId, eventId);
  return NextResponse.json({ ok: true, id: eventId });
}
