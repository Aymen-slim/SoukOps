import { lookupLocality } from "@/lib/geo/tunisia";

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

const STOCK_WORDS = /(mawjoud|mawjouda|mazel|famma menou|disponible|en stock|متوفر|موجود)/;
const PRICE_WORDS = /(b9addech|b9adech|soum|prix|combien|قداش|بقداش|شحال)/;
const BARGAIN_WORDS = /(na9es|na9as|n9es|ghali|ghalia|remise|rabais|moins cher|أرخص|نقص|غالي)/;
const PRICE_QUESTION = /(b9addech|b9adech|combien|قداش|بقداش|شحال)/;

/**
 * Deterministic intent refinement over the model's proposal: unambiguous
 * Derja price/availability wording wins, so "mawjoud fel stock?" is never
 * answered as a price question. Explicit discount wording ("na9esli",
 * "ghalia") is a bargain even when the word "soum" appears — unless the
 * buyer is plainly asking the price ("b9addech").
 */
export function refinePrimaryIntent(text: string, modelIntent: string): string {
  const lower = text.toLowerCase();
  const asksStock = STOCK_WORDS.test(lower);
  const asksPrice = PRICE_WORDS.test(lower);
  if (BARGAIN_WORDS.test(lower) && !PRICE_QUESTION.test(lower)) return "bargain";
  if (asksStock && !asksPrice) return "ask_stock";
  if (asksPrice && !asksStock && modelIntent !== "bargain") return "ask_price";
  return modelIntent;
}

const SIZE_MAP: Record<string, string> = {
  small: "S",
  medium: "M",
  large: "L",
};

function normalizeSizeToken(raw: string): string {
  const clean = raw.trim().toLowerCase();
  return SIZE_MAP[clean] ?? clean.toUpperCase();
}

/**
 * Deterministically extracts clothing/shoe size from buyer text or caption so
 * size is never lost when the buyer sends an image + size or a short reply.
 */
export function extractSize(text: string, expectingSize = false): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1. Explicit keyword: "taille L", "size M", "قياس XL", "taille: 40"
  const explicit = trimmed.match(
    /(?:taille|size|taill|tay|قياس|مقاس|pointure)\s*[:=\-]?\s*(3xl|2xl|xxl|xl|xs|s|m|l|small|medium|large|3[6-9]|4[0-6])\b/i,
  );
  if (explicit) return normalizeSizeToken(explicit[1]);

  // 2. Multi-letter sizes (XS, XL, XXL, 2XL, 3XL) are unambiguous anywhere
  const multiLetter = trimmed.match(/\b(3xl|2xl|xxl|xl|xs)\b/i);
  if (multiLetter) return normalizeSizeToken(multiLetter[1]);

  // 3. Preposition + size: "en L", "fi M", "b taille S"
  const prep = trimmed.match(/\b(?:en|fi)\s+(s|m|l|small|medium|large)\b/i);
  if (prep) return normalizeSizeToken(prep[1]);

  // 4. Standalone short reply: "L", "M", "S", "medium", "40" (with optional polite words)
  const standalone = trimmed.match(
    /^\s*(?:el\s+|la\s+)?(s|m|l|small|medium|large|3[6-9]|4[0-6])(?:\s+(?:svp|stp|brabi|بربي|3aychek|عيشك|please|plz|ok|mrigel))?\s*[.!؟?,]*$/i,
  );
  if (standalone) {
    const token = standalone[1];
    // Numeric standalone only when expecting a size (avoids matching random numbers)
    if (/^\d+$/.test(token) && !expectingSize) return null;
    return normalizeSizeToken(token);
  }

  // 5. Garment/color/demonstrative followed by a size token: "n7eb hedha L", "sweat jaune M"
  const afterGarment = trimmed.match(
    /\b(?:hedha|hethi|hadha|hathi|sweat|hoodie|pull|veste|robe|pantalon|jean|t-shirt|tshirt|chemise|survêtement|survetement|jaune|noir|blanc|bleu|vert|rose|rouge|beige|asfar|akhal|abyad)\s+(s|m|l|small|medium|large)\b(?:\s|$|[.!?,])/i,
  );
  if (afterGarment) return normalizeSizeToken(afterGarment[1]);

  // 6. Uppercase standalone S/M/L token inside a mixed/lowercase sentence (e.g. "n7eb L brabi")
  if (/[a-z]/.test(trimmed)) {
    const upperToken = trimmed.match(/(?:^|\s)(S|M|L)(?=\s|$|[.!?,])/);
    if (upperToken) return upperToken[1];
  }

  return null;
}

/**
 * Pulls a buyer name from an explicit introduction ("esmi Aymen",
 * "je m'appelle Sarra"). Stops before a phone or a following clause.
 */
export function extractCustomerName(text: string): string | null {
  const match = text.match(
    /(?:esmi|ismi|ismy|je m['’]appelle|my name is|اسمي)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]{0,30}(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]{0,30}){0,2})/i,
  );
  if (!match) return null;
  const name = match[1].replace(/\b(?:w|ou|and|et|numeri|numero|numéro|telephone|téléphone)\b.*$/i, "").trim();
  return name.length >= 2 ? name : null;
}

const NAME_BLOCKLIST =
  /\b(hoodie|sweat|robe|dress|pantalon|jean|produit|product|taille|size|livraison|prix|soum|commande|order|photo|taswira|merci|bonjour|salut|hello|ahla|marhba|ok|oui|non|yes)\b/i;

/**
 * Bare name in a bundled identity reply ("Ahmed 55123456",
 * "Sarra Ben Ali, 22123456"). Only fires when a phone is present in the
 * same message — that is the signal the buyer is answering name + number
 * together — and the rest is one to three plain name words.
 */
export function extractNameWithPhone(text: string): string | null {
  if (!extractPhone(text)) return null;
  const rest = text
    .replace(/(?:\+216|00216)?[\s.\-()]*[24579]\d(?:[\s.\-()]*\d){6}\b/g, " ")
    .replace(/\b(?:esmi|ismi|je m['’]appelle|my name is|numero|numéro|tel|téléphone|telephone|numeri)\b/gi, " ")
    .replace(/[,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!rest || NAME_BLOCKLIST.test(rest)) return null;
  if (!/^[A-Za-zÀ-ÿ\u0600-\u06FF][A-Za-zÀ-ÿ\u0600-\u06FF'’-]*(\s+[A-Za-zÀ-ÿ\u0600-\u06FF][A-Za-zÀ-ÿ\u0600-\u06FF'’-]*){0,2}$/.test(rest)) {
    return null;
  }
  return rest.length >= 2 ? rest : null;
}

/** Extracts a Tunisian phone number embedded anywhere inside a buyer message. */
export function extractPhone(text: string): string | null {
  const direct = normalizeTunisianPhone(text);
  if (direct) return direct;
  const embedded = text.match(/(?:\+216|00216)?[\s.\-()]*([24579]\d(?:[\s.\-()]*\d){6})\b/);
  if (!embedded) return null;
  return normalizeTunisianPhone(embedded[0]);
}

/** Extracts explicit item quantity ("2 ka3bet", "zouj", "x2") when stated. */
export function extractQuantity(text: string): number | null {
  const lower = text.toLowerCase();
  const explicit = lower.match(/(?:\bx\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:ka3bet|ka3ba|k3ab|pièces|pieces|pcs|قطع|كعبات)\b)/i);
  if (explicit) {
    const n = Number(explicit[1] ?? explicit[2]);
    if (n >= 1 && n <= 20) return n;
  }
  if (/\b(?:zouj|zouz)\b|زوج/.test(lower)) return 2;
  if (/\b(?:tlatha|tletha)\b|ثلاثة/.test(lower)) return 3;
  return null;
}

const COLOR_WORDS: Array<{ canonical: string; words: string[] }> = [
  { canonical: "noir", words: ["noir", "black", "akhal", "aswad", "اكحل", "اسود"] },
  { canonical: "blanc", words: ["blanc", "white", "abyad", "abyadh", "ابيض"] },
  { canonical: "bleu", words: ["bleu", "blue", "azra9", "azrak", "ازرق"] },
  { canonical: "rouge", words: ["rouge", "red", "a7mar", "ahmar", "احمر"] },
  { canonical: "jaune", words: ["jaune", "yellow", "asfar", "اصفر"] },
  { canonical: "rose", words: ["rose", "pink", "wardi", "وردي"] },
  { canonical: "vert", words: ["vert", "green", "a5dar", "akhdar", "اخضر"] },
  { canonical: "beige", words: ["beige", "بيج"] },
  { canonical: "gris", words: ["gris", "grey", "gray", "ramadi"] },
];

/** First canonical colour mentioned in the text, or null. */
export function extractColor(text: string): string | null {
  const lower = ` ${text.toLowerCase()} `;
  for (const entry of COLOR_WORDS) {
    for (const w of entry.words) {
      if (/^[a-z0-9]+$/.test(w) ? new RegExp(`\\b${w}\\b`).test(lower) : lower.includes(w)) return entry.canonical;
    }
  }
  return null;
}

function allColors(text: string): string[] {
  const lower = text.toLowerCase();
  const found: Array<{ at: number; canonical: string }> = [];
  for (const entry of COLOR_WORDS) {
    for (const w of entry.words) {
      const at = /^[a-z0-9]+$/.test(w)
        ? lower.search(new RegExp(`\\b${w}\\b`))
        : lower.indexOf(w);
      if (at >= 0) found.push({ at, canonical: entry.canonical });
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.canonical).filter((v, i, a) => a.indexOf(v) === i);
}

export interface ParsedChange {
  target: "size" | "color" | "quantity" | "product" | "item" | "customerName" | "phone" | "governorate" | "landmark" | "order";
  operation: "replace" | "add" | "remove" | "cancel" | "increment" | "decrement";
  value?: string | number | null;
  productName?: string | null;
  quantityDelta?: number;
}

const CHANGE_VERB = /(beddel|baddel|badal|ghayyer|ghayer|changer|change|بدل|غيّر|غير)/i;

/**
 * Deterministic mid-conversation edit parser. Returns null when the text is
 * not clearly an edit, so ordinary slot fills keep their existing path.
 */
export function parseOrderChange(text: string): ParsedChange | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  if (/(annuli|annuler|cancel|ma3adch n7eb|ma3adech n7eb|battel el commande|الغي|إلغاء|لغيت)/i.test(lower)) {
    return { target: "order", operation: "cancel" };
  }
  if (/(na7i|nahi|enl[eè]ve|supprime|remove).*(produit|hedha|item)|(?:produit|hedha).*(na7ih|nahih)/i.test(lower)) {
    return { target: "item", operation: "remove" };
  }
  // "mouch X, n7eb Y" correction: the wanted colour/size is the second one.
  if (/(mouch|mich|pas|not|لا|مش)\b/i.test(lower)) {
    const colors = allColors(trimmed);
    if (colors.length >= 2) return { target: "color", operation: "replace", value: colors[colors.length - 1] };
    const size = extractSize(trimmed, true);
    if (size && /(taille|size)/i.test(lower)) return { target: "size", operation: "replace", value: size };
  }
  const isChange = CHANGE_VERB.test(lower);
  if (/(zid|zed|ajoute|add|زيد|زود)/i.test(lower)) {
    if (/(wa7da|wahed|ka3ba|ka3bet|pi[eè]ce|قطعة|كعبة)/i.test(lower) && !/(produit|sweat|hoodie|robe|pantalon)/i.test(lower)) {
      return { target: "quantity", operation: "increment", quantityDelta: 1 };
    }
    if (/(produit|sweat|hoodie|robe|pantalon|veste|t-?shirt|o5or|o5ra|autre|another)/i.test(lower)) {
      return { target: "item", operation: "add", productName: null };
    }
    if (isChange) return { target: "quantity", operation: "increment", quantityDelta: 1 };
    // Bare "zid wa7da o5ra" is still an increment even without a noun above.
    if (/(wa7da|ka3ba)/i.test(lower)) return { target: "quantity", operation: "increment", quantityDelta: 1 };
  }
  if (/(na9es|naqes|n9es|enl[eè]ve wa7da|قلل)/i.test(lower) && /(wa7da|ka3ba|quantit|الكمية)/i.test(lower)) {
    return { target: "quantity", operation: "decrement", quantityDelta: 1 };
  }
  if (!isChange && !/(mouch|ghlot|غلطت)/i.test(lower)) {
    // Address/product edits need an explicit change verb or correction marker.
    return null;
  }
  if (/(adresse|address|win noskon|win naskon|livraison)/i.test(lower)) {
    const lm = extractLandmarks(trimmed)[0]?.name;
    const gov = extractGovernorate(trimmed);
    return { target: "landmark", operation: "replace", value: lm ?? gov?.delegation ?? gov?.governorate ?? null };
  }
  if (/(num[eé]ro|t[eé]l[eé]phone|telefoni|numeri|هاتف|رقم)/i.test(lower)) {
    return { target: "phone", operation: "replace", value: extractPhone(trimmed) };
  }
  if (/(quantit|quantité|الكمية|ka3bet|عدد)/i.test(lower)) {
    const qty = extractQuantity(trimmed);
    if (qty) return { target: "quantity", operation: "replace", value: qty };
  }
  if (/(taille|size|pointure|قياس|مقاس)/i.test(lower)) {
    const size = extractSize(trimmed, true);
    if (size) return { target: "size", operation: "replace", value: size };
  }
  if (/(loun|couleur|color|لون|اللون)/i.test(lower)) {
    const color = extractColor(trimmed);
    if (color) return { target: "color", operation: "replace", value: color };
  }
  if (/(produit|product|mod[eè]le|article)/i.test(lower)) {
    const color = extractColor(trimmed);
    return { target: "product", operation: "replace", value: color ? `product ${color}` : null, productName: null };
  }
  // "beddel el taille l L" without the word produit etc. still lands here.
  const size = extractSize(trimmed, true);
  if (size && /(taille|size)/i.test(lower)) return { target: "size", operation: "replace", value: size };
  const color = extractColor(trimmed);
  if (color) return { target: "color", operation: "replace", value: color };
  return null;
}

export type AssistanceIntent = "ask_delivery" | "ask_policy" | "track_order" | null;

/** Side questions that should be answered without derailing slot collection. */
export function detectAssistanceIntent(text: string): AssistanceIntent {
  const lower = text.toLowerCase();
  if (/(win wsol|win woslet|suivi|tracking|track|وين وصل|تتبع)/i.test(lower) && /(commande|colis|طلب)/i.test(lower)) {
    return "track_order";
  }
  if (/(retour|[eé]change|rembours|garantie|تبديل|استرجاع|إرجاع|نبدل el taille ba3d)/i.test(lower)) return "ask_policy";
  if (/(wa9tech|combien de temps|d[eé]lai|livraison.*(?:wa9tech|combien|frais)|frais.*livraison|توصيل.*(?:وقتاش|قداش)|قداش.*توصيل)/i.test(lower)) {
    return "ask_delivery";
  }
  return null;
}

/** Extracts Tunisian governorate (and delegation when implied by neighborhood). */
export function extractGovernorate(text: string): { governorate: string; delegation?: string } | null {
  const hit = lookupLocality(text);
  if (!hit) return null;
  return { governorate: hit.governorate, ...(hit.delegation ? { delegation: hit.delegation } : {}) };
}

function classifyRelation(raw: string | undefined): string {
  if (!raw) return "near";
  const lower = raw.toLowerCase();
  if (/(?:derri[eè]re|wra|ورا|وراء)/.test(lower)) return "behind";
  if (/(?:devant|en\s*face|9oddem|قدام|مقابل)/.test(lower)) return "in front of";
  if (/(?:entre|bin|بين)/.test(lower)) return "between";
  if (/(?:c[oô]t[eé]|ba7dha|bahdha|بجانب|بحذا)/.test(lower)) return "next to";
  return "near";
}

function cleanLandmarkCandidate(raw: string): string {
  return raw
    .replace(
      /\s*(?:[,;]|\b(?:taille|num(?:ero|éro)?|t[eé]l(?:[eé]phone)?|esmi|ismi|\d+(?:er|ère|eme|ème)?\s*[eé]tage|etage\s*\d+|طابق|الطابق|appartement|appt|bloc|imm(?:euble)?|porte|bab)\b).*$/i,
      "",
    )
    .replace(/\s+(?:w|et|ou|و)\s*$/i, "")
    .replace(/^[,\s:;.\-]+|[,\s:;.\-!?؟]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PLACE_TYPE_GLOBAL =
  /\b((?:caf[eé]|coffee\s*shop|coffeeshop|coffee|9ahwa|9ahwet|kahwa|kahwet|qahwa|salon\s*de\s*th[eé]|قهوة|مقهى|pharmacie|صيدلية|mosqu[eé]e|jamaa|jema3|jama3|جامع|مسجد|[eé]cole|lyc[eé]e|coll[eè]ge|facult[eé]|universit[eé]|campus|esprit|insat|ihec|fst|enit|foyer|مدرسة|معهد|كلية|la\s*poste|poste|bosta|bousta|بوسطة|بريد|municipalit[eé]|baladiya|بلدية|supermarch[eé]|monoprix|carrefour|magasin\s*g[eé]n[eé]ral|mg|aziza|g[eé]ant|tunisia\s*mall|azur\s*city|mall|clinique|klinik|h[oô]pital|sbitar|مصحة|مستشفى|سبيطار|station|terminus|kiosque|totalenergies|total|shell|agil|oilibya|m[eé]tro|gare|rond[\s\-]*point|مفترق|banque|biat|attijari|amen\s*bank|stb|bna|zitouna|ambassade|restaurant|resto|pizzeria|p[aâ]tisserie|boulangerie|koucha|مخبزة|salle\s*de\s*sport|gym|stade|parc|plage|corniche|souk|h[oô]tel|avenue|av\.|rue|boulevard|bd|impasse|chera3|chere3|tri9|route\s*(?:de\s*)?[a-zA-ZÀ-ÿ]+|شارع|نهج|طريق)(?:\s+[a-zA-Z0-9àâçéèêëîïôûùüÿñæœ\u0600-\u06FF'’\-]+){1,6})/gi;

const BETWEEN_PATTERN =
  /(?:\b(?:entre|bin)\b|بين)\s+([^,.!?\n]{3,55}?)\s+(?:\b(?:et|w|and)\b|و)\s+([^,.!?\n]{3,55})/i;

const RELATION_GLOBAL =
  /(ba7dha|bahdha|9rib\s*(?:le|l|mel|men)?|pr[eè]s\s*de|[aà]\s*c[oô]t[eé]\s*de|derri[eè]re|devant|en\s*face\s*de|wra|9oddem|landmark\s*(?:howa)?|rep[eè]re\s*(?:howa)?|بجانب|قرب|بحذا|وراء|ورا|قدام|مقابل)\s+([^,.!?\n]{3,65})/gi;

/**
 * Deterministically extracts 1–3 landmark mentions (coffee shops, cafés,
 * pharmacies, restaurants, supermarkets, mosques, stations, streets, pairs
 * like "entre X et Y" or "wra X ba7dha Y", etc.) from buyer descriptions.
 */
export function extractLandmarks(text: string): Array<{ name: string; relation: string | null }> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const found: Array<{ name: string; relation: string | null }> = [];
  const pushUnique = (rawName: string, relation: string | null) => {
    // Split chained clauses like "station metro bardo w 9oddem monoprix"
    const subParts = rawName.split(
      /\s+(?:w|et|&|و)\s+(?=(?:ba7dha|bahdha|9rib|pr[eè]s|derri[eè]re|devant|en\s*face|wra|9oddem|caf[eé]|9ahw|pharmacie|mosqu|jema3|monoprix|carrefour|station|rond|rue|avenue|chera3|klinik|clinique|جامع|قهوة|صيدلية|محطة))/i,
    );
    for (const part of subParts) {
      let rel = relation;
      let body = part.trim();
      const relLead = body.match(
        /^(ba7dha|bahdha|9rib\s*(?:le|l|mel|men)?|pr[eè]s\s*de|[aà]\s*c[oô]t[eé]\s*de|derri[eè]re|devant|en\s*face\s*de|wra|9oddem|بجانب|قرب|بحذا|وراء|ورا|قدام|مقابل)\s+(.+)$/i,
      );
      if (relLead) {
        rel = classifyRelation(relLead[1]);
        body = relLead[2];
      }
      const name = cleanLandmarkCandidate(body);
      if (name.length < 3) continue;
      const key = name.toLowerCase();
      if (found.some((existing) => existing.name.toLowerCase().includes(key) || key.includes(existing.name.toLowerCase()))) {
        continue;
      }
      found.push({ name, relation: rel ?? "near" });
      if (found.length >= 3) return;
    }
  };

  // 1. Explicit "between X and Y" / "bin X w Y" triangulation pattern
  const between = trimmed.match(BETWEEN_PATTERN);
  if (between?.[1] && between?.[2]) {
    pushUnique(between[1], "between");
    pushUnique(between[2], "between");
  }

  // 2. Relation-prefixed mentions ("ba7dha ...", "wra ...", "9oddem ...", "près de ...")
  for (const match of trimmed.matchAll(RELATION_GLOBAL)) {
    pushUnique(match[2], classifyRelation(match[1]));
    if (found.length >= 3) break;
  }

  // 3. Place-type mentions ("coffee shop Cosmitto", "9ahwet El Baraka", "Rue Ibn Khaldoun")
  if (found.length < 3) {
    for (const match of trimmed.matchAll(PLACE_TYPE_GLOBAL)) {
      pushUnique(match[1], "near");
      if (found.length >= 3) break;
    }
  }

  return found.slice(0, 3);
}

/**
 * Extracts floor/apartment and building/door notes from natural buyer address
 * descriptions so courier instructions and the pin sheet are pre-populated.
 */
export function extractBuildingDetails(text: string): {
  floor: string | null;
  driverNote: string | null;
} {
  const trimmed = text.trim();
  if (!trimmed) return { floor: null, driverNote: null };

  let floor: string | null = null;
  const floorFr = trimmed.match(
    /\b(\d{1,2}\s*(?:er|ère|eme|ème|e)?\s*[eé]tage|[eé]tage\s*\d{1,2}|rez[\s\-]*de[\s\-]*chauss[eé]e|rdc|טابق|طابق\s*(?:أول|ثاني|ثالث|رابع|\d{1,2})|الطابق\s*(?:الأول|الثاني|الثالث|الرابع|\d{1,2}))\b/i,
  );
  const aptMatch = trimmed.match(/\b((?:appartement|appart|appt|apt|شقة)\s*[a-z0-9\-]{1,6})\b/i);
  if (floorFr && aptMatch) {
    floor = `${floorFr[1].trim()}, ${aptMatch[1].trim()}`;
  } else if (floorFr) {
    floor = floorFr[1].trim();
  } else if (aptMatch) {
    floor = aptMatch[1].trim();
  }

  const notes: string[] = [];
  const buildingMatch = trimmed.match(
    /\b((?:immeuble|imm\.?|bloc|résidence|residence|villa|dar|عمارة|إقامة)\s+[A-Za-zÀ-ÿ0-9\u0600-\u06FF'’\-]+(?:\s+[A-Za-zÀ-ÿ0-9\u0600-\u06FF'’\-]+)?)/i,
  );
  if (buildingMatch?.[1]) notes.push(buildingMatch[1].trim());
  const doorMatch = trimmed.match(
    /\b((?:porte|beb|bab|portail|باب)\s+(?:bleue?|blanche?|noire?|verte?|rouge|marron|gris|jaune|azra9|abyadh|akhdhar|a7mar|k7al|أبيض|أزرق|أخضر|أحمر|حديد|[0-9]{1,4}))/i,
  );
  if (doorMatch?.[1]) notes.push(doorMatch[1].trim());

  return {
    floor,
    driverNote: notes.length > 0 ? notes.join(" · ").slice(0, 240) : null,
  };
}
