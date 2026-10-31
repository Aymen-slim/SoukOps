import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { passesPriceFirewall } from "@/lib/domain/firewall";
import { resetEtatSlot, takeEtatSlot } from "@/lib/couriers/fdMock";
import { diffParcel, formValue } from "@/lib/couriers/readback";
import {
  PARCEL_FIELD_KEYS,
  prixDtFromMillimes,
  prixWithinFdRange,
  validateParcel,
  type ParcelFields,
} from "@/lib/couriers/types";
import { buyerWaybillText, renderWaybillPdf } from "@/lib/couriers/waybill";
import { isBlurry } from "@/lib/media/blur";

function sample(overrides: Partial<ParcelFields> = {}): ParcelFields {
  return {
    clientName: "Aymen",
    phone: "+21622123456",
    governorate: "Tunis",
    delegation: null,
    localityId: 101,
    landmark: "Pharmacie de Nuit",
    floor: null,
    driverNote: null,
    lat: 36.8065,
    lng: 10.1815,
    prixMillimes: 112_500,
    designation: "Sweat jaune",
    orderId: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  };
}

describe("parcel validation", () => {
  it("accepts a complete parcel", () => {
    expect(validateParcel(sample()).ok).toBe(true);
  });

  it("rejects a missing locality id", () => {
    const result = validateParcel({ ...sample(), localityId: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/locality_id/);
  });

  it("rejects a price above 999 DT", () => {
    const result = validateParcel({ ...sample(), prixMillimes: 1_000_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/999 DT/);
  });

  it("rejects a phone that is not Tunisian", () => {
    const result = validateParcel({ ...sample(), phone: "12345" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Téléphone/);
  });
});

describe("prix range", () => {
  it("keeps millimes inside 0–999 DT", () => {
    expect(prixDtFromMillimes(112_500)).toBe(112.5);
    expect(prixDtFromMillimes(999_000)).toBe(999);
    expect(prixWithinFdRange(0)).toBe(true);
    expect(prixWithinFdRange(999_000)).toBe(true);
    expect(prixWithinFdRange(999_001)).toBe(false);
    expect(prixWithinFdRange(-1)).toBe(false);
  });
});

describe("read-back", () => {
  it("accepts the form we typed, including a spaced phone", () => {
    const parcel = sample();
    const actual: Record<string, string> = {};
    for (const key of PARCEL_FIELD_KEYS) actual[key] = formValue(parcel, key);
    expect(diffParcel(parcel, actual)).toEqual([]);
    actual.phone = "216 22 123 456";
    expect(diffParcel(parcel, actual)).toEqual([]);
  });

  it("fails when the phone changed", () => {
    const parcel = sample();
    const actual: Record<string, string> = {};
    for (const key of PARCEL_FIELD_KEYS) actual[key] = formValue(parcel, key);
    actual.phone = "+21699888777";
    expect(diffParcel(parcel, actual).some((line) => line.startsWith("phone:"))).toBe(true);
  });
});

describe("waybill", () => {
  it("mentions the barcode and only the stored total", () => {
    const text = buyerWaybillText("FD0000000001", 112_500);
    expect(text).toContain("FD0000000001");
    expect(text).toContain("112,500 DT");
    expect(passesPriceFirewall(text, new Set([112_500]))).toBe(true);
  });

  it("renders a PDF with a GPS QR payload source", async () => {
    const pdf = await renderWaybillPdf(sample(), "FD0000000001");
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(500);
  });
});

describe("etat limiter", () => {
  it("refuses a second call inside one second", () => {
    resetEtatSlot();
    expect(takeEtatSlot(1_000)).toBe(true);
    expect(takeEtatSlot(1_500)).toBe(false);
    expect(takeEtatSlot(2_000)).toBe(true);
    resetEtatSlot();
  });
});

describe("blur", () => {
  it("rejects a flat frame and keeps a high-contrast one", async () => {
    const flat = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 180, g: 180, b: 180 } },
    })
      .png()
      .toBuffer();
    expect(await isBlurry(flat)).toBe(true);

    const raw = Buffer.alloc(64 * 64);
    for (let i = 0; i < raw.length; i++) raw[i] = i % 2 === 0 ? 0 : 255;
    const contrast = await sharp(raw, { raw: { width: 64, height: 64, channels: 1 } }).png().toBuffer();
    expect(await isBlurry(contrast)).toBe(false);
  });
});
