import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMerchant } from "@/lib/dashboard/guard";

const patchSchema = z
  .object({
    paymentLink: z.string().trim().max(500).nullable().optional(),
    freeDeliveryThresholdMillimes: z.number().int().nonnegative().nullable().optional(),
    courierMode: z.enum(["mock_api", "browser", "real_api"]).optional(),
  })
  .refine(
    (value) =>
      value.paymentLink !== undefined ||
      value.freeDeliveryThresholdMillimes !== undefined ||
      value.courierMode !== undefined,
  );

export async function GET() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const { data: fees, error } = await gate.supabase
    .from("delivery_fees")
    .select("governorate, delegation, locality_id, fee_millimes")
    .eq("merchant_id", gate.merchant.id)
    .order("governorate", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    paymentLink: gate.merchant.payment_link,
    freeDeliveryThresholdMillimes: gate.merchant.free_delivery_threshold_millimes,
    courierMode: gate.merchant.courier_mode,
    fees: fees ?? [],
  });
}

export async function POST(request: Request) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid settings" }, { status: 400 });
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;

  const update: Record<string, unknown> = {};
  if (parsed.data.paymentLink !== undefined) update.payment_link = parsed.data.paymentLink || null;
  if (parsed.data.freeDeliveryThresholdMillimes !== undefined) {
    update.free_delivery_threshold_millimes = parsed.data.freeDeliveryThresholdMillimes;
  }
  if (parsed.data.courierMode !== undefined) update.courier_mode = parsed.data.courierMode;
  const { error } = await gate.supabase.from("merchants").update(update).eq("id", gate.merchant.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
