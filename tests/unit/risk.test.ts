import { describe, expect, it } from "vitest";
import { computeRisk } from "@/lib/domain/risk";

describe("risk engine", () => {
  it("returning buyer with delivered history is green", () => {
    const r = computeRisk({ historyKinds: ["delivered", "delivered", "delivered"] });
    expect(r.score).toBe(100);
    expect(r.level).toBe("green");
  });

  it("first order docks 10 with a readable reason", () => {
    const r = computeRisk({ historyKinds: [] });
    expect(r.score).toBe(90);
    expect(r.level).toBe("green");
    expect(r.reasons.join(" ")).toMatch(/First order/);
  });

  it("bad buyer (3 returns + 1 cancellation) is red with reasons", () => {
    const r = computeRisk({ historyKinds: ["returned", "returned", "returned", "cancelled"] });
    expect(r.score).toBe(100 - 60 - 15);
    expect(r.level).toBe("red");
    expect(r.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("pin beyond 2 km docks exactly 10; at 2 km it does not", () => {
    const far = computeRisk({ historyKinds: ["delivered"], pinDistanceKm: 3.4 });
    expect(far.score).toBe(90);
    expect(far.reasons.join(" ")).toMatch(/Pin is/);
    const near = computeRisk({ historyKinds: ["delivered"], pinDistanceKm: 2 });
    expect(near.score).toBe(100);
  });

  it("one return lands yellow and score is clamped to [0,100]", () => {
    expect(computeRisk({ historyKinds: ["returned"] }).score).toBe(70);
    expect(computeRisk({ historyKinds: ["returned", "cancelled"] }).level).toBe("yellow");
    const worst = computeRisk({
      historyKinds: ["returned", "returned", "returned", "returned", "cancelled", "cancelled", "cancelled"],
      pinDistanceKm: 9,
    });
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.level).toBe("red");
  });
});
