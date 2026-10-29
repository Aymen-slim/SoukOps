/**
 * Derja (Tunisian dialect) parsing helpers. Pure functions, unit-tested.
 * Money is always integer millimes (1 DT = 1000 millimes).
 */

// Arabizi digit substitutions used when writing Derja in Latin script.
const ARABIZI_DIGITS: Record<string, string> = {
  "2": "ء", // hamza (a)
  "3": "ع", // ain
  "5": "خ", // kha
  "7": "ح", // ha
  "8": "غ", // ghin
  "9": "ق", // qaf
};

export function arabiziToArabic(text: string): string {
  return text.replace(/[235789]/g, (d) => ARABIZI_DIGITS[d] ?? d);
}

const MONEY_WORDS: Record<string, number> = {
  malyoun: 1_000_000, // 1000 DT in millimes
  مليون: 1_000_000,
  alf: 1_000, // "170 alf" = 170 DT -> multiplier handled in parser
  ألف: 1_000,
};

/**
 * Parses Derja money expressions into millimes.
 * "170 alf" -> 170_000 (170 DT), "malyoun" -> 1_000_000 (1000 DT),
 * "180 dt" / "180DT" / "180,500" (with DT) -> millimes.
 */
export function parseMoneyMillimes(text: string): number | null {
  const normalized = text.toLowerCase().trim();

  if (/\bmalyoun\b|مليون/.test(normalized)) return MONEY_WORDS.malyoun;

  const alfMatch = normalized.match(/(\d{1,6})\s*(?:alf|ألف)\b/);
  if (alfMatch) return Number(alfMatch[1]) * 1_000; // n alf = n DT = n*1000 millimes

  const dtMatch = normalized.match(/(\d{1,6})(?:[.,](\d{1,3}))?\s*(?:dt|dinar|دينار)\b/);
  if (dtMatch) {
    const dinars = Number(dtMatch[1]);
    const fraction = dtMatch[2] ? Number(dtMatch[2].padEnd(3, "0")) : 0;
    return dinars * 1_000 + fraction;
  }
  return null;
}

/** Normalizes a Tunisian phone to +216XXXXXXXX, or null when it is not one. */
export function normalizeTunisianPhone(raw: string): string | null {
  const digits = raw.replace(/[\s.\-()]/g, "").replace(/^\+/, "");
  if (/^216\d{8}$/.test(digits)) return `+${digits}`;
  if (/^\d{8}$/.test(digits)) return `+216${digits}`;
  if (/^00216\d{8}$/.test(digits)) return `+216${digits.slice(5)}`;
  return null;
}

/** Small Derja glossary used for keyword biasing and intent hints. */
export const DERJA_GLOSSARY: Record<string, string> = {
  n7eb: "I want",
  نحب: "I want",
  soum: "price",
  سوم: "price",
  ghali: "expensive",
  غالي: "expensive",
  na9es: "reduce (the price)",
  نقص: "reduce (the price)",
  akher: "last/final",
  آخر: "last/final",
  win: "where",
  وين: "where",
  b9addech: "how much",
  بقداش: "how much",
  mawjoud: "available/in stock",
  موجود: "available/in stock",
  taw: "now",
  تو: "now",
  ghodwa: "tomorrow",
  غدوة: "tomorrow",
};

export function glossaryHits(text: string): string[] {
  const lower = text.toLowerCase();
  return Object.keys(DERJA_GLOSSARY).filter((w) => lower.includes(w.toLowerCase()));
}
