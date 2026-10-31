import { describe, expect, it } from "vitest";
import { buildAck, buildPriceReply, buildStockReply, matchedText } from "@/lib/pipeline/handleTurn";

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

  it("asks for the buyer's name once size is known", () => {
    const reply = buildAck(
      { productDescriptionEn: "black hoodie", size: "L", primaryIntent: "order" },
      false,
      true,
    );
    expect(reply).toContain("Sma3t el vocal");
    expect(reply).toContain("esmek");
  });

  it("never states a price", () => {
    const reply = buildAck(
      { productDescriptionEn: "black hoodie", size: "L", governorate: "Tunis", phone: "+21620111222" },
      false,
      false,
    );
    expect(reply).not.toMatch(/\d+\s*(dt|dinar|alf)/i);
  });

  it("answers a price question with the catalog price, never the address question", () => {
    const reply = buildPriceReply("Sweat jaune", 110_000, { size: "L" }, 4);
    expect(reply).toContain("110DT");
    expect(reply).toContain("esmek");
    expect(reply).not.toContain("Win toskon");
    expect(reply).not.toMatch(/wilaya|landmark/i);
  });

  it("answers a stock question directly", () => {
    expect(buildStockReply("Sweat jaune", 4, { size: "L" })).toContain("mawjoud fel stock");
    expect(buildStockReply("Sweat jaune", 0, {})).toContain("kemmel fel stock");
    expect(buildStockReply("Sweat jaune", 4, { size: "L" })).toContain("esmek");
    expect(buildStockReply("Sweat jaune", 4, { size: "L" })).not.toContain("Win toskon");
  });

  it("varies by turn instead of repeating one canned sentence", () => {
    const first = buildAck({ primaryIntent: "greeting" }, false, false);
    const second = buildAck({ productDescriptionEn: "dress", primaryIntent: "order" }, false, false);
    const third = buildAck({ productDescriptionEn: "dress", size: "M", primaryIntent: "order" }, false, false);
    expect(new Set([first, second, third]).size).toBe(3);
  });

  it("matchedText acknowledges size when sent with the image instead of asking for size again", () => {
    const reply = matchedText(
      "Sweat jaune",
      { matchedProductId: "p1", size: "L", phone: "+21620111222" },
      110_000,
    );
    expect(reply).toContain("Sweat jaune");
    expect(reply).toContain("110DT");
    expect(reply).toContain("taille L");
    expect(reply).not.toContain("Chnowa el taille");
    expect(reply).toContain("esmek");
    expect(reply).not.toContain("Win toskon");
  });
});
