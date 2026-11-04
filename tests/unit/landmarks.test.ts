import { describe, expect, it } from "vitest";
import {
  dedupeLandmarkCandidates,
  haversineKm,
  isAmbiguousPair,
  landmarkMatchesAny,
  landmarkNamesMatch,
  landmarkQueryVariants,
  parseGooglePlacesResponse,
  rankLandmarks,
  triangulate,
  type LandmarkCandidate,
} from "@/lib/domain/landmarks";

function landmark(partial: Partial<LandmarkCandidate>): LandmarkCandidate {
  return {
    id: "lm1",
    name: "Pharmacie de Nuit",
    governorate: "Tunis",
    delegation: null,
    lat: 36.8065,
    lng: 10.1815,
    score: 0.9,
    ...partial,
  };
}

describe("landmarks domain core", () => {
  it("computes haversine distances (Tunis centre -> Ariana ≈ 7 km)", () => {
    const km = haversineKm({ lat: 36.8065, lng: 10.1815 }, { lat: 36.866, lng: 10.164 });
    expect(km).toBeGreaterThan(5);
    expect(km).toBeLessThan(9);
    expect(haversineKm({ lat: 36.8, lng: 10.18 }, { lat: 36.8, lng: 10.18 })).toBe(0);
  });

  it("builds query variants: raw, cleaned, diacritic-free, and coffee shop synonyms", () => {
    const variants = landmarkQueryVariants("Près de Café El Ali");
    expect(variants[0]).toBe("Près de Café El Ali");
    expect(variants).toContain("café el ali");
    expect(variants).toContain("cafe el ali");

    const coffeeVariants = landmarkQueryVariants("ba7dha coffee shop Cosmitto Ennasr");
    expect(coffeeVariants).toContain("cafe cosmitto ennasr");
    expect(coffeeVariants).toContain("cosmitto ennasr");

    const derjaCafe = landmarkQueryVariants("9rib le 9ahwet El Baraka Ariana");
    expect(derjaCafe).toContain("cafe el baraka ariana");
    expect(derjaCafe).toContain("el baraka ariana");

    const streetVariants = landmarkQueryVariants("wra jema3 El Ghofrane chera3 Habib Bourguiba");
    expect(streetVariants.some((v) => v.includes("mosquee el ghofrane"))).toBe(true);
    expect(streetVariants.some((v) => v.includes("avenue habib bourguiba"))).toBe(true);
  });

  it("thresholds and ranks candidates (RPC has no minimum score)", () => {
    const ranked = rankLandmarks([
      landmark({ id: "low", score: 0.2 }),
      landmark({ id: "high", score: 0.9 }),
      landmark({ id: "mid", score: 0.5 }),
    ]);
    expect(ranked.map((c) => c.id)).toEqual(["high", "mid"]);
  });

  it("matches a stated landmark against a confirmed one for pin reuse", () => {
    expect(landmarkNamesMatch("Pharmacie de Nuit El Manar", "Pharmacie de Nuit El Manar")).toBe(true);
    expect(landmarkNamesMatch("pharmacie el manar", "Pharmacie de Nuit El Manar")).toBe(true);
    expect(landmarkNamesMatch("Café El Ali", "cafe el ali")).toBe(true);
    // A different place must never match: reuse would ship to the old address.
    expect(landmarkNamesMatch("Pharmacie de Nuit Ariana", "Pharmacie de Nuit El Manar")).toBe(false);
    expect(landmarkNamesMatch("Café El Ali", "Pharmacie de Nuit El Manar")).toBe(false);
    expect(landmarkNamesMatch("Pharmacie de Nuit El Manar", null)).toBe(false);
    expect(landmarkNamesMatch("", "Pharmacie de Nuit El Manar")).toBe(false);
    expect(landmarkMatchesAny(["Café El Ali", "pharmacie el manar"], "Pharmacie de Nuit El Manar")).toBe(true);
    expect(landmarkMatchesAny(["Café El Ali"], "Pharmacie de Nuit El Manar")).toBe(false);
    expect(landmarkMatchesAny([], "Pharmacie de Nuit El Manar")).toBe(false);
  });

  it("triangulates the closest candidate pair and its midpoint", () => {
    const first = [
      landmark({ id: "a1", lat: 36.8, lng: 10.18 }),
      landmark({ id: "a2", lat: 36.9, lng: 10.3 }),
    ];
    const second = [
      landmark({ id: "b1", lat: 36.801, lng: 10.181 }),
      landmark({ id: "b2", lat: 37.2, lng: 10.6 }),
    ];
    const pair = triangulate(first, second);
    expect(pair?.a.id).toBe("a1");
    expect(pair?.b.id).toBe("b1");
    expect(pair?.distanceKm).toBeLessThan(0.5);
    expect(pair?.midpoint.lat).toBeCloseTo(36.8005, 3);
  });

  it("parses Google Places hits in relevance order and drops non-Tunisia results", () => {
    const parsed = parseGooglePlacesResponse(
      {
        places: [
          {
            id: "p1",
            displayName: { text: "Café El Ali" },
            formattedAddress: "El Manar, Tunis, Tunisie",
            location: { latitude: 36.84, longitude: 10.16 },
          },
          {
            id: "p2",
            displayName: { text: "Far Away" },
            formattedAddress: "Paris, France",
            location: { latitude: 48.85, longitude: 2.35 },
          },
          {
            id: "p3",
            displayName: { text: "Pharmacie de Nuit" },
            formattedAddress: "Ariana, Tunisie",
            location: { latitude: 36.86, longitude: 10.19 },
          },
        ],
      },
      { governorate: "Tunis", delegation: null },
    );
    expect(parsed.map((c) => c.name)).toEqual(["Café El Ali", "Pharmacie de Nuit"]);
    expect(parsed[0].source).toBe("google");
    expect(parsed[0].id).toBe("google-p1");
    expect(parsed[0].score).toBeGreaterThan(parsed[1].score);
    expect(parseGooglePlacesResponse(null)).toEqual([]);
    expect(parseGooglePlacesResponse({})).toEqual([]);
  });

  it("re-ranks Google hits nearest to the buyer's city anchor first", () => {
    const parsed = parseGooglePlacesResponse(
      {
        places: [
          {
            id: "sfax",
            displayName: { text: "Café Cosmitto" },
            formattedAddress: "Sfax, Tunisie",
            location: { latitude: 34.7406, longitude: 10.7603 },
          },
          {
            id: "ennasr",
            displayName: { text: "Café Cosmitto" },
            formattedAddress: "Ennasr, Ariana, Tunisie",
            location: { latitude: 36.862, longitude: 10.161 },
          },
        ],
      },
      { governorate: "Ariana", delegation: "Ennasr" },
      { anchor: { lat: 36.8617, lng: 10.1604 }, query: "Café Cosmitto" },
    );
    expect(parsed.map((c) => c.id)).toEqual(["google-ennasr", "google-sfax"]);
    expect(parsed[0].score).toBeGreaterThan(parsed[1].score);
  });

  it("drops Google hits that share no distinctive name token with the query", () => {
    const parsed = parseGooglePlacesResponse(
      {
        places: [
          {
            id: "generic",
            displayName: { text: "Café Central" },
            formattedAddress: "Sahloul, Sousse, Tunisie",
            location: { latitude: 35.8354, longitude: 10.5906 },
          },
        ],
      },
      { governorate: "Sousse", delegation: "Sahloul" },
      { anchor: { lat: 35.8354, lng: 10.5906 }, query: "Café Zzqxwv Invented" },
    );
    expect(parsed).toEqual([]);
  });

  it("dedupes merged candidate lists keeping the best score, nearest first", () => {
    const merged = dedupeLandmarkCandidates([
      landmark({ id: "google-a", lat: 36.862, lng: 10.161, score: 0.7, source: "google" }),
      landmark({ id: "google-a", lat: 36.862, lng: 10.161, score: 0.95, source: "google" }),
      landmark({ id: "google-b", lat: 36.9, lng: 10.2, score: 0.8, source: "google" }),
      landmark({ id: "osm-same", lat: 36.862, lng: 10.161, score: 0.6, source: "nominatim" }),
    ]);
    expect(merged.map((c) => c.id)).toEqual(["google-a", "google-b"]);
    expect(merged[0].score).toBe(0.95);
  });

  it("flags only close named candidates as ambiguous", () => {
    const top = landmark({ id: "g1", score: 0.9, source: "google" });
    expect(isAmbiguousPair(top, landmark({ id: "g2", lat: 36.81, lng: 10.19, score: 0.88, source: "google" }))).toBe(true);
    expect(isAmbiguousPair(top, landmark({ id: "g2", lat: 36.81, lng: 10.19, score: 0.8, source: "google" }))).toBe(false);
    // A same-named Google branch kilometres away is not an alternative.
    expect(isAmbiguousPair(top, landmark({ id: "g3", lat: 36.9, lng: 10.3, score: 0.89, source: "google" }))).toBe(false);
    expect(isAmbiguousPair(top, landmark({ id: "n1", lat: 36.9, lng: 10.3, score: 0.89, source: "neighborhood" }))).toBe(false);
    expect(isAmbiguousPair(top, undefined)).toBe(false);
    expect(isAmbiguousPair(top, top)).toBe(false);
  });
});
