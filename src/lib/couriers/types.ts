import { z } from "zod";

/** First Delivery state codes from the spec. */
export const FD_STATES = [0, 1, 2, 5, 7, 11, 30, 31, 6] as const;
export type FdState = (typeof FD_STATES)[number];

/** 999 DT in millimes. `prix` includes delivery and must stay inside 0–999 DT. */
export const FD_PRIX_MAX_MILLIMES = 999_000;

export const parcelFieldsSchema = z.object({
  clientName: z.string().trim().min(1).max(120),
  phone: z.string().regex(/^\+216\d{8}$/),
  governorate: z.string().trim().min(1).max(80),
  delegation: z.string().trim().min(1).max(80).nullable(),
  localityId: z.number().int().positive(),
  landmark: z.string().trim().min(1).max(200),
  floor: z.string().trim().max(50).nullable(),
  driverNote: z.string().trim().max(300).nullable(),
  lat: z.number().finite(),
  lng: z.number().finite(),
  prixMillimes: z.number().int().min(0).max(FD_PRIX_MAX_MILLIMES),
  designation: z.string().trim().min(1).max(200),
  orderId: z.string().uuid(),
});

export type ParcelFields = z.infer<typeof parcelFieldsSchema>;

export const PARCEL_FIELD_KEYS = [
  "clientName",
  "phone",
  "governorate",
  "delegation",
  "localityId",
  "landmark",
  "floor",
  "driverNote",
  "lat",
  "lng",
  "prixMillimes",
  "designation",
  "orderId",
] as const satisfies readonly (keyof ParcelFields)[];

export interface CourierJobPayload {
  parcel: ParcelFields;
  conversationId: string | null;
}

export interface JobResult {
  readback?: Record<string, string>;
  diffs?: string[];
  sellerConfirmed?: boolean;
  barcode?: string;
  error?: string;
}

/** DT value First Delivery expects. 112500 millimes -> 112.5 */
export function prixDtFromMillimes(millimes: number): number {
  return millimes / 1000;
}

export function prixWithinFdRange(millimes: number): boolean {
  return Number.isInteger(millimes) && millimes >= 0 && millimes <= FD_PRIX_MAX_MILLIMES;
}

export function isFdState(state: number): state is FdState {
  return (FD_STATES as readonly number[]).includes(state);
}

const FIELD_REASONS: Partial<Record<keyof ParcelFields, string>> = {
  localityId: "locality_id manquant : obligatoire pour First Delivery depuis juin 2026.",
  phone: "Invalid phone number.",
  prixMillimes: "Price out of range: total must be between 0 and 999 DT, delivery included.",
  lat: "GPS pin not confirmed.",
  lng: "GPS pin not confirmed.",
  governorate: "Gouvernorat manquant.",
  landmark: "Missing landmark.",
  clientName: "Nom du client manquant.",
  designation: "Missing designation.",
  orderId: "Commande introuvable.",
};

export function validateParcel(raw: unknown): { ok: true; parcel: ParcelFields } | { ok: false; reason: string } {
  const parsed = parcelFieldsSchema.safeParse(raw);
  if (parsed.success) return { ok: true, parcel: parsed.data };
  const issue = parsed.error.issues[0];
  const key = issue?.path[0];
  if (typeof key === "string" && key in FIELD_REASONS) {
    return { ok: false, reason: FIELD_REASONS[key as keyof ParcelFields] ?? "Incomplete parcel." };
  }
  return { ok: false, reason: "Incomplete parcel." };
}
