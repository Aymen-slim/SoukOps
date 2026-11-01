/**
 * Batch First Delivery status sync for the demo merchant: polls /etat
 * (paced at 1 req/s by the adapter) and folds states into orders,
 * shipments.fd_state and risk_events. Run: npm run sync:fd
 */
import "./load-env";
import { syncMerchantShipments } from "../src/lib/couriers/statusSync";
import { hasAdminConfig } from "../src/lib/supabase/admin";

async function main(): Promise<void> {
  if (!hasAdminConfig()) {
    console.log("Sync needs Supabase URL + SUPABASE_SECRET_KEY in .env.local.");
    process.exit(0);
  }
  const { synced, failures } = await syncMerchantShipments();
  for (const row of synced) {
    if (!row.ok) continue;
    console.log(`${row.barcode}: FD ${row.fdState} -> ${row.orderStatus}${row.changed ? "" : " (inchangé)"}${row.riskEventCreated ? " + risk event" : ""}`);
  }
  for (const failure of failures) console.log(`order ${failure.orderId}: ${failure.reason}`);
  console.log(`Synced ${synced.length}, failures ${failures.length}.`);
}

void main();
