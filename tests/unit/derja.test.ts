import { describe, expect, it } from "vitest";
import {
  arabiziToArabic,
  glossaryHits,
  normalizeTunisianPhone,
  parseMoneyMillimes,
} from "@/lib/domain/derja";

describe("derja parsers", () => {
  it("parses Derja money into millimes", () => {
    expect(parseMoneyMillimes("n7eb na9es, 170 alf")).toBe(170_000);
    expect(parseMoneyMillimes("malyoun")).toBe(1_000_000);
    expect(parseMoneyMillimes("180 dt")).toBe(180_000);
    expect(parseMoneyMillimes("180,500 DT")).toBe(180_500);
    expect(parseMoneyMillimes("merhba bik")).toBeNull();
  });

  it("normalizes Tunisian phones", () => {
    expect(normalizeTunisianPhone("98 333 444")).toBe("+21698333444");
    expect(normalizeTunisianPhone("+216 20 111 222")).toBe("+21620111222");
    expect(normalizeTunisianPhone("123")).toBeNull();
    expect(normalizeTunisianPhone("+33 6 12 34 56 78")).toBeNull();
  });

  it("maps Arabizi digits and finds glossary hits", () => {
    expect(arabiziToArabic("n7eb")).toBe("nحeb"); // only digit-letters are mapped
    expect(glossaryHits("b9addech el soum?")).toEqual(expect.arrayContaining(["b9addech", "soum"]));
  });
});
