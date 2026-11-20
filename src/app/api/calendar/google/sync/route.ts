import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getCalendarConnection,
  saveCalendarConnection,
  toPublicConnectionStatus,
} from "@/lib/calendar/calendar-store";
import {
  getValidGoogleAccessToken,
  googleCalendarOAuthConfigured,
  googleCalendarRedirectUri,
  listGoogleCalendars,
  syncWorkspaceWithGoogleCalendar,
} from "@/lib/calendar/google-calendar";
import { requireMerchant } from "@/lib/dashboard/guard";

const syncBodySchema = z.object({
  direction: z.enum(["pull", "push", "both"]).optional(),
  calendarId: z.string().trim().min(1).max(200).optional(),
  calendarName: z.string().trim().min(1).max(200).optional(),
  autoPush: z.boolean().optional(),
});

export async function GET() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;

  const auth = await getValidGoogleAccessToken(gate.supabase, gate.merchant.id).catch(() => null);
  if (!auth) {
    return NextResponse.json({ calendars: [], connected: false });
  }
  try {
    const calendars = await listGoogleCalendars(auth.accessToken);
    return NextResponse.json({ calendars, connected: true, activeCalendarId: auth.calendarId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not list Google calendars." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;

  const parsed = syncBodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sync request." }, { status: 400 });
  }

  const conn = await getCalendarConnection(gate.supabase, gate.merchant.id);
  if (!conn) {
    return NextResponse.json({ error: "Google Calendar is not connected." }, { status: 400 });
  }

  try {
    if (
      parsed.data.calendarId !== undefined ||
      parsed.data.calendarName !== undefined ||
      parsed.data.autoPush !== undefined
    ) {
      await saveCalendarConnection(gate.supabase, gate.merchant.id, {
        access_token: conn.access_token,
        calendar_id: parsed.data.calendarId ?? conn.calendar_id,
        calendar_name: parsed.data.calendarName ?? conn.calendar_name,
        auto_push: parsed.data.autoPush ?? conn.auto_push,
      });
    }

    const result = parsed.data.direction
      ? await syncWorkspaceWithGoogleCalendar(gate.supabase, gate.merchant.id, parsed.data.direction)
      : { pulled: 0, pushed: 0, errors: [] };

    const refreshedConn = await getCalendarConnection(gate.supabase, gate.merchant.id);
    return NextResponse.json({
      ...result,
      google: toPublicConnectionStatus(
        refreshedConn,
        googleCalendarOAuthConfigured(),
        googleCalendarRedirectUri(),
      ),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Google Calendar sync failed." },
      { status: 500 },
    );
  }
}
