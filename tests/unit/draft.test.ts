import { describe, expect, it } from "vitest";
import { parseOrderChange } from "@/lib/domain/derja";
import { applyDraftChange, draftFromSlots } from "@/lib/domain/draft";
import { nextDraftAction } from "@/lib/domain/slots";

const baseSlots: Record<string, unknown> = {
  matchedProductId: "p1",
  matchedProductName: "Sweat jaune",
  size: "M",
  quantity: 1,
  customerName: "Aymen",
  phone: "+21620111222",
  governorate: "Tunis",
  landmarks: [{ name: "Pharmacie El Manar", relation: "near" }],
  confirmedAddressId: "a1",
  summaryPending: true,
  summary: { totalMillimes: 117000 },
  draftVersion: 1,
};

describe("mid-conversation draft edits", () => {
  it("changes size without losing the confirmed pin, but invalidates the summary", () => {
    const r = applyDraftChange(baseSlots, { target: "size", operation: "replace", value: "L" });
    expect(r.slots.size).toBe("L");
    expect(r.slots.confirmedAddressId).toBe("a1");
    expect(r.slots.summaryPending).toBe(false);
    expect(r.invalidatedSummary).toBe(true);
    expect(r.needsNewPin).toBe(false);
    expect(r.diffs.join(" ")).toContain("M");
    expect(r.diffs.join(" ")).toContain("L");
  });

  it("changes address by clearing the pin and requiring a fresh one", () => {
    const r = applyDraftChange(baseSlots, {
      target: "landmark",
      operation: "replace",
      value: "Café Cosmitto Ennasr",
    });
    expect(r.slots.confirmedAddressId).toBeUndefined();
    expect(r.slots.pinPending).toBe(false);
    expect(r.needsNewPin).toBe(true);
    expect(r.invalidatedSummary).toBe(true);
    expect(nextDraftAction(r.slots)).toBe("need_pin");
  });

  it("increments quantity and swaps product with negotiation reset", () => {
    const q = applyDraftChange(baseSlots, { target: "quantity", operation: "increment", quantityDelta: 1 });
    expect(q.slots.quantity).toBe(2);
    const p = applyDraftChange(baseSlots, { target: "product", operation: "replace", value: "hoodie noir" });
    expect(p.slots.matchedProductId).toBeUndefined();
    expect(p.resetNegotiation).toBe(true);
    expect(nextDraftAction(p.slots)).toBe("need_product");
  });

  it("cancels the draft and reads legacy slots into a draft", () => {
    const c = applyDraftChange(baseSlots, { target: "order", operation: "cancel" });
    expect(c.cancelled).toBe(true);
    expect(c.slots.summaryPending).toBe(false);
    const draft = draftFromSlots(baseSlots);
    expect(draft.items[0]).toMatchObject({ productId: "p1", size: "M", quantity: 1 });
    expect(draft.draftVersion).toBe(1);
  });

  it("adds a second item and asks for its size next", () => {
    const r = applyDraftChange(baseSlots, {
      target: "item",
      operation: "add",
      value: "p2",
      productName: "Hoodie noir",
    });
    const items = r.slots.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(nextDraftAction(r.slots)).toBe("need_size");
  });
});

describe("Derja change parsing", () => {
  it("parses size, quantity, colour, address and cancel changes", () => {
    expect(parseOrderChange("beddel el taille l L")).toMatchObject({ target: "size", value: "L" });
    expect(parseOrderChange("zid wa7da o5ra")).toMatchObject({ target: "quantity", operation: "increment" });
    expect(parseOrderChange("mouch noir, n7eb bleu")).toMatchObject({ target: "color", value: "bleu" });
    expect(parseOrderChange("beddel el adresse, noskon fi Ariana ba7dha Café Cosmitto")).toMatchObject({
      target: "landmark",
    });
    expect(parseOrderChange("annuli el commande")).toMatchObject({ target: "order", operation: "cancel" });
    expect(parseOrderChange("ahla bik")).toBeNull();
  });
});
