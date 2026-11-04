import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  captureOptionAnswer,
  normalizeSellerOptions,
  resolveSizePolicy,
  samPhrase,
} from "@/lib/domain/catalog-options";
import { nextAction, nextDraftAction } from "@/lib/domain/slots";
import { deliverySlipQrPayload, renderDeliverySlip, slipPinError } from "@/lib/couriers/slip";

describe("flexible catalog", () => {
  it("keeps a missing size policy on the clothing path", () => {
    expect(nextAction({ matchedProductId: "p1" })).toBe("need_size");
    expect(nextAction({ matchedProductId: "p1", size: "L" })).toBe("need_name");
  });

  it("skips size for a simple product", () => {
    expect(nextAction({ matchedProductId: "p1", sizePolicy: "none" })).toBe("need_name");
    expect(
      nextDraftAction({
        items: [{ productId: "p1", productName: "Honey", size: null, sizePolicy: "none", quantity: 1 }],
      }),
    ).toBe("need_name");
  });

  it("asks only for the seller option and then moves on", () => {
    const slots: Record<string, unknown> = {
      matchedProductId: "p1",
      sizePolicy: "options",
      optionNames: ["Storage"],
      optionChoices: { Storage: ["128GB", "256GB"] },
      variants: [{ id: "v1", optionValues: { Storage: "128GB" }, stock: 2, priceMillimes: null }],
      selectedOptions: {},
    };
    expect(nextAction(slots)).toBe("need_size");
    captureOptionAnswer(slots, "128GB");
    expect(slots.variantId).toBe("v1");
    expect(nextAction(slots)).toBe("need_name");
  });

  it("builds a variant matrix and rejects a price under the floor", () => {
    const ok = normalizeSellerOptions({
      floorMillimes: 10_000,
      options: [
        { name: "Size", values: ["S", "M"] },
        { name: "Color", values: ["Black", "White"] },
      ],
      variants: [
        { optionValues: { Size: "S", Color: "Black" }, stock: 1, priceMillimes: null },
        { optionValues: { Size: "S", Color: "White" }, stock: 2, priceMillimes: 20_000 },
        { optionValues: { Size: "M", Color: "Black" }, stock: 0, priceMillimes: null },
        { optionValues: { Size: "M", Color: "White" }, stock: 3, priceMillimes: null },
      ],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.catalog.stock).toBe(6);
    expect(resolveSizePolicy(false, 2)).toBe("options");
    expect(resolveSizePolicy(false, 0)).toBe("none");
    expect(resolveSizePolicy(true, 0)).toBe("required");
    expect(samPhrase("Raw Honey")).toBe("raw honey");
    expect(samPhrase("")).toBe("product");
    const under = normalizeSellerOptions({
      floorMillimes: 50_000,
      options: [{ name: "Scent", values: ["Rose"] }],
      variants: [{ optionValues: { Scent: "Rose" }, stock: 1, priceMillimes: 1_000 }],
    });
    expect(under.ok).toBe(false);
  });
});

describe("courier slip", () => {
  it("puts the buyer pin in a Maps link", () => {
    expect(deliverySlipQrPayload(36.8065, 10.1815)).toBe(
      "https://www.google.com/maps/search/?api=1&query=36.806500,10.181500",
    );
  });

  it("refuses a slip when the pin is missing", () => {
    expect(slipPinError(null, 10)).toMatch(/pin/i);
    expect(slipPinError(36.8, 10.1)).toBeNull();
  });

  it("renders a PDF whose subject is that Maps link", async () => {
    const pdf = await renderDeliverySlip({
      orderId: "11111111-1111-4111-8111-111111111111",
      shopName: "Souk",
      customerName: "Aymen",
      phone: "+21622123456",
      items: [{ name: "Honey", quantity: 1 }],
      totalMillimes: 45_000,
      landmark: "Pharmacie",
      floor: null,
      driverNote: "call",
      governorate: "Tunis",
      delegation: null,
      lat: 36.8065,
      lng: 10.1815,
    });
    const doc = await PDFDocument.load(pdf);
    expect(doc.getSubject()).toContain("36.806500");
    expect(doc.getSubject()).toContain("10.181500");
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
