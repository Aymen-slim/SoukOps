/**
 * Day 5 demo fixtures for the demo merchant: delivery fees + payment link,
 * and seeded buyer histories (risk_events) for the simulator personas —
 * bad buyer = returns/cancellations (red), returning = delivered (green),
 * new = no history. Idempotent: fixture rows carry detail.seededBy=day5
 * and are replaced on re-runs. Run: npm run seed:day5
 */
import "./load-env";
import { createAdminClient, hasAdminConfig } from "../src/lib/supabase/admin";
import { PERSONAS } from "../src/lib/sim/personas";

const FEES: Array<{ governorate: string; feeMillimes: number; localityId: number }> = [
  { governorate: "Tunis", feeMillimes: 7_000, localityId: 101 },
  { governorate: "Ariana", feeMillimes: 8_000, localityId: 102 },
  { governorate: "Ben Arous", feeMillimes: 8_000, localityId: 103 },
  { governorate: "Manouba", feeMillimes: 9_000, localityId: 104 },
];

const HISTORIES: Record<string, string[]> = {
  new: [],
  returning: ["delivered", "delivered", "delivered"],
  bad: ["returned", "returned", "returned", "cancelled"],
};

async function main(): Promise<void> {
  if (!hasAdminConfig()) {
    console.log("Seeding needs Supabase URL + SUPABASE_SECRET_KEY in .env.local.");
    process.exit(0);
  }
  const supabase = createAdminClient();
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (merchantError || !merchant) throw new Error("no merchant seeded (run npm run seed:catalog first)");
  const merchantId = merchant.id as string;

  const { error: merchantUpdateError } = await supabase
    .from("merchants")
    .update({ payment_link: "https://pay.wassalha-demo.tn/flouci", free_delivery_threshold_millimes: 300_000 })
    .eq("id", merchantId);
  if (merchantUpdateError) throw new Error(`merchant update failed: ${merchantUpdateError.message}`);

  const { error: feeClearError } = await supabase.from("delivery_fees").delete().eq("merchant_id", merchantId);
  if (feeClearError) throw new Error(`fee clear failed: ${feeClearError.message}`);
  const { error: feeError } = await supabase.from("delivery_fees").insert(
    FEES.map((f) => ({
      merchant_id: merchantId,
      governorate: f.governorate,
      delegation: null,
      locality_id: f.localityId,
      fee_millimes: f.feeMillimes,
    })),
  );
  if (feeError) throw new Error(`fee insert failed: ${feeError.message}`);

  for (const persona of PERSONAS) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("phone", persona.phone)
      .maybeSingle();
    let customerId = existing?.id as string | undefined;
    if (!customerId) {
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .insert({ merchant_id: merchantId, name: persona.customerName, phone: persona.phone })
        .select("id")
        .single();
      if (customerError || !customer) throw new Error(`customer insert failed: ${customerError?.message}`);
      customerId = customer.id as string;
    }
    await supabase.from("risk_events").delete().eq("customer_id", customerId).contains("detail", { seededBy: "day5" });
    const kinds = HISTORIES[persona.id] ?? [];
    if (kinds.length) {
      const { error: riskError } = await supabase.from("risk_events").insert(
        kinds.map((kind) => ({ merchant_id: merchantId, customer_id: customerId, kind, detail: { seededBy: "day5" } })),
      );
      if (riskError) throw new Error(`risk seed failed for ${persona.id}: ${riskError.message}`);
    }
    console.log(`persona ${persona.id}: ${kinds.length} history event(s)`);
  }
  console.log(`Seeded fees (${FEES.length}), payment link, and buyer histories for merchant ${merchantId}.`);
}

void main();
