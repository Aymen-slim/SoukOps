import { describe, expect, it, vi } from "vitest";

const sparkTextMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/spark", () => ({ sparkText: sparkTextMock }));

import { buildBusinessContext, businessProfile, inferBusinessType, resolveBusinessType } from "@/lib/domain/business";
import { buyerLanguageOf, detectBuyerLanguage, resolveBuyerLanguage } from "@/lib/domain/language";
import { nextAskBundle } from "@/lib/domain/slots";
import { buildAck, buildPriceReply } from "@/lib/pipeline/handleTurn";
import { assistanceReply, phraseSellerReply } from "@/lib/pipeline/phrasing";
import { fastPathUnderstanding } from "@/lib/pipeline/understand";

describe("buyer language detection (code decides, no model call)", () => {
  it("detects French, Arabic script, Derja Arabizi and English from the first message", () => {
    expect(detectBuyerLanguage("Bonjour, je voudrais commander ce produit, quel est le prix ?")?.language).toBe("fr");
    expect(detectBuyerLanguage("أهلا، نحب نطلب هذا المنتج")?.language).toBe("ar");
    expect(detectBuyerLanguage("Ahla, n7eb ncommandi hedha el produit")?.language).toBe("derja");
    expect(detectBuyerLanguage("Hello, I would like to order this, what is the price?")?.language).toBe("en");
  });

  it("returns null for slot-only replies so the current language is kept", () => {
    expect(detectBuyerLanguage("L")).toBeNull();
    expect(detectBuyerLanguage("55123456")).toBeNull();
    expect(detectBuyerLanguage("")).toBeNull();
  });

  it("sets the language from the first message and switches only on a clear change", () => {
    expect(resolveBuyerLanguage(null, "Bonjour, je voudrais commander")).toBe("fr");
    expect(resolveBuyerLanguage("derja", "merci")).toBeNull();
    expect(resolveBuyerLanguage("derja", "Bonjour, je parle français maintenant, quel est le prix de livraison ?")).toBe("fr");
    expect(resolveBuyerLanguage("fr", "Ahla, n7eb ncommandi hedha el produit, b9addech?")).toBe("derja");
    expect(resolveBuyerLanguage("fr", "L")).toBeNull();
  });

  it("reads the stored buyer language from slots", () => {
    expect(buyerLanguageOf({ buyerLanguage: "fr" })).toBe("fr");
    expect(buyerLanguageOf({ buyerLanguage: "xx" })).toBeNull();
    expect(buyerLanguageOf({})).toBeNull();
  });
});

describe("business personalization (what the shop sells drives the chat)", () => {
  it("gives each vertical its own size semantics", () => {
    expect(businessProfile("clothing").sizeKind).toBe("clothing");
    expect(businessProfile("shoes").sizeKind).toBe("shoe");
    expect(businessProfile("food").sizeKind).toBe("none");
    expect(businessProfile("food").extractSize).toBe(false);
    expect(businessProfile("beauty").extractSize).toBe(false);
  });

  it("infers the vertical from the catalog and lets the seller choice win", () => {
    expect(inferBusinessType(["Sweat jaune hoodie", "Robe d'été dress"])).toBe("clothing");
    expect(inferBusinessType(["Miel pur, honey jar 500g"])).toBe("food");
    expect(inferBusinessType(["Parfum oud 100ml, eau de parfum"])).toBe("beauty");
    expect(inferBusinessType(["Coque iPhone, écouteurs bluetooth"])).toBe("electronics");
    expect(resolveBusinessType("general", ["hoodie noir"])).toBe("clothing");
    expect(resolveBusinessType("food", ["hoodie noir"])).toBe("food");
    expect(resolveBusinessType(null, [])).toBe("general");
  });

  it("builds a deterministic prompt line from what the shop sells", () => {
    const food = buildBusinessContext({ businessType: "food", productTypes: ["honey jar", "olive oil"] });
    expect(food.promptLine).toContain("honey jar");
    expect(food.promptLine).not.toContain("clothing size");
    const clothing = buildBusinessContext({ businessType: "clothing", productTypes: ["hoodie"] });
    expect(clothing.promptLine).toContain("clothing size");
  });

  it("never asks a food shop for a clothing size", () => {
    const reply = buildAck(
      { matchedProductId: "p1", sizePolicy: "none", businessType: "food", primaryIntent: "order" },
      false,
      false,
    );
    expect(reply).not.toContain("taille");
    expect(reply).toContain("esmek");
  });
});

describe("bundled questions (one human message, not a form)", () => {
  it("bundles name + phone and governorate + landmark", () => {
    expect(nextAskBundle({ matchedProductId: "p", size: "L" })).toEqual(["need_name", "need_phone"]);
    expect(nextAskBundle({ matchedProductId: "p", size: "L", customerName: "Ahmed" })).toEqual(["need_phone"]);
    expect(
      nextAskBundle({ matchedProductId: "p", size: "L", customerName: "Ahmed", phone: "+21655123456" }),
    ).toEqual(["need_governorate", "need_landmark"]);
    expect(
      nextAskBundle({ matchedProductId: "p", size: "L", customerName: "Ahmed", phone: "+21655123456", governorate: "Tunis" }),
    ).toEqual(["need_landmark"]);
    expect(nextAskBundle({})).toEqual(["need_product"]);
  });

  it("asks name and number in a single question, in the buyer's language", () => {
    const derja = buildPriceReply("Sweat jaune", 110_000, { size: "L" });
    expect(derja).toContain("esmek");
    expect(derja).toMatch(/téléphone|numero/);
    expect(derja).not.toContain("Win toskon");
    const french = buildPriceReply("Sweat jaune", 110_000, { size: "L", buyerLanguage: "fr" });
    expect(french).toContain("nom");
    expect(french).toContain("téléphone");
    expect(french).not.toContain("esmek");
  });

  it("fills name and phone from one combined reply without a model call", () => {
    const u = fastPathUnderstanding("Ahmed 55123456", false);
    expect(u?.customerName).toBe("Ahmed");
    expect(u?.phone).toBe("+21655123456");
  });
});

describe("strict replies (answer first, one bundled ask, never re-ask)", () => {
  it("rejects model output that asks for a phone the buyer already gave", async () => {
    sparkTextMock.mockResolvedValue("Parfait ! Quel est votre numéro de téléphone ?");
    const res = await phraseSellerReply({
      situation: "collect_slot",
      buyerText: "Tunis",
      productName: "Sweat jaune",
      size: "L",
      hasPhone: true,
      hasName: true,
      nextAction: "need_governorate",
      fallbackText: "Mrigel, sajaltlek. Win toskon?",
    });
    expect(res.source).toBe("template");
    expect(res.text).toContain("Win toskon");
  });

  it("rejects model output that fires several questions at once", async () => {
    sparkTextMock.mockResolvedValue("Quelle taille ? Quel nom ? Quel numéro ? Quelle ville ?");
    const res = await phraseSellerReply({
      situation: "collect_slot",
      buyerText: "je veux commander",
      productName: "Sweat jaune",
      nextAction: "need_name",
      fallbackText: "Behi! Chnowa esmek w numero el téléphone mte3ek, 3aychek?",
    });
    expect(res.source).toBe("template");
  });

  it("answers side questions in the buyer's language without inventing a price", () => {
    const fr = assistanceReply("ask_delivery", false, "fr");
    expect(fr).toContain("livraison");
    expect(fr).not.toContain("tethseb");
    expect(fr).not.toMatch(/\d+\s*(dt|dinar|alf)/i);
  });
});
