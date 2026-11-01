import { NextResponse } from "next/server";
import { z } from "zod";
import { requestCanUseFd } from "@/lib/couriers/cloneSession";
import { readFdParcel, setFdParcelState } from "@/lib/couriers/fdMock";
import { FD_STATES } from "@/lib/couriers/types";
import { createAdminClient } from "@/lib/supabase/admin";

const barcodeSchema = z.string().regex(/^FD\d{10}$/);
const stateBodySchema = z.object({ state: z.number().int().refine((s) => (FD_STATES as readonly number[]).includes(s), "unknown FD state") });

export async function GET(_request: Request, ctx: RouteContext<"/api/fd-mock/v2/parcels/[barcode]">) {
  const { barcode } = await ctx.params;
  if (!barcodeSchema.safeParse(barcode).success) {
    return NextResponse.json({ error: "invalid barcode" }, { status: 400 });
  }
  const row = await readFdParcel(createAdminClient(), barcode);
  if (!row) return NextResponse.json({ error: "parcel not found" }, { status: 404 });
  return NextResponse.json({
    barcode: row.barcode,
    state: row.state,
    fields: row.fields,
    printUrl: `/api/fd-mock/v2/waybill/${barcode}`,
  });
}

/** Demo driver: move a clone parcel to a new FD state so status sync can be staged. */
export async function POST(request: Request, ctx: RouteContext<"/api/fd-mock/v2/parcels/[barcode]">) {
  if (!(await requestCanUseFd(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { barcode } = await ctx.params;
  if (!barcodeSchema.safeParse(barcode).success) {
    return NextResponse.json({ error: "invalid barcode" }, { status: 400 });
  }
  const parsed = stateBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "unknown FD state" }, { status: 400 });
  const updated = await setFdParcelState(createAdminClient(), barcode, parsed.data.state);
  if (!updated) return NextResponse.json({ error: "parcel not found" }, { status: 404 });
  return NextResponse.json({ barcode, state: parsed.data.state });
}
