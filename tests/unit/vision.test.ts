import { describe, expect, it } from "vitest";
import {
  catalogPhotoPath,
  distanceToSimilarity,
  findInStockAlternative,
  gateForScore,
  parseChoice,
  pickByHint,
  type MatchCandidate,
} from "@/lib/pipeline/vision";

function candidate(partial: Partial<MatchCandidate>): MatchCandidate {
  return {
    productId: "p1",
    productImageId: "img1",
    name: "Sweat jaune",
    categoryPhrase: "sweatshirt",
    priceMillimes: 110_000,
    floorMillimes: 95_000,
    stock: 4,
    cropPath: "product-07-crop.png",
    sourcePath: "product-07.jpeg",
    similarity: 0.9,
    ...partial,
  };
}

describe("catalog photo shown to the buyer", () => {
  it("keeps the original photo with the model, and falls back to the crop", () => {
    expect(catalogPhotoPath({ sourcePath: "product-07.jpeg", cropPath: "product-07-crop.png" })).toBe(
      "product-media:product-07.jpeg",
    );
    expect(catalogPhotoPath({ sourcePath: null, cropPath: "product-07-crop.png" })).toBe("crops:product-07-crop.png");
    expect(catalogPhotoPath({ sourcePath: null, cropPath: null })).toBeNull();
  });
});

describe("vision gate (SPEC step 4: 0.85 / 0.60)", () => {
  it("proposes at or above 0.85", () => {
    expect(gateForScore(0.85)).toBe("propose");
    expect(gateForScore(0.99)).toBe("propose");
  });

  it("sends buttons between 0.60 and 0.85", () => {
    expect(gateForScore(0.849)).toBe("buttons");
    expect(gateForScore(0.6)).toBe("buttons");
  });

  it("declares unmatched below 0.60", () => {
    expect(gateForScore(0.599)).toBe("unmatched");
    expect(gateForScore(0)).toBe("unmatched");
  });

  it("converts pgvector cosine distance to similarity", () => {
    expect(distanceToSimilarity(0)).toBe(1);
    expect(distanceToSimilarity(0.08)).toBeCloseTo(0.92);
    expect(distanceToSimilarity(2)).toBe(-1); // clamped
  });
});

describe("out-of-stock alternative", () => {
  it("picks the nearest in-stock product, skipping the chosen one", () => {
    const chosen = candidate({ productId: "oos", stock: 0, similarity: 0.95 });
    const alsoOut = candidate({ productId: "oos2", stock: 0, similarity: 0.9 });
    const alt = candidate({ productId: "alt", stock: 3, similarity: 0.8 });
    expect(findInStockAlternative([chosen, alsoOut, alt], "oos")?.productId).toBe("alt");
  });

  it("returns null when nothing else is in stock", () => {
    const chosen = candidate({ productId: "oos", stock: 0 });
    expect(findInStockAlternative([chosen], "oos")).toBeNull();
  });
});

describe("disambiguation ladder helpers", () => {
  const left = { box: { left: 0, top: 0, right: 100, bottom: 200 }, best: candidate({ name: "Sweat jaune" }) };
  const right = { box: { left: 300, top: 0, right: 400, bottom: 200 }, best: candidate({ name: "Hoodie noir" }) };

  it("resolves left/right spatial hints by box position", () => {
    expect(pickByHint([left, right], "the one on the left")).toBe(0);
    expect(pickByHint([left, right], "elli 3al ymin")).toBe(1);
    expect(pickByHint([right, left], "gauche")).toBe(1); // sorted by centre, not array order of names
  });

  it("resolves a color word against catalog names", () => {
    expect(pickByHint([left, right], "n7eb el jaune")).toBe(0);
    expect(pickByHint([left, right], "el noir hedha")).toBe(1);
  });

  it("stays ambiguous without a usable hint", () => {
    expect(pickByHint([left, right], "n7eb hedha")).toBeNull();
    expect(pickByHint([], "left")).toBeNull();
  });

  it("parses buyer choices in digits, words and button titles", () => {
    expect(parseChoice("1", 3)).toBe(0);
    expect(parseChoice("produit 2", 3)).toBe(1);
    expect(parseChoice("2 · Sweat jaune", 3)).toBe(1);
    expect(parseChoice("٢", 3)).toBe(1); // Arabic-Indic digit
    expect(parseChoice("premier", 3)).toBe(0);
    expect(parseChoice("4", 3)).toBeNull(); // out of range
    expect(parseChoice("n7ebou barcha", 3)).toBeNull();
  });
});
