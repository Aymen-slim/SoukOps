/**
 * Delivery-risk engine (SPEC "Risk and confirmation"). Deterministic:
 * score starts at 100, each signal deducts a fixed amount, every deduction
 * produces a readable reason for the seller dashboard. Only the
 * pin-distance signal is spec-fixed (-10 beyond 2 km); the history weights
 * below are the Day 5 defaults.
 */

export const PIN_FAR_KM = 2;
export const PIN_FAR_PENALTY = 10;

export type RiskLevel = "green" | "yellow" | "red";

export interface RiskInput {
  /** Prior event kinds for this customer: delivered | returned | cancelled. */
  historyKinds: string[];
  /** Confirmed pin distance from the named landmark, when known. */
  pinDistanceKm?: number | null;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export function riskLevelForScore(score: number): RiskLevel {
  if (score >= 70) return "green";
  if (score >= 40) return "yellow";
  return "red";
}

export function computeRisk(input: RiskInput): RiskResult {
  let score = 100;
  const reasons: string[] = [];
  const count = (kind: string) => input.historyKinds.filter((k) => k === kind).length;

  const returned = count("returned");
  if (returned > 0) {
    const penalty = Math.min(60, returned * 30);
    score -= penalty;
    reasons.push(`${returned} previous return(s) (-${penalty})`);
  }
  const cancelled = count("cancelled");
  if (cancelled > 0) {
    const penalty = Math.min(30, cancelled * 15);
    score -= penalty;
    reasons.push(`${cancelled} cancelled order(s) (-${penalty})`);
  }
  const delivered = count("delivered");
  if (delivered > 0) {
    reasons.push(`${delivered} successful delivery(s)`);
  }
  if (input.historyKinds.length === 0) {
    score -= 10;
    reasons.push("First order, no history yet (-10)");
  }
  if (input.pinDistanceKm !== null && input.pinDistanceKm !== undefined && input.pinDistanceKm > PIN_FAR_KM) {
    score -= PIN_FAR_PENALTY;
    reasons.push(
      `Pin is ${input.pinDistanceKm.toFixed(1)} km from the landmark (-${PIN_FAR_PENALTY})`,
    );
  }

  score = Math.min(100, Math.max(0, score));
  return { score, level: riskLevelForScore(score), reasons };
}
