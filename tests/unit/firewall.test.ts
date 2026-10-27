import { describe, expect, it } from "vitest";
import { extractAmountsMillimes, passesPriceFirewall } from "@/lib/domain/firewall";

describe("price firewall", () => {
  it("extracts DT amounts as millimes", () => {
    expect(extractAmountsMillimes("El somme 171DT, w el livraison gratuit")).toEqual([171_000]);
    expect(extractAmountsMillimes("171,500 DT")).toEqual([171_500]);
    expect(extractAmountsMillimes("170 alf")).toEqual([170_000]);
  });

  it("passes only amounts the pricing engine produced", () => {
    const allowed = new Set([171_000]);
    expect(passesPriceFirewall("Akher somme: 171DT", allowed)).toBe(true);
    expect(passesPriceFirewall("Akher somme: 150DT", allowed)).toBe(false);
    expect(passesPriceFirewall("Merhba bik, dispo en rouge", allowed)).toBe(true);
  });
});
