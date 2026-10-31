import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const barcodeSchema = z.string().regex(/^FD\d{10}$/);

export async function GET(_request: Request, ctx: RouteContext<"/api/fd-mock/v2/waybill/[barcode]">) {
  const { barcode } = await ctx.params;
  if (!barcodeSchema.safeParse(barcode).success) {
    return NextResponse.json({ error: "code-barres invalide" }, { status: 400 });
  }
  const { data, error } = await createAdminClient().storage.from("waybills").download(`${barcode}.pdf`);
  if (error || !data) return NextResponse.json({ error: "bordereau introuvable" }, { status: 404 });
  const bytes = Buffer.from(await data.arrayBuffer());
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${barcode}.pdf"`,
    },
  });
}
