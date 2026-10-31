import { describe, expect, it } from "vitest";
import { burstDelayMs } from "@/lib/pipeline/handleTurn";
import { fastPathUnderstanding } from "@/lib/pipeline/understand";

describe("fast first replies", () => {
  it("answers a bare greeting without a model", () => {
    const understood = fastPathUnderstanding("ahla");
    expect(understood?.primaryIntent).toBe("greeting");
  });

  it("keeps a name or a size on the fast path", () => {
    expect(fastPathUnderstanding("esmi Aymen")?.customerName).toBe("Aymen");
    expect(fastPathUnderstanding("L", true)?.size).toBe("L");
  });

  it("still sends product and address lines to the model", () => {
    expect(fastPathUnderstanding("n7eb sweat jaune taille L")).toBeNull();
    expect(fastPathUnderstanding("noskon fi Tunis 9rib pharmacie el manar")).toBeNull();
  });

  it("starts a text turn much sooner than a photo", () => {
    expect(burstDelayMs("text")).toBeLessThan(400);
    expect(burstDelayMs("image")).toBeGreaterThan(burstDelayMs("text"));
  });
});
