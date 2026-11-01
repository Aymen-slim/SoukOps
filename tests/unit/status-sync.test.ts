import { describe, expect, it } from "vitest";
import { mapFdState } from "@/lib/couriers/statusSync";
import { FD_STATES, isFdState } from "@/lib/couriers/types";

describe("FD state mapping", () => {
  it("maps every known FD state", () => {
    expect(mapFdState(0)).toEqual({ orderStatus: "WAYBILL_CREATED", riskKind: null, buyerText: null });
    expect(mapFdState(1).orderStatus).toBe("SHIPPED");
    expect(mapFdState(2)).toMatchObject({ orderStatus: "DELIVERED", riskKind: "delivered" });
    expect(mapFdState(6)).toMatchObject({ orderStatus: "CANCELLED", riskKind: "cancelled" });
    for (const state of [5, 7, 11, 30, 31] as const) {
      expect(mapFdState(state)).toMatchObject({ orderStatus: "RETURNED", riskKind: "returned" });
    }
  });

  it("only terminal mappings create risk events and buyer notices carry no amount", () => {
    for (const state of FD_STATES) {
      const mapping = mapFdState(state);
      if (mapping.buyerText) {
        expect(mapping.buyerText).not.toMatch(/\d+\s*(dt|dinar|alf)/i);
      }
    }
    expect(mapFdState(0).riskKind).toBeNull();
    expect(mapFdState(1).riskKind).toBeNull();
  });

  it("refuses unknown states", () => {
    expect(isFdState(99)).toBe(false);
    expect(() => mapFdState(99 as never)).toThrow(/unknown/);
  });
});
