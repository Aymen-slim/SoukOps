import { NextResponse } from "next/server";
import { deleteCalendarConnection } from "@/lib/calendar/calendar-store";
import { requireMerchant } from "@/lib/dashboard/guard";

export async function POST() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  try {
    await deleteCalendarConnection(gate.supabase, gate.merchant.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not disconnect Google Calendar." },
      { status: 500 },
    );
  }
}
