import { describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimits } from "@/lib/security/simulatorGuard";

describe("simulator rate limit", () => {
  it("allows up to the limit inside the window, then refuses", () => {
    resetRateLimits();
    expect(checkRateLimit("ip1", 3, 60_000, 1_000)).toBe(true);
    expect(checkRateLimit("ip1", 3, 60_000, 2_000)).toBe(true);
    expect(checkRateLimit("ip1", 3, 60_000, 3_000)).toBe(true);
    expect(checkRateLimit("ip1", 3, 60_000, 4_000)).toBe(false);
  });

  it("resets after the window and scopes by key", () => {
    resetRateLimits();
    expect(checkRateLimit("a", 1, 60_000, 0)).toBe(true);
    expect(checkRateLimit("a", 1, 60_000, 1_000)).toBe(false);
    expect(checkRateLimit("b", 1, 60_000, 1_000)).toBe(true);
    expect(checkRateLimit("a", 1, 60_000, 61_000)).toBe(true);
    resetRateLimits();
  });
});
