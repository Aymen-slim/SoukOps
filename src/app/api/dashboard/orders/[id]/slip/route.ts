import { loadDeliverySlip, requireSlipOrder, slipPdfResponse } from "@/lib/dashboard/slip-load";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const found = await requireSlipOrder(id);
  if ("error" in found) return found.error;
  const loaded = await loadDeliverySlip(found.gate.supabase, found.gate.merchant.id, id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  return slipPdfResponse(loaded.slip);
}
