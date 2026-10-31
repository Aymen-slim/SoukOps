import { normalizeTunisianPhone } from "@/lib/domain/derja";
import { PARCEL_FIELD_KEYS, type ParcelFields } from "./types";

/** String written into the clone form. Empty optional fields stay empty. */
export function formValue(parcel: ParcelFields, key: keyof ParcelFields): string {
  const value = parcel[key];
  if (value === null || value === undefined) return "";
  if (key === "lat" || key === "lng") return Number(value).toFixed(6);
  return String(value);
}

function normalizeField(key: keyof ParcelFields, raw: string): string {
  const trimmed = raw.trim();
  if (key === "phone") return normalizeTunisianPhone(trimmed) ?? trimmed;
  if (key === "localityId" || key === "prixMillimes") {
    if (!trimmed) return "";
    const n = Number(trimmed);
    return Number.isInteger(n) ? String(n) : trimmed;
  }
  if (key === "lat" || key === "lng") {
    if (!trimmed) return "";
    const n = Number(trimmed);
    return Number.isFinite(n) ? n.toFixed(6) : trimmed;
  }
  return trimmed;
}

/**
 * Field-by-field diff after the portal is filled. Any difference fails the job.
 * Phone, coordinates and integers are normalized to the form we typed, not fuzzy-matched.
 */
export function diffParcel(expected: ParcelFields, actual: Record<string, string>): string[] {
  const diffs: string[] = [];
  for (const key of PARCEL_FIELD_KEYS) {
    const want = normalizeField(key, formValue(expected, key));
    const got = normalizeField(key, actual[key] ?? "");
    if (want !== got) diffs.push(`${key}: attendu « ${want || "∅"} », lu « ${got || "∅"} »`);
  }
  return diffs;
}
