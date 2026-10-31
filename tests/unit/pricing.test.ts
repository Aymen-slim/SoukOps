import { describe, expect, it } from "vitest";
import { passesPriceFirewall } from "@/lib/domain/firewall";
import { firewallChecked, formatMillimesForChat } from "@/lib/domain/pricing";

describe("pricing formatting (integer millimes only)", () => {
  it("formats whole dinars compactly", () => {
    expect(formatMillimesForChat(120_000)).toBe("120DT");
    expect(formatMillimesForChat(45_000)).toBe("45DT");
  });

  it("formats millime fractions the firewall can parse back", () => {
    expect(formatMillimesForChat(120_500)).toBe("120,500 DT");
    expect(passesPriceFirewall(formatMillimesForChat(120_500), new Set([120_500]))).toBe(true);
  });

  it("firewallChecked passes producible amounts and blocks invented ones", () => {
    expect(firewallChecked("El soum 110DT", [110_000])).toBe("El soum 110DT");
    expect(firewallChecked("El soum 99DT", [110_000])).toBeNull();
    expect(firewallChecked("Ma3andich soum taw", [110_000])).toBe("Ma3andich soum taw");
  });
});
