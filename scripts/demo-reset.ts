/**
 * Clears demo traffic for the demo merchant (conversations, orders, jobs,
 * shipments, clone parcels, unmatched demands) while preserving catalog,
 * landmarks, fees and seeded persona histories.
 * Run: npm run demo:reset   (then npm run seed:day5 to restore persona fixtures)
 */
import "./load-env";
import { resetDemoData } from "../src/lib/demo/reset";
import { getDemoMerchant } from "../src/lib/dashboard/merchant";
import { createAdminClient, hasAdminConfig } from "../src/lib/supabase/admin";

async function main(): Promise<void> {
  if (!hasAdminConfig()) {
    console.log("Reset needs Supabase URL + SUPABASE_SECRET_KEY in .env.local.");
    process.exit(0);
  }
  const supabase = createAdminClient();
  const merchant = await getDemoMerchant(supabase);
  if (!merchant) throw new Error("no merchant seeded (run npm run seed:catalog first)");
  const counts = await resetDemoData(supabase, merchant.id);
  console.log(`Demo reset for merchant ${merchant.id}:`, counts);
  console.log("Next: npm run seed:day5");
}

void main();
