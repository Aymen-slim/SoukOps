import { NextResponse } from "next/server";
import { z } from "zod";
import { readFdParcel } from "@/lib/couriers/fdMock";
import { createAdminClient } from "@/lib/supabase/admin";

const barcodeSchema = z.string().regex(/^FD\d{10}$/);

export async function GET(_request: Request, ctx: RouteContext<"/api/fd-mock/v2/parcels/[barcode]">) {
  const { barcode } = await ctx.params;
  if (!barcodeSchema.safeParse(barcode).success) {
    return NextResponse.json({ error: "code-barres invalide" }, { status: 400 });
  }
  const row = await readFdParcel(createAdminClient(), barcode);
  if (!row) return NextResponse.json({ error: "colis introuvable" }, { status: 404 });
  return NextResponse.json({
    barcode: row.barcode,
    state: row.state,
    fields: row.fields,
    printUrl: `/api/fd-mock/v2/waybill/${barcode}`,
  });
}
