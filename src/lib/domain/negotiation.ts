/**
 * Deterministic negotiation ladder (SPEC "Negotiation"). The model never
 * picks a price: rungs concede 50%, then 80%, then 100% of the seller's max
 * discount (price - floor). Every offer is rounded up to 0.5 DT and clamped
 * at the floor. A buyer counter at or above the next rung is accepted as-is.
 * All amounts integer millimes.
 */

export const LADDER_FRACTIONS = [0.5, 0.8, 1] as const;

export interface NegotiationState {
  /** Number of offers already made (0..3). */
  rung: number;
  /** Last offer made by the seller side, in millimes. */
  lastOfferMillimes: number | null;
  /** Price the buyer accepted (counter accepted, or final agreement). */
  agreedMillimes: number | null;
  final: boolean;
}

export const EMPTY_NEGOTIATION: NegotiationState = {
  rung: 0,
  lastOfferMillimes: null,
  agreedMillimes: null,
  final: false,
};

/** Rounds millimes up to the next 0.5 DT (500 millimes). */
export function ceilToHalfDinar(millimes: number): number {
  return Math.ceil(millimes / 500) * 500;
}

export function rungOfferMillimes(priceMillimes: number, floorMillimes: number, rung: number): number {
  const fraction = LADDER_FRACTIONS[Math.min(Math.max(rung, 0), LADDER_FRACTIONS.length - 1)];
  const maxDiscount = Math.max(0, priceMillimes - floorMillimes);
  const raw = priceMillimes - Math.round(maxDiscount * fraction);
  return Math.min(priceMillimes, Math.max(floorMillimes, ceilToHalfDinar(raw)));
}

export interface NegotiationResult {
  state: NegotiationState;
  /** The amount to state to the buyer this turn (offer or accepted counter). */
  offerMillimes: number;
  acceptedCounter: boolean;
  isFinal: boolean;
}

export function nextNegotiationStep(input: {
  priceMillimes: number;
  floorMillimes: number;
  state: NegotiationState;
  counterOfferMillimes?: number | null;
}): NegotiationResult {
  const { priceMillimes, floorMillimes } = input;
  const rung = Math.min(input.state.rung, LADDER_FRACTIONS.length - 1);
  const stepOffer = rungOfferMillimes(priceMillimes, floorMillimes, rung);
  const isFinal = rung >= LADDER_FRACTIONS.length - 1;

  const counter = input.counterOfferMillimes ?? null;
  if (counter !== null && counter >= stepOffer) {
    const accepted = Math.min(priceMillimes, Math.max(floorMillimes, counter));
    return {
      state: { rung: rung + 1, lastOfferMillimes: accepted, agreedMillimes: accepted, final: true },
      offerMillimes: accepted,
      acceptedCounter: true,
      isFinal: true,
    };
  }

  return {
    state: {
      rung: rung + 1,
      lastOfferMillimes: stepOffer,
      agreedMillimes: isFinal ? stepOffer : input.state.agreedMillimes,
      final: isFinal,
    },
    offerMillimes: stepOffer,
    acceptedCounter: false,
    isFinal,
  };
}

/** Agreed unit price for the summary: explicit agreement, else last offer, else list. */
export function agreedUnitMillimes(state: NegotiationState, listPriceMillimes: number): number {
  return state.agreedMillimes ?? state.lastOfferMillimes ?? listPriceMillimes;
}

export function parseNegotiationState(raw: unknown): NegotiationState {
  if (!raw || typeof raw !== "object") return { ...EMPTY_NEGOTIATION };
  const r = raw as Record<string, unknown>;
  return {
    rung: typeof r.rung === "number" ? Math.max(0, Math.floor(r.rung)) : 0,
    lastOfferMillimes: typeof r.lastOfferMillimes === "number" ? r.lastOfferMillimes : null,
    agreedMillimes: typeof r.agreedMillimes === "number" ? r.agreedMillimes : null,
    final: r.final === true,
  };
}
