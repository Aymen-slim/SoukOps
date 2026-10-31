import { normalizeTunisianPhone } from "@/lib/domain/derja";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateParcel, type ParcelFields } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

export type LoadParcelResult =
  | {
      ok: true;
      parcel: ParcelFields;
      conversationId: string | null;
      merchantId: string;
      totalMillimes: number;
    }
  | { ok: false; reason: string };

/** Loads the order, confirmed pin, customer and first line, then zod-validates the parcel. */
export async function loadParcel(supabase: Admin, orderId: string): Promise<LoadParcelResult> {
  const { data: order } = await supabase
    .from("orders")
    .select("id, merchant_id, customer_id, conversation_id, address_id, total_millimes")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, reason: "Commande introuvable." };

  const [{ data: address }, { data: customer }, { data: item }] = await Promise.all([
    order.address_id
      ? supabase
          .from("addresses")
          .select("governorate, delegation, locality_id, landmark, lat, lng, floor, driver_note, confirmed_at")
          .eq("id", order.address_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    order.customer_id
      ? supabase
          .from("customers")
          .select("name, phone")
          .eq("id", order.customer_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("order_items").select("name_snapshot").eq("order_id", orderId).limit(1).maybeSingle(),
  ]);

  if (!address?.confirmed_at || address.lat == null || address.lng == null) {
    return { ok: false, reason: "Pin GPS non confirmé." };
  }
  if (address.locality_id == null) {
    return { ok: false, reason: "locality_id manquant : obligatoire pour First Delivery depuis juin 2026." };
  }

  const phone = normalizeTunisianPhone(String(customer?.phone ?? ""));
  if (!phone) return { ok: false, reason: "Téléphone invalide." };

  const validated = validateParcel({
    clientName: ((customer?.name as string | null) ?? "").trim() || "Client",
    phone,
    governorate: (address.governorate as string | null) ?? "",
    delegation: (address.delegation as string | null) ?? null,
    localityId: address.locality_id as number,
    landmark: (address.landmark as string | null) ?? "",
    floor: (address.floor as string | null) ?? null,
    driverNote: (address.driver_note as string | null) ?? null,
    lat: address.lat as number,
    lng: address.lng as number,
    prixMillimes: order.total_millimes as number,
    designation: (item?.name_snapshot as string | null) ?? "Commande",
    orderId: order.id as string,
  });
  if (!validated.ok) return validated;

  return {
    ok: true,
    parcel: validated.parcel,
    conversationId: (order.conversation_id as string | null) ?? null,
    merchantId: order.merchant_id as string,
    totalMillimes: order.total_millimes as number,
  };
}
