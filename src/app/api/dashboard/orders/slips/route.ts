import { NextResponse } from "next/server";
import { z } from "zod";
import { mergeSlipPdfs, renderDeliverySlip } from "@/lib/couriers/slip";
import { loadDeliverySlip } from "@/lib/dashboard/slip-load";
import { requireMerchant } from "@/lib/dashboard/guard";

export async function GET(request: Request) {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const ids = [...new Set((new URL(request.url).searchParams.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean))];
  const parsed = z.array(z.string().uuid()).min(1).max(20).safeParse(ids);
  if (!parsed.success) return NextResponse.json({ error: "Choose up to 20 orders." }, { status: 400 });

  const slips = [];
  for (const id of parsed.data) {
    const loaded = await loadDeliverySlip(gate.supabase, gate.merchant.id, id);
    if (loaded.ok) slips.push(loaded.slip);
  }
  if (slips.length === 0) {
    return NextResponse.json({ error: "Confirm the buyer pin before printing a courier slip." }, { status: 409 });
  }
  const pages = await Promise.all(slips.map((slip) => renderDeliverySlip(slip)));
  const pdf = slips.length === 1 ? pages[0] : await mergeSlipPdfs(pages);
  const bytes = Buffer.from(pdf);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="courier-slips.pdf"',
    },
  });
}
