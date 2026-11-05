import { describe, expect, it, vi } from "vitest";

const sparkTextMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/spark", () => ({ sparkText: sparkTextMock }));

import { phraseNegotiationReply, phraseSellerReply, type NegotiationFacts } from "@/lib/pipeline/phrasing";

const FACTS: NegotiationFacts = {
  productName: "Sweat jaune",
  offerMillimes: 102_500,
  listPriceMillimes: 110_000,
  acceptedCounter: false,
  isFinal: false,
};

describe("negotiation phrasing (Spark words, code decides)", () => {
  it("uses Spark text when it states the offer and invents nothing", async () => {
    sparkTextMock.mockResolvedValue("El soum el jdid howa 102,500 DT, ysa3dek nkammlou bih?");
    const res = await phraseNegotiationReply(FACTS);
    expect(res.source).toBe("spark");
    expect(res.text).toContain("102,500 DT");
  });

  it("falls back to the template when Spark invents an amount", async () => {
    sparkTextMock.mockResolvedValue("Na3mallek soum behi: 90DT bark, akher kelma!");
    const res = await phraseNegotiationReply(FACTS);
    expect(res.source).toBe("template");
    expect(res.text).toContain("102,500 DT");
    expect(res.text).not.toContain("90DT");
  });

  it("falls back when Spark omits the offer amount", async () => {
    sparkTextMock.mockResolvedValue("Na9esna barcha fel soum, t7eb tkammel?");
    const res = await phraseNegotiationReply(FACTS);
    expect(res.source).toBe("template");
    expect(res.text).toContain("102,500 DT");
  });

  it("falls back when Spark throws (provider down)", async () => {
    sparkTextMock.mockRejectedValue(new Error("provider down"));
    const res = await phraseNegotiationReply(FACTS);
    expect(res.source).toBe("template");
    expect(res.text).toContain("102,500 DT");
  });

  it("final template states the floor as akher soum", async () => {
    sparkTextMock.mockRejectedValue(new Error("down"));
    const res = await phraseNegotiationReply({ ...FACTS, offerMillimes: 95_000, isFinal: true });
    expect(res.text).toContain("akher soum");
    expect(res.text).toContain("95DT");
  });

  it("cancels the Spark call when the phrasing deadline passes", async () => {
    let aborted = false;
    sparkTextMock.mockImplementation((req: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        if (!req.signal) return; // never settles: only abort can end it
        req.signal.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
      });
    });
    const res = await phraseSellerReply({
      situation: "collect_slot",
      buyerText: "L",
      productName: "Sweat jaune",
      size: "L",
      nextAction: "need_governorate",
      fallbackText: "Mrigel, sajaltlek taille L. Win toskon?",
    });
    expect(res.source).toBe("template");
    expect(aborted).toBe(true);
  });

  it("phraseSellerReply rejects model output that re-asks for size when size is already known", async () => {
    sparkTextMock.mockResolvedValue("Ahla bik! Chnowa el taille mte3ek?");
    const res = await phraseSellerReply({
      situation: "collect_slot",
      buyerText: "taille L",
      productName: "Sweat jaune",
      priceMillimes: 110_000,
      size: "L",
      hasPhone: true,
      nextAction: "need_governorate",
      fallbackText: "Mrigel, sajaltlek taille L. Win toskon?",
    });
    expect(res.source).toBe("template");
    expect(res.text).toContain("Win toskon");
    expect(res.text).not.toContain("Chnowa el taille");
  });
});
