import { randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ParcelFields } from "./types";
import { renderWaybillPdf, waybillPrintUrl } from "./waybill";

type Admin = ReturnType<typeof createAdminClient>;

let lastEtatAt = 0;

/** Server-side gate: a second /etat inside the same second is refused. */
export function takeEtatSlot(now = Date.now()): boolean {
  if (now - lastEtatAt < 1000) return false;
  lastEtatAt = now;
  return true;
}

export function resetEtatSlot(): void {
  lastEtatAt = 0;
}

function newBarcode(): string {
  return `FD${String(randomInt(0, 10_000_000_000)).padStart(10, "0")}`;
}

export async function createFdParcel(
  supabase: Admin,
  parcel: ParcelFields,
): Promise<{ barcode: string; printUrl: string; waybillPath: string }> {
  let lastError = "create failed";
  for (let attempt = 0; attempt < 2; attempt++) {
    const barcode = newBarcode();
    const bytes = await renderWaybillPdf(parcel, barcode);
    const waybillPath = `${barcode}.pdf`;
    const { error: uploadError } = await supabase.storage.from("waybills").upload(waybillPath, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (uploadError) throw new Error(`waybill upload failed: ${uploadError.message}`);

    const { error } = await supabase.from("fd_clone_parcels").insert({
      order_id: parcel.orderId,
      fields: parcel,
      state: 0,
      barcode,
    });
    if (!error) return { barcode, printUrl: waybillPrintUrl(barcode), waybillPath };
    lastError = error.message;
  }
  throw new Error(lastError);
}

export async function readFdEtat(supabase: Admin, barcode: string): Promise<{ state: number } | null> {
  const { data } = await supabase.from("fd_clone_parcels").select("state").eq("barcode", barcode).maybeSingle();
  if (!data) return null;
  return { state: data.state as number };
}

export async function readFdParcel(supabase: Admin, barcode: string) {
  const { data } = await supabase
    .from("fd_clone_parcels")
    .select("barcode, fields, state, order_id, created_at")
    .eq("barcode", barcode)
    .maybeSingle();
  return data;
}
