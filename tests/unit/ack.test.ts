import { describe, expect, it } from "vitest";
import { buildAck } from "@/lib/pipeline/handleTurn";

describe("buildAck (Day 2 interim reply)", () => {
  it("greets and asks for a product when nothing is known", () => {
    const reply = buildAck({ primaryIntent: "greeting" }, false, false);
    expect(reply).toContain("Ab3atli taswirt el produit");
  });

  it("asks for size once the product is known", () => {
    const reply = buildAck({ productDescriptionEn: "black hoodie", primaryIntent: "order" }, true, false);
    expect(reply).toContain("Wesletni el taswira.");
    expect(reply).toContain("taille");
  });

  it("asks for the address once size is known", () => {
    const reply = buildAck(
      { productDescriptionEn: "black hoodie", size: "L", primaryIntent: "order" },
      false,
      true,
    );
    expect(reply).toContain("Sma3t el vocal");
    expect(reply).toContain("Win toskon");
  });

  it("never states a price", () => {
    const reply = buildAck(
      { productDescriptionEn: "black hoodie", size: "L", governorate: "Tunis", phone: "+21620111222" },
      false,
      false,
    );
    expect(reply).not.toMatch(/\d+\s*(dt|dinar|alf)/i);
  });

  it("varies by turn instead of repeating one canned sentence", () => {
    const first = buildAck({ primaryIntent: "greeting" }, false, false);
    const second = buildAck({ productDescriptionEn: "dress", primaryIntent: "order" }, false, false);
    const third = buildAck({ productDescriptionEn: "dress", size: "M", primaryIntent: "order" }, false, false);
    expect(new Set([first, second, third]).size).toBe(3);
  });
});
