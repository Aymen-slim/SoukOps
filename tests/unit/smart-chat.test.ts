import { describe, expect, it } from "vitest";
import { computeCartTotals } from "@/lib/domain/pricing";
import { buildSummaryText, summaryAllowedAmounts, type OrderPreview } from "@/lib/pipeline/order";
import { assistanceReply } from "@/lib/pipeline/phrasing";
import { fastPathUnderstanding } from "@/lib/pipeline/understand";
import { passesPriceFirewall } from "@/lib/domain/firewall";

describe("smarter chat: edits, cart, side questions", () => {
  it("handles a size change on the fast path without a model call", () => {
    const u = fastPathUnderstanding("beddel el taille l L", true);
    expect(u?.primaryIntent).toBe("change_order");
    expect(u?.change).toMatchObject({ target: "size", value: "L" });
    expect(u?.size).toBe("L");
  });

  it("detects add, cancel and delivery questions deterministically", () => {
    expect(fastPathUnderstanding("zid wa7da o5ra")?.primaryIntent).toBe("change_order");
    expect(fastPathUnderstanding("annuli el commande")?.primaryIntent).toBe("cancel_order");
    expect(fastPathUnderstanding("wa9tech el livraison?")?.primaryIntent).toBe("ask_delivery");
  });

  it("computes cart totals only from pricing inputs", () => {
    const totals = computeCartTotals({
      items: [
        { listUnitMillimes: 100_000, agreedUnitMillimes: 90_000, quantity: 2 },
        { listUnitMillimes: 50_000, agreedUnitMillimes: 50_000, quantity: 1 },
      ],
      feeMillimes: 7_000,
      freeDeliveryThresholdMillimes: null,
    });
    expect(totals.subtotalMillimes).toBe(250_000);
    expect(totals.discountMillimes).toBe(20_000);
    expect(totals.totalMillimes).toBe(237_000);
  });

  it("renders a multi-item summary whose amounts all pass the firewall", () => {
    const preview: OrderPreview = {
      conversationId: "c1",
      merchantId: "m1",
      customerId: "cu1",
      productId: "p1",
      productName: "Sweat jaune",
      size: "L",
      quantity: 1,
      listUnitMillimes: 100_000,
      agreedUnitMillimes: 90_000,
      stock: 5,
      items: [
        { productId: "p1", productName: "Sweat jaune", size: "L", quantity: 2, listUnitMillimes: 100_000, agreedUnitMillimes: 90_000, stock: 5 },
        { productId: "p2", productName: "Hoodie noir", size: "M", quantity: 1, listUnitMillimes: 50_000, agreedUnitMillimes: 50_000, stock: 3 },
      ],
      totals: { subtotalMillimes: 250_000, discountMillimes: 20_000, deliveryFeeMillimes: 7_000, totalMillimes: 237_000, freeDelivery: false },
      risk: { score: 100, level: "green", reasons: [] },
      pinDistanceKm: 0.2,
      addressId: "a1",
      customerName: "Aymen",
      phone: "+21620111222",
      landmark: "Café Cosmitto",
      paymentLink: null,
    };
    const text = buildSummaryText(preview);
    expect(text).toContain("Sweat jaune");
    expect(text).toContain("Hoodie noir");
    expect(text).toContain("237DT");
    expect(passesPriceFirewall(text, new Set(summaryAllowedAmounts(preview)))).toBe(true);
  });

  it("answers side questions without inventing a price", () => {
    for (const intent of ["ask_delivery", "ask_policy", "track_order"] as const) {
      expect(assistanceReply(intent, false)).not.toMatch(/\d+\s*(dt|dinar|alf)/i);
    }
  });
});
