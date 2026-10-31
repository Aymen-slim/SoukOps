import { describe, expect, it } from "vitest";
import {
  arabiziToArabic,
  extractGovernorate,
  extractLandmarks,
  extractCustomerName,
  extractPhone,
  extractQuantity,
  extractSize,
  glossaryHits,
  normalizeTunisianPhone,
  parseMoneyMillimes,
  refinePrimaryIntent,
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

  it("refines price/stock intents from unambiguous Derja wording", () => {
    expect(refinePrimaryIntent("mawjoud fel stock?", "ask_price")).toBe("ask_stock");
    expect(refinePrimaryIntent("b9addech el soum?", "other")).toBe("ask_price");
    expect(refinePrimaryIntent("na9es el soum, 170 alf", "bargain")).toBe("bargain");
    // Explicit discount wording wins over the word "soum" (Day 4 ladder).
    expect(refinePrimaryIntent("ghalia barcha, na9esli el soum", "ask_price")).toBe("bargain");
    expect(refinePrimaryIntent("merhba", "greeting")).toBe("greeting");
  });

  it("maps Arabizi digits and finds glossary hits", () => {
    expect(arabiziToArabic("n7eb")).toBe("nحeb"); // only digit-letters are mapped
    expect(glossaryHits("b9addech el soum?")).toEqual(expect.arrayContaining(["b9addech", "soum"]));
  });

  it("extracts clothing size from captions, sentences, and standalone replies", () => {
    expect(extractSize("n7eb hedha taille L")).toBe("L");
    expect(extractSize("size m svp")).toBe("M");
    expect(extractSize("n7eb hedha L")).toBe("L");
    expect(extractSize("sweat jaune m")).toBe("M");
    expect(extractSize("en L")).toBe("L");
    expect(extractSize("xl")).toBe("XL");
    expect(extractSize("L")).toBe("L");
    expect(extractSize("medium")).toBe("M");
    expect(extractSize("40", true)).toBe("40");
    expect(extractSize("Merhba, b9addech el hoodie el noir?")).toBeNull();
    expect(extractSize("noskon fi Tunis ba7dha Pharmacie El Manar")).toBeNull();
  });

  it("extracts embedded Tunisian phone numbers, governorates, and quantities", () => {
    expect(extractPhone("téléphoni 55 123 456 w noskon fi Sousse")).toBe("+21655123456");
    expect(extractCustomerName("esmi Aymen")).toBe("Aymen");
    expect(extractCustomerName("esmi Aymen w numeri 22123456")).toBe("Aymen");
    expect(extractCustomerName("je m'appelle Sarra Ben Ali")).toBe("Sarra Ben Ali");
    expect(extractCustomerName("n7eb sweat jaune")).toBeNull();
    expect(extractGovernorate("noskon ba7dha Pharmacie de Nuit El Manar")).toEqual({
      governorate: "Tunis",
      delegation: "El Manar",
    });
    expect(extractGovernorate("fi Ennasr 2")).toEqual({
      governorate: "Ariana",
      delegation: "Ennasr",
    });
    expect(extractQuantity("n7eb 2 ka3bet")).toBe(2);
    expect(extractQuantity("zouj men hedha")).toBe(2);
    expect(extractLandmarks("noskon fi Ennasr ba7dha coffee shop Cosmitto")[0]?.name).toContain("coffee shop Cosmitto");
    expect(extractLandmarks("Ariana, 9ahwet El Baraka")[0]?.name).toContain("9ahwet El Baraka");
    expect(extractLandmarks("Tunis ba7dha Tunisia Mall Lac 2")[0]?.name).toContain("Tunisia Mall");
  });
});
