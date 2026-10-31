import { describe, expect, it } from "vitest";
import {
  EMPTY_NEGOTIATION,
  ceilToHalfDinar,
  nextNegotiationStep,
  rungOfferMillimes,
} from "@/lib/domain/negotiation";
import { computeTotals } from "@/lib/domain/pricing";
import { nextAction } from "@/lib/domain/slots";

// price 180 DT, floor 150 DT -> max discount 30 DT
const PRICE = 180_000;
const FLOOR = 150_000;

describe("negotiation ladder", () => {
  it("concedes 50/80/100% of max discount, rounding up to 0.5 DT", () => {
    expect(rungOfferMillimes(PRICE, FLOOR, 0)).toBe(165_000);
    expect(rungOfferMillimes(PRICE, FLOOR, 1)).toBe(156_000);
    expect(rungOfferMillimes(PRICE, FLOOR, 2)).toBe(150_000);
    expect(ceilToHalfDinar(150_100)).toBe(150_500);
  });

  it("never goes below the floor (property over a price grid)", () => {
    for (let price = 10_000; price <= 500_000; price += 7_000) {
      for (let floor = 0; floor <= price; floor += 3_000) {
        for (let rung = 0; rung < 3; rung++) {
          const offer = rungOfferMillimes(price, floor, rung);
          expect(offer).toBeGreaterThanOrEqual(floor);
          expect(offer).toBeLessThanOrEqual(price);
          expect(offer % 500).toBe(0);
        }
      }
    }
  });

  it("third offer is final and equals the floor", () => {
    let state = { ...EMPTY_NEGOTIATION };
    let last = nextNegotiationStep({ priceMillimes: PRICE, floorMillimes: FLOOR, state });
    state = last.state;
    last = nextNegotiationStep({ priceMillimes: PRICE, floorMillimes: FLOOR, state });
    state = last.state;
    last = nextNegotiationStep({ priceMillimes: PRICE, floorMillimes: FLOOR, state });
    expect(last.offerMillimes).toBe(FLOOR);
    expect(last.isFinal).toBe(true);
    expect(last.state.agreedMillimes).toBe(FLOOR);
  });

  it("accepts a counter at or above the next rung as-is", () => {
    const res = nextNegotiationStep({
      priceMillimes: PRICE,
      floorMillimes: FLOOR,
      state: { ...EMPTY_NEGOTIATION },
      counterOfferMillimes: 170_000,
    });
    expect(res.acceptedCounter).toBe(true);
    expect(res.offerMillimes).toBe(170_000);
    expect(res.state.agreedMillimes).toBe(170_000);
  });

  it("does not accept a counter below the next rung", () => {
    const res = nextNegotiationStep({
      priceMillimes: PRICE,
      floorMillimes: FLOOR,
      state: { ...EMPTY_NEGOTIATION },
      counterOfferMillimes: 100_000,
    });
    expect(res.acceptedCounter).toBe(false);
    expect(res.offerMillimes).toBe(165_000);
  });
});

describe("pricing totals", () => {
  it("subtotal - discount + fee, integer millimes", () => {
    const t = computeTotals({ listUnitMillimes: 180_000, agreedUnitMillimes: 165_000, quantity: 2, feeMillimes: 7_000 });
    expect(t).toEqual({
      subtotalMillimes: 360_000,
      discountMillimes: 30_000,
      deliveryFeeMillimes: 7_000,
      totalMillimes: 337_000,
      freeDelivery: false,
    });
  });

  it("free delivery at the merchant threshold", () => {
    const t = computeTotals({
      listUnitMillimes: 180_000,
      agreedUnitMillimes: 180_000,
      quantity: 1,
      feeMillimes: 7_000,
      freeDeliveryThresholdMillimes: 150_000,
    });
    expect(t.freeDelivery).toBe(true);
    expect(t.totalMillimes).toBe(180_000);
  });
});

describe("slots nextAction priority", () => {
  const full: Record<string, unknown> = {
    matchedProductId: "p1",
    size: "L",
    customerName: "Aymen",
    phone: "+21620111222",
    governorate: "Tunis",
    landmarks: [{ name: "Pharmacie", relation: null }],
  };
  it("walks the fixed order", () => {
    expect(nextAction({})).toBe("need_product");
    expect(nextAction({ matchedProductId: "p1" })).toBe("need_size");
    expect(nextAction({ matchedProductId: "p1", size: "L" })).toBe("need_name");
    expect(nextAction({ matchedProductId: "p1", size: "L", customerName: "Aymen" })).toBe("need_phone");
    expect(nextAction(full)).toBe("need_pin");
    expect(nextAction({ ...full, pinPending: true })).toBe("awaiting_pin");
    expect(nextAction({ ...full, confirmedAddressId: "a1" })).toBe("need_summary");
    expect(nextAction({ ...full, confirmedAddressId: "a1", summaryPending: true })).toBe("awaiting_confirmation");
    expect(nextAction({ ...full, confirmedAddressId: "a1", orderId: "o1" })).toBe("ordered");
  });
});
