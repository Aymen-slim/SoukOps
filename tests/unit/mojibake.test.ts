import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repairMojibake } from "@/lib/sim/chat-ui";

const MOJIBAKE = ["Ã©", "Ã¨", "Â·", "â€¢", "â€”", "ðŸ‘‡", "ØŒ"];

describe("mojibake repair", () => {
  it("repairs double-encoded chat text", () => {
    expect(repairMojibake("L9it barcha produits fel taswira ðŸ‘‡")).toBe("L9it barcha produits fel taswira 👇");
    expect(repairMojibake("RÃ©cap el commande: â€¢ TÃ©lÃ©phone â€” repÃ¨re")).toBe("Récap el commande: • Téléphone — repère");
    expect(repairMojibake("1 Â· Hoodie")).toBe("1 · Hoodie");
  });

  it("leaves clean Derja and French untouched", () => {
    expect(repairMojibake("Merhba, b9addech el hoodie? café · mosquée")).toBe("Merhba, b9addech el hoodie? café · mosquée");
    expect(repairMojibake("")).toBe("");
  });

  it("chat templates in the pipeline contain no mojibake", () => {
    for (const rel of ["src/lib/pipeline/handleTurn.ts", "src/lib/pipeline/order.ts"]) {
      const source = readFileSync(join(process.cwd(), rel), "utf8");
      for (const seq of MOJIBAKE) {
        expect(source, `${rel} contains ${seq}`).not.toContain(seq);
      }
    }
  });
});
