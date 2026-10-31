import { describe, expect, it } from "vitest";
import { passesPriceFirewall } from "@/lib/domain/firewall";
import { buildSummaryText, summaryAllowedAmounts, type OrderPreview } from "@/lib/pipeline/order";

function preview(overrides: Partial<OrderPreview> = {}): OrderPreview {
  return {
    conversationId: "c1",
    merchantId: "m1",
    customerId: "cu1",
    productId: "p1",
    productName: "Hoodie jaune",
    size: "L",
    quantity: 1,
    listUnitMillimes: 180_000,
    agreedUnitMillimes: 165_000,
    stock: 5,
    totals: {
      subtotalMillimes: 180_000,
      discountMillimes: 15_000,
      deliveryFeeMillimes: 7_000,
      totalMillimes: 172_000,
      freeDelivery: false,
    },
    risk: { score: 25, level: "red", reasons: ["3 retour(s) précédent(s) (-60)"] },
    pinDistanceKm: 0.4,
    addressId: "a1",
    customerName: "Karim Gharbi",
    phone: "+21624555666",
    landmark: "Pharmacie de Nuit El Manar",
    paymentLink: "https://pay.wassalha-demo.tn/flouci",
    ...overrides,
  };
}

describe("fixed order summary", () => {
  it("contains only pricing-engine amounts (firewall passes)", () => {
    const p = preview();
    const text = buildSummaryText(p);
    expect(text).toContain("165DT");
    expect(text).toContain("172DT");
    expect(passesPriceFirewall(text, new Set(summaryAllowedAmounts(p)))).toBe(true);
  });

  it("red buyers get the seller payment link; green buyers do not", () => {
    expect(buildSummaryText(preview())).toContain("https://pay.wassalha-demo.tn/flouci");
    const green = buildSummaryText(
      preview({ risk: { score: 100, level: "green", reasons: [] }, paymentLink: null }),
    );
    expect(green).not.toContain("flouci");
    expect(green).toContain("Akked");
  });

  it("free delivery is stated without an amount", () => {
    const p = preview({
      totals: {
        subtotalMillimes: 360_000,
        discountMillimes: 0,
        deliveryFeeMillimes: 0,
        totalMillimes: 360_000,
        freeDelivery: true,
      },
    });
    expect(buildSummaryText(p)).toContain("Livraison: gratuite");
  });
});
