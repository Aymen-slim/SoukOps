import { NextResponse } from "next/server";
import { resetDemoData } from "@/lib/demo/reset";
import { requireMerchant } from "@/lib/dashboard/guard";
import { getServerEnv } from "@/lib/env";

export async function GET() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;
  const { data: beat } = await supabase
    .from("agent_events")
    .select("created_at")
    .eq("kind", "courier.heartbeat")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastHeartbeatAt = (beat?.created_at as string | null) ?? null;
  const workerOnline = Boolean(lastHeartbeatAt && Date.now() - new Date(lastHeartbeatAt).getTime() < 20_000);

  const { data: orders } = await supabase.from("orders").select("id").eq("merchant_id", merchant.id).limit(200);
  const orderIds = (orders ?? []).map((row) => row.id as string);
  let lastShipment: { barcode: string; printUrl: string; createdAt: string } | null = null;
  if (orderIds.length) {
    const { data: shipment } = await supabase
      .from("shipments")
      .select("barcode, created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (shipment?.barcode) {
      lastShipment = {
        barcode: shipment.barcode as string,
        printUrl: `/api/fd-mock/v2/waybill/${shipment.barcode as string}`,
        createdAt: shipment.created_at as string,
      };
    }
  }

  return NextResponse.json({
    courierMode: merchant.courier_mode,
    workerOnline,
    lastHeartbeatAt,
    lastShipment,
    aiMode: getServerEnv().AI_MODE,
    simulatorPublic: getServerEnv().SIMULATOR_PUBLIC !== "false",
    links: {
      simulator: "/simulator",
      courierClone: "/courier-clone/login",
      dashboard: "/dashboard",
    },
  });
}

/** Stage reset: clears demo traffic, preserves catalog/landmarks/fees/persona histories. */
export async function POST() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  try {
    const counts = await resetDemoData(gate.supabase, gate.merchant.id);
    return NextResponse.json({ ok: true, counts });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "reset failed" }, { status: 500 });
  }
}
