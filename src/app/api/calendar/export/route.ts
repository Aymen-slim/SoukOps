import { NextResponse } from "next/server";
import { listCalendarEvents } from "@/lib/calendar/calendar-store";
import { buildIcsContent } from "@/lib/calendar/date-parser";
import { requireMerchant } from "@/lib/dashboard/guard";

export async function GET() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;

  const events = await listCalendarEvents(gate.supabase, gate.merchant.id, { includeCancelled: false });
  const ics = buildIcsContent(events, `${gate.merchant.name || "Wassalha"} Calendar`);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="wassalha-calendar.ics"',
      "Cache-Control": "no-store",
    },
  });
}
