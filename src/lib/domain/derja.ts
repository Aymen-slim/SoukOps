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

const LOCALITY_TO_GOV: Array<{ pattern: RegExp; governorate: string; delegation?: string }> = [
  // Delegations & well-known neighborhoods first (implies governorate automatically)
  { pattern: /\b(?:el\s*manar|manar)\b|المنار/i, governorate: "Tunis", delegation: "El Manar" },
  { pattern: /\b(?:la\s*marsa|marsa)\b|المرسى/i, governorate: "Tunis", delegation: "La Marsa" },
  { pattern: /\b(?:berges\s*du\s*lac|lac\s*[123]?)\b|البحيرة/i, governorate: "Tunis", delegation: "Les Berges du Lac" },
  { pattern: /\b(?:le\s*bardo|bardo)\b|باردو/i, governorate: "Tunis", delegation: "Le Bardo" },
  { pattern: /\b(?:carthage|9artaj)\b|قرطاج/i, governorate: "Tunis", delegation: "Carthage" },
  { pattern: /\b(?:el\s*menzah|menzah)\b|المنزه/i, governorate: "Tunis", delegation: "El Menzah" },
  { pattern: /\b(?:ennasr|el\s*nasr|nasr)\b|النصر/i, governorate: "Ariana", delegation: "Ennasr" },
  { pattern: /\b(?:la\s*soukra|soukra)\b|سكرة/i, governorate: "Ariana", delegation: "La Soukra" },
  { pattern: /\b(?:raoued|rawed)\b|رواد/i, governorate: "Ariana", delegation: "Raoued" },
  { pattern: /\b(?:el\s*mourouj|mourouj)\b|المروج/i, governorate: "Ben Arous", delegation: "El Mourouj" },
  { pattern: /\b(?:mégrine|megrine)\b|مقرين/i, governorate: "Ben Arous", delegation: "Mégrine" },
  { pattern: /\b(?:radès|rades)\b|رادس/i, governorate: "Ben Arous", delegation: "Radès" },
  { pattern: /\b(?:hammam\s*lif|hamem\s*lif)\b|حمام الأنف/i, governorate: "Ben Arous", delegation: "Hammam Lif" },
  { pattern: /\b(?:boumhel)\b|بومهل/i, governorate: "Ben Arous", delegation: "Boumhel" },
  { pattern: /\b(?:denden)\b|دندان/i, governorate: "Manouba", delegation: "Denden" },
  { pattern: /\b(?:oued\s*ellil|wed\s*ellil)\b|وادي الليل/i, governorate: "Manouba", delegation: "Oued Ellil" },
  { pattern: /\b(?:hammamet|7ammamet)\b|الحمامات/i, governorate: "Nabeul", delegation: "Hammamet" },
  { pattern: /\b(?:djerba|jerba|houmt\s*souk|midoun)\b|جربة/i, governorate: "Médenine", delegation: "Djerba" },
  { pattern: /\b(?:sahloul|kantaoui|khzema)\b|سسهلول|القنطاوي|خزامة/i, governorate: "Sousse" },
  // 24 Governorates
  { pattern: /\b(?:tunis|tounes)\b|تونس/i, governorate: "Tunis" },
  { pattern: /\b(?:ariana|aryana|aryanah)\b|أريانة|اريانة/i, governorate: "Ariana" },
  { pattern: /\b(?:ben\s*arous|benarous)\b|بن عروس/i, governorate: "Ben Arous" },
  { pattern: /\b(?:manouba|mannouba)\b|منوبة/i, governorate: "Manouba" },
  { pattern: /\b(?:nabeul)\b|نابل/i, governorate: "Nabeul" },
  { pattern: /\b(?:zaghouan|zaghwan)\b|زغوان/i, governorate: "Zaghouan" },
  { pattern: /\b(?:bizerte|benzart)\b|بنزرت/i, governorate: "Bizerte" },
  { pattern: /\b(?:béja|beja)\b|باجة/i, governorate: "Béja" },
  { pattern: /\b(?:jendouba)\b|جندوبة/i, governorate: "Jendouba" },
  { pattern: /\b(?:le\s*kef|el\s*kef|kef)\b|الكاف/i, governorate: "Le Kef" },
  { pattern: /\b(?:siliana)\b|سليانة/i, governorate: "Siliana" },
  { pattern: /\b(?:sousse|soussa)\b|سوسة/i, governorate: "Sousse" },
  { pattern: /\b(?:monastir|mestir)\b|المنستير/i, governorate: "Monastir" },
  { pattern: /\b(?:mahdia|mahdiya)\b|المهدية/i, governorate: "Mahdia" },
  { pattern: /\b(?:sfax|sfe9es)\b|صفاقس/i, governorate: "Sfax" },
  { pattern: /\b(?:kairouan|9ayrawan|kayrawan)\b|القيروان/i, governorate: "Kairouan" },
  { pattern: /\b(?:kasserine|gasrine)\b|القصرين/i, governorate: "Kasserine" },
  { pattern: /\b(?:sidi\s*bouzid)\b|سيدي بوزيد/i, governorate: "Sidi Bouzid" },
  { pattern: /\b(?:gabès|gabes|9abes)\b|قابس/i, governorate: "Gabès" },
  { pattern: /\b(?:médenine|medenine)\b|مدنين/i, governorate: "Médenine" },
  { pattern: /\b(?:tataouine|tatawin)\b|تطاوين/i, governorate: "Tataouine" },
  { pattern: /\b(?:gafsa|9afsa)\b|قفصة/i, governorate: "Gafsa" },
  { pattern: /\b(?:tozeur|touzer)\b|توزر/i, governorate: "Tozeur" },
  { pattern: /\b(?:kébili|kebili|9bili)\b|قبلي/i, governorate: "Kébili" },
];

/** Extracts Tunisian governorate (and delegation when implied by neighborhood). */
export function extractGovernorate(text: string): { governorate: string; delegation?: string } | null {
  for (const entry of LOCALITY_TO_GOV) {
    if (entry.pattern.test(text)) {
      return { governorate: entry.governorate, delegation: entry.delegation };
    }
  }
  return null;
}

const PLACE_TYPE_PATTERN =
  /\b((?:café|cafe|coffee\s*shop|coffeeshop|coffee|9ahwa|9ahwet|kahwa|kahwet|qahwa|salon\s*de\s*thé|salon\s*de\s*the|قهوة|مقهى|pharmacie|صيدلية|mosquée|mosquee|jamaa|jema3|jama3|جامع|مسجد|école|ecole|lycée|lycee|collège|college|faculté|faculte|université|universite|campus|مدرسة|معهد|كلية|la\s*poste|poste|bosta|bousta|بوسطة|supermarché|supermarche|monoprix|carrefour|magasin\s*général|magasin\s*general|mg|aziza|géant|geant|tunisia\s*mall|azur\s*city|mall|clinique|hôpital|hopital|sbitar|مصحة|مستشفى|سبيطار|station|kiosque|totalenergies|total|shell|agil|métro|metro|gare|rond[\s\-]*point|banque|biat|attijari|amen\s*bank|stb|bna|restaurant|resto|pizzeria|pâtisserie|patisserie|salle\s*de\s*sport|gym|stade|parc|hôtel|hotel|cité|cite|avenue|rue|شارع|نهج|حي)(?:\s+[a-zA-Z0-9àâçéèêëîïôûùüÿñæœ\u0600-\u06FF'\-]+){1,6})/i;

const RELATION_EXTRACT_PATTERN =
  /(?:ba7dha|bahdha|9rib\s*(?:le|l|men)?|près\s*de|pres\s*de|à\s*côté\s*de|a\s*cote\s*de|derrière|derriere|devant|en\s*face\s*de|wra|9oddem|landmark\s*(?:howa)?|repère\s*(?:howa)?|repere\s*(?:howa)?|بجانب|قرب|بحذا|وراء|قدام)\s+([^,.!?\n]{3,60})/i;

/**
 * Deterministically extracts landmark mentions (coffee shops, cafés,
 * pharmacies, restaurants, supermarkets, mosques, stations, streets, etc.)
 * from buyer text when the LLM misses them.
 */
export function extractLandmarks(text: string): Array<{ name: string; relation: string | null }> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const byPlaceType = trimmed.match(PLACE_TYPE_PATTERN);
  if (byPlaceType?.[1]) {
    const name = byPlaceType[1].replace(/\s+(?:w|et|ou|taille|num|tél|tel)\b.*$/i, "").trim();
    if (name.length >= 3) return [{ name, relation: "near" }];
  }

  const byRelation = trimmed.match(RELATION_EXTRACT_PATTERN);
  if (byRelation?.[1]) {
    const name = byRelation[1].replace(/\s+(?:w|et|ou|taille|num|tél|tel)\b.*$/i, "").trim();
    if (name.length >= 3) return [{ name, relation: "near" }];
  }

  return [];
}


