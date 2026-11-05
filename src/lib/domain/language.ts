/**
 * Buyer-language detection: deterministic, no model call, so cassette keys
 * stay stable. The first buyer message sets the conversation language; a
 * later message switches it only on a clear signal (a borrowed word like
 * "merci" never flips the chat). Slot-only replies ("L", a phone number)
 * detect as null and keep the current language. Pure functions, unit-tested.
 */

export type BuyerLanguage = "derja" | "ar" | "fr" | "en";
export type TextScript = "arabic" | "latin";

/** Script of a buyer message, tracked separately from its language. */
export function detectTextScript(text: string): TextScript | null {
  const arabicChars = (text.match(ARABIC_SCRIPT) ?? []).length;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters === 0) return null;
  return arabicChars >= letters * 0.3 ? "arabic" : "latin";
}

export function buyerScriptOf(slots: Record<string, unknown>): TextScript | null {
  return slots.buyerScript === "arabic" || slots.buyerScript === "latin" ? slots.buyerScript : null;
}

export function isBuyerLanguage(value: unknown): value is BuyerLanguage {
  return value === "derja" || value === "ar" || value === "fr" || value === "en";
}

export interface LanguageDetection {
  language: BuyerLanguage;
  confident: boolean;
  score: number;
}

const ARABIC_SCRIPT = /[\u0600-\u06FF]/g;
// Tunisian Derja written in Arabic script. These words mark the dialect, so
// Arabic-script Tunisian must classify as Derja, never as MSA by default.
const DERJA_ARABIC =
  /(نحب|نحبّ|بقداش|بقدّاش|قداش|شحال|فما|فمّة|برشا|برشة|توا|توّة|كيفاش|علاش|وين|شنو|شنوة|اشنو|هكا|هكّة|هذاكا|ياسر|برك|مريقل|عيشك|ابعتلي|ابعثلي|نكمّلو|نكملو|متاعي|متاعك)/;
const DERJA_STRONG =
  /\b(n7eb|n7ab|b9addech|b9adech|b9adech|mawjoud|mawjouda|3aychek|mrigel|chnowa|chnia|win\s+toskon|noskon|el\s+produit|hedha|hedhi|taw|barcha|fama|famma|yasser|na9esli|ghalia|soumou|ab3atli|ousifli|nkammlou|tkammel|esmek|numeri|wilaya|a9reb|ba7dha|9rib|ch7al)\b/i;
const DERJA_DIGIT_WORD = /\b\w*[23579]\w*\b/;
const FR_WORDS =
  /\b(bonjour|bonsoir|salut|merci|je|vous|votre|vos|veux|voudrais|commander|commande|prix|livraison|livrer|adresse|disponible|taille|couleur|combien|quel|quelle|quels|quelles|est-ce|stp|s'il vous plaît|monsieur|madame|produit|article|acheter|livrez|gouvernorat)\b/gi;
const EN_WORDS =
  /\b(hello|hi|hey|please|thanks|thank|i|want|would|like|order|price|delivery|deliver|address|available|size|color|colour|how|much|what|where|this|that|product|buy|shipping)\b/gi;

function wordHits(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

/**
 * Classifies one buyer message. `confident` means the signal is strong
 * enough to set/switch the conversation language on its own.
 */
export function detectBuyerLanguage(text: string): LanguageDetection | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // Slot-only replies carry no language signal.
  if (/^[\d\s.+()-]+$/.test(trimmed)) return null;
  if (/^(s|m|l|xl|xxl|xs|3xl|2xl|3[6-9]|4[0-6])[.!?\s]*$/i.test(trimmed)) return null;

  const arabicChars = (trimmed.match(ARABIC_SCRIPT) ?? []).length;
  const letters = (trimmed.match(/\p{L}/gu) ?? []).length;
  if (arabicChars >= 2 && arabicChars >= letters * 0.3) {
    // Tunisian words in Arabic script mean Derja. Plain Arabic script with
    // no Tunisian marker stays "ar" (MSA) as before.
    if (DERJA_ARABIC.test(trimmed)) {
      return { language: "derja", confident: true, score: arabicChars };
    }
    return { language: "ar", confident: arabicChars >= 4, score: arabicChars };
  }

  const lower = trimmed.toLowerCase();
  const derjaScore =
    (DERJA_STRONG.test(lower) ? 2 : 0) +
    (DERJA_DIGIT_WORD.test(lower) ? 2 : 0) +
    wordHits(lower, /\b(el|fel|mte3|mtaa|hedha|hedhi|taw|ken|bch|ma3a|a9reb)\b/gi);
  const frScore = wordHits(lower, FR_WORDS);
  const enScore = wordHits(lower, EN_WORDS);

  const scored: Array<{ language: BuyerLanguage; score: number }> = [
    { language: "derja" as BuyerLanguage, score: derjaScore },
    { language: "fr" as BuyerLanguage, score: frScore },
    { language: "en" as BuyerLanguage, score: enScore },
  ];
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score === 0) return null;
  // A single marker word is a hint, not a switch: confident needs 2+ markers
  // (or one strong Derja form, scored 2 above). Greetings count double when
  // they open the message ("Bonjour, ..." is how a French chat starts).
  const greetingBoost = /^(bonjour|bonsoir|salut|hello|hi|hey|ahla|marhba|salam|slm)\b/i.test(lower) ? 1 : 0;
  const confident = best.score + greetingBoost >= 2 && best.score > (scored[1]?.score ?? 0);
  return { language: best.language, confident, score: best.score };
}

/**
 * The language to store for the next reply, or null to keep the current one.
 * The first message sets it on any detection; later changes need confidence.
 */
export function resolveBuyerLanguage(
  current: unknown,
  text: string,
  opts?: { fromAudio?: boolean },
): BuyerLanguage | null {
  const detected = detectBuyerLanguage(text);
  if (!detected) return null;
  // A voice transcript is ASR output, not the buyer's chosen written
  // language: on a weak signal it must never set or switch the conversation
  // away from the Derja default.
  if (opts?.fromAudio && !detected.confident) return null;
  if (!isBuyerLanguage(current)) return detected.language;
  if (detected.language === current) return null;
  return detected.confident ? detected.language : null;
}

export function buyerLanguageOf(slots: Record<string, unknown>): BuyerLanguage | null {
  return isBuyerLanguage(slots.buyerLanguage) ? slots.buyerLanguage : null;
}
