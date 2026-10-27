import { describe, expect, it } from "vitest";
import { cassetteKey } from "@/lib/ai/cassette";

describe("cassetteKey", () => {
  it("is stable regardless of object key order", () => {
    expect(cassetteKey("spark.json", { a: 1, b: { c: 2, d: 3 } })).toBe(
      cassetteKey("spark.json", { b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it("differs by namespace and input", () => {
    expect(cassetteKey("a", { x: 1 })).not.toBe(cassetteKey("b", { x: 1 }));
    expect(cassetteKey("a", { x: 1 })).not.toBe(cassetteKey("a", { x: 2 }));
  });
});
