/** Tunisian geographic gazetteer: governorate centers + 95+ delegations, neighborhoods, and zones. */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface LocalityMatch {
  governorate: string;
  delegation?: string;
  lat: number;
  lng: number;
}

const POINTS: Record<string, GeoPoint> = {
  tunis: { lat: 36.8065, lng: 10.1815 },
  ariana: { lat: 36.8665, lng: 10.1647 },
  "ben arous": { lat: 36.7531, lng: 10.2189 },
  manouba: { lat: 36.808, lng: 10.097 },
  nabeul: { lat: 36.4561, lng: 10.7376 },
  zaghouan: { lat: 36.4029, lng: 10.1429 },
  bizerte: { lat: 37.2744, lng: 9.8739 },
  beja: { lat: 36.7256, lng: 9.1817 },
  jendouba: { lat: 36.5011, lng: 8.7802 },
  kef: { lat: 36.1742, lng: 8.7049 },
  "le kef": { lat: 36.1742, lng: 8.7049 },
  siliana: { lat: 36.0849, lng: 9.3708 },
  sousse: { lat: 35.8256, lng: 10.6369 },
  monastir: { lat: 35.777, lng: 10.8262 },
  mahdia: { lat: 35.5047, lng: 11.0622 },
  sfax: { lat: 34.7406, lng: 10.7603 },
  kairouan: { lat: 35.6781, lng: 10.0963 },
  kasserine: { lat: 35.1676, lng: 8.8365 },
  "sidi bouzid": { lat: 35.0382, lng: 9.4849 },
  gabes: { lat: 33.8815, lng: 10.0982 },
  medenine: { lat: 33.3399, lng: 10.4959 },
  tataouine: { lat: 32.9297, lng: 10.4518 },
  gafsa: { lat: 34.425, lng: 8.7842 },
  tozeur: { lat: 33.9197, lng: 8.1335 },
  kebili: { lat: 33.7044, lng: 8.969 },
};

interface LocalityPattern {
  pattern: RegExp;
  governorate: string;
  delegation?: string;
  lat: number;
  lng: number;
}

/**
 * Specific delegations, neighborhoods, and cities checked BEFORE bare governorate
 * names so "Ennasr 2", "L'Aouina", "Cité El Ghazela", "Sahloul", "Route Gremda",
 * etc. automatically infer both governorate and accurate local coordinates.
 */
export const TUNISIA_LOCALITIES: LocalityPattern[] = [
  // --- Greater Tunis: Tunis ---
  { pattern: /\b(?:el\s*manar(?:\s*[123])?|manar(?:\s*[123])?)\b|المنار/i, governorate: "Tunis", delegation: "El Manar", lat: 36.8358, lng: 10.1588 },
  { pattern: /\b(?:la\s*marsa|marsa(?:\s*plage|\s*corniche|\s*ville)?)\b|المرسى/i, governorate: "Tunis", delegation: "La Marsa", lat: 36.8782, lng: 10.3247 },
  { pattern: /\b(?:gammarth|9ammarth)\b|قمرت/i, governorate: "Tunis", delegation: "La Marsa", lat: 36.9125, lng: 10.2894 },
  { pattern: /\b(?:sidi\s*bou\s*sa[iï]d)\b|سيدي بوسعيد/i, governorate: "Tunis", delegation: "Carthage", lat: 36.8687, lng: 10.3417 },
  { pattern: /\b(?:jardins?\s*de\s*carthage)\b|حدائق قرطاج/i, governorate: "Tunis", delegation: "Carthage", lat: 36.8602, lng: 10.2925 },
  { pattern: /\b(?:carthage|9artaj)\b|قرطاج/i, governorate: "Tunis", delegation: "Carthage", lat: 36.8529, lng: 10.3233 },
  { pattern: /\b(?:l['’\s]*aouina|el\s*aouina|aouina|3wina)\b|العوينة/i, governorate: "Tunis", delegation: "L'Aouina", lat: 36.8524, lng: 10.2564 },
  { pattern: /\b(?:a[iï]n\s*zaghouan)\b|عين زغوان/i, governorate: "Tunis", delegation: "L'Aouina", lat: 36.8559, lng: 10.2738 },
  { pattern: /\b(?:le\s*kram|el\s*kram|kram)\b|الكرم/i, governorate: "Tunis", delegation: "Le Kram", lat: 36.8331, lng: 10.3144 },
  { pattern: /\b(?:la\s*goulette|goulette|7al9\s*el\s*wed|halq\s*el\s*oued)\b|حلق الوادي/i, governorate: "Tunis", delegation: "La Goulette", lat: 36.8181, lng: 10.305 },
  { pattern: /\b(?:berges\s*du\s*lac\s*2|lac\s*2|lac\s*ii)\b|البحيرة\s*2/i, governorate: "Tunis", delegation: "Les Berges du Lac", lat: 36.8458, lng: 10.2712 },
  { pattern: /\b(?:berges\s*du\s*lac(?:\s*[13])?|lac(?:\s*1|\s*i|\s*3)?)\b|البحيرة/i, governorate: "Tunis", delegation: "Les Berges du Lac", lat: 36.8325, lng: 10.2335 },
  { pattern: /\b(?:le\s*bardo|el\s*bardo|bardo)\b|باردو/i, governorate: "Tunis", delegation: "Le Bardo", lat: 36.8092, lng: 10.1406 },
  { pattern: /\b(?:menzah\s*[56789]|el\s*menzah\s*[56789])\b|المنزه\s*[56789]/i, governorate: "Ariana", delegation: "El Menzah", lat: 36.8495, lng: 10.1682 },
  { pattern: /\b(?:jardins?\s*d['’\s]*el\s*menzah)\b|حدائق المنزه/i, governorate: "Ariana", delegation: "Jardins d'El Menzah", lat: 36.8615, lng: 10.1335 },
  { pattern: /\b(?:el\s*menzah(?:\s*[14])?|menzah(?:\s*[14])?)\b|المنزه/i, governorate: "Tunis", delegation: "El Menzah", lat: 36.8371, lng: 10.1764 },
  { pattern: /\b(?:centre\s*urbain\s*nord|c\.?u\.?n\.?)\b|المركز العمراني الشمالي/i, governorate: "Tunis", delegation: "El Menzah", lat: 36.8453, lng: 10.1972 },
  { pattern: /\b(?:cit[eé]\s*olympique)\b|الحي الأولمبي/i, governorate: "Tunis", delegation: "Cité El Khadra", lat: 36.8364, lng: 10.1869 },
  { pattern: /\b(?:cit[eé]\s*el\s*khadra|el\s*khadra)\b|حي الخضراء/i, governorate: "Tunis", delegation: "Cité El Khadra", lat: 36.8305, lng: 10.1932 },
  { pattern: /\b(?:mutuelleville|notre\s*dame)\b|موتوال فيل/i, governorate: "Tunis", delegation: "El Menzah", lat: 36.8268, lng: 10.1748 },
  { pattern: /\b(?:lafayette)\b|لافاييت/i, governorate: "Tunis", delegation: "Bab Bhar", lat: 36.8128, lng: 10.1818 },
  { pattern: /\b(?:montplaisir)\b|مونبليزير/i, governorate: "Tunis", delegation: "Bab Bhar", lat: 36.8178, lng: 10.1904 },
  { pattern: /\b(?:bab\s*bhar|porte\s*de\s*france|centre[\s\-]*ville\s*tunis)\b|باب بحر/i, governorate: "Tunis", delegation: "Bab Bhar", lat: 36.7992, lng: 10.1758 },
  { pattern: /\b(?:bab\s*souika|bab\s*saadoun|kasbah|m[eé]dina\s*tunis)\b|باب سويقة|باب سعدون|القصبة/i, governorate: "Tunis", delegation: "Bab Souika", lat: 36.8058, lng: 10.1656 },
  { pattern: /\b(?:el\s*omrane|omrane\s*sup[eé]rieur|ibn\s*khaldoun)\b|العمران|ابن خلدون/i, governorate: "Tunis", delegation: "El Omrane", lat: 36.8245, lng: 10.1512 },
  { pattern: /\b(?:cit[eé]\s*ezzouhour|ezzouhour|ettahrir)\b|حي الزهور|التحرير/i, governorate: "Tunis", delegation: "Ezzouhour", lat: 36.7955, lng: 10.1325 },
  { pattern: /\b(?:el\s*ouardia|ouardia|kabaria|s[eé]joumi|hra[iï]ria)\b|الوردية|الكبارية|السيجومي|الحرايرية/i, governorate: "Tunis", delegation: "El Ouardia", lat: 36.7745, lng: 10.178 },

  // --- Greater Tunis: Ariana ---
  { pattern: /\b(?:(?:7ay|hay|cit[eé])?\s*(?:ennasr|el\s*nasr|nasr)(?:\s*[12])?)\b|حي النصر|النصر/i, governorate: "Ariana", delegation: "Ennasr", lat: 36.8617, lng: 10.1604 },
  { pattern: /\b(?:(?:cit[eé]\s*)?(?:el\s*)?ghazela|(?:el\s*)?ghazala|technopole\s*el\s*ghazala)\b|حي الغزالة|الغزالة/i, governorate: "Ariana", delegation: "Raoued", lat: 36.8926, lng: 10.1875 },
  { pattern: /\b(?:la\s*soukra|soukra|chotrana(?:\s*[123])?)\b|سكرة|شطرانة/i, governorate: "Ariana", delegation: "La Soukra", lat: 36.8884, lng: 10.2367 },
  { pattern: /\b(?:borj\s*louzir)\b|برج الوزير/i, governorate: "Ariana", delegation: "La Soukra", lat: 36.8712, lng: 10.2118 },
  { pattern: /\b(?:raoued|rawed|ariana\s*essoughra)\b|رواد|أريانة الصغرى/i, governorate: "Ariana", delegation: "Raoued", lat: 36.9456, lng: 10.1912 },
  { pattern: /\b(?:mnihla|ettadhamen|tadhamen|sidi\s*thabet)\b|المنيهلة|التضامن|سيدي ثابت/i, governorate: "Ariana", delegation: "Mnihla", lat: 36.8482, lng: 10.1165 },

  // --- Greater Tunis: Ben Arous ---
  { pattern: /\b(?:el\s*mourouj(?:\s*[1-6])?|mourouj(?:\s*[1-6])?)\b|المروج/i, governorate: "Ben Arous", delegation: "El Mourouj", lat: 36.7308, lng: 10.2078 },
  { pattern: /\b(?:m[eé]grine(?:\s*riadh|\s*coteaux)?)\b|مقرين/i, governorate: "Ben Arous", delegation: "Mégrine", lat: 36.7689, lng: 10.2361 },
  { pattern: /\b(?:rad[eè]s)\b|رادس/i, governorate: "Ben Arous", delegation: "Radès", lat: 36.7681, lng: 10.2753 },
  { pattern: /\b(?:ezzahra|ez[\s\-]*zahra)\b|الزهراء/i, governorate: "Ben Arous", delegation: "Ezzahra", lat: 36.7439, lng: 10.3083 },
  { pattern: /\b(?:hammam\s*lif|hamem\s*lif|7amem\s*lif)\b|حمام الأنف/i, governorate: "Ben Arous", delegation: "Hammam Lif", lat: 36.7294, lng: 10.3375 },
  { pattern: /\b(?:hammam\s*chott|borj\s*cedria)\b|حمام الشط|برج السدرية/i, governorate: "Ben Arous", delegation: "Hammam Chott", lat: 36.7097, lng: 10.3789 },
  { pattern: /\b(?:boumhel(?:\s*el\s*bassatine)?)\b|بومهل/i, governorate: "Ben Arous", delegation: "Boumhel", lat: 36.7231, lng: 10.3017 },
  { pattern: /\b(?:nouvelle\s*m[eé]dina|m[eé]dina\s*jedida)\b|المدينة الجديدة/i, governorate: "Ben Arous", delegation: "Nouvelle Médina", lat: 36.7364, lng: 10.2492 },
  { pattern: /\b(?:fouchana|mohamedia|mhamdia|mornag)\b|فوشانة|المحمدية|مرناق/i, governorate: "Ben Arous", delegation: "Fouchana", lat: 36.6986, lng: 10.1694 },

  // --- Greater Tunis: Manouba ---
  { pattern: /\b(?:denden)\b|دندان/i, governorate: "Manouba", delegation: "Denden", lat: 36.8047, lng: 10.1169 },
  { pattern: /\b(?:oued\s*ellil|wed\s*ellil)\b|وادي الليل/i, governorate: "Manouba", delegation: "Oued Ellil", lat: 36.8319, lng: 10.0442 },
  { pattern: /\b(?:douar\s*hicher|mornaguia|tebourba)\b|دوار هيشر|المرناقية|طبربة/i, governorate: "Manouba", delegation: "Douar Hicher", lat: 36.8242, lng: 10.0789 },

  // --- Cap Bon / Nabeul ---
  { pattern: /\b(?:yasmine\s*hammamet)\b|ياسمين الحمامات/i, governorate: "Nabeul", delegation: "Hammamet", lat: 36.3733, lng: 10.5403 },
  { pattern: /\b(?:hammamet|7ammamet)\b|الحمامات/i, governorate: "Nabeul", delegation: "Hammamet", lat: 36.4022, lng: 10.6147 },
  { pattern: /\b(?:dar\s*chaabane|beni\s*khiar|maamoura)\b|دار شعبان|بني خيار/i, governorate: "Nabeul", delegation: "Dar Chaabane", lat: 36.4675, lng: 10.7519 },
  { pattern: /\b(?:k[eé]libia|9libia|menzel\s*temime|korba)\b|قليبية|منزل تميم|قربة/i, governorate: "Nabeul", delegation: "Kélibia", lat: 36.8475, lng: 11.0939 },
  { pattern: /\b(?:grombalia|soliman|bou\s*argoub)\b|قرمبالية|سليمان/i, governorate: "Nabeul", delegation: "Grombalia", lat: 36.6028, lng: 10.4989 },

  // --- Sahel: Sousse, Monastir, Mahdia ---
  { pattern: /\b(?:sahloul(?:\s*[1234])?)\b|سهلول|سسهلول/i, governorate: "Sousse", delegation: "Sahloul", lat: 35.8354, lng: 10.5906 },
  { pattern: /\b(?:khzema(?:\s*est|\s*ouest)?|khezama)\b|خزامة/i, governorate: "Sousse", delegation: "Khzema", lat: 35.8503, lng: 10.6094 },
  { pattern: /\b(?:el\s*kantaoui|port\s*el\s*kantaoui|kantaoui|hammam\s*sousse)\b|القنطاوي|حمام سوسة/i, governorate: "Sousse", delegation: "Hammam Sousse", lat: 35.8892, lng: 10.5944 },
  { pattern: /\b(?:msaken|m['’]saken|akouda|kalaa\s*kebira|kalaa\s*seghira)\b|مساكن|أكودة|القلعة الكبرى/i, governorate: "Sousse", delegation: "Msaken", lat: 35.7297, lng: 10.5808 },
  { pattern: /\b(?:skanes)\b|صقانس/i, governorate: "Monastir", delegation: "Monastir", lat: 35.7764, lng: 10.785 },
  { pattern: /\b(?:ksar\s*hellal|moknine|jemmal|teboulba|sahline)\b|قصر هلال|المكنين|جمال|طبلبة/i, governorate: "Monastir", delegation: "Ksar Hellal", lat: 35.6472, lng: 10.8906 },
  { pattern: /\b(?:el\s*jem|ksour\s*essaf|chebba)\b|الجم|قصور الساف|الشابة/i, governorate: "Mahdia", delegation: "El Jem", lat: 35.2964, lng: 10.7069 },

  // --- Sfax ---
  { pattern: /\b(?:sakiet\s*ezzit)\b|ساقية الزيت/i, governorate: "Sfax", delegation: "Sakiet Ezzit", lat: 34.8011, lng: 10.7689 },
  { pattern: /\b(?:sakiet\s*edda[iï]er)\b|ساقية الدائر/i, governorate: "Sfax", delegation: "Sakiet Eddaier", lat: 34.7928, lng: 10.8117 },
  { pattern: /\b(?:route\s*(?:de\s*)?gremda|tri9\s*gremda)\b|طريق قرمدة/i, governorate: "Sfax", delegation: "Sfax Sud", lat: 34.7639, lng: 10.7303 },
  { pattern: /\b(?:route\s*(?:el\s*)?a[iï]n|route\s*teniour|route\s*soukra\s*sfax|thyna|chihia)\b|طريق العين|طريق تنيور|طينة|الشيحية/i, governorate: "Sfax", delegation: "Sfax Ouest", lat: 34.7495, lng: 10.7285 },

  // --- North & South Cities ---
  { pattern: /\b(?:menzel\s*bourguiba|ras\s*jebel|mateur|zarzouna)\b|منزل بورقيبة|رأس الجبل|ماطر|جرزونة/i, governorate: "Bizerte", delegation: "Menzel Bourguiba", lat: 37.1536, lng: 9.7858 },
  { pattern: /\b(?:tabarka|a[iï]n\s*draham|bou\s*salem)\b|طبرقة|عين دراهم|بوسالم/i, governorate: "Jendouba", delegation: "Tabarka", lat: 36.9544, lng: 8.7581 },
  { pattern: /\b(?:djerba|jerba|houmt\s*souk|midoun|ajim)\b|جربة|حومة السوق|ميدون/i, governorate: "Médenine", delegation: "Djerba", lat: 33.875, lng: 10.8575 },
  { pattern: /\b(?:zarzis|ben\s*guerdane)\b|جرجيس|بن قردان/i, governorate: "Médenine", delegation: "Zarzis", lat: 33.5042, lng: 11.1122 },
  { pattern: /\b(?:metlaoui|red[eé]yef)\b|المتلوي|الرديف/i, governorate: "Gafsa", delegation: "Metlaoui", lat: 34.3208, lng: 8.4014 },
  { pattern: /\b(?:douz)\b|دوز/i, governorate: "Kébili", delegation: "Douz", lat: 33.4664, lng: 9.0203 },
  { pattern: /\b(?:nefta)\b|نفطة/i, governorate: "Tozeur", delegation: "Nefta", lat: 33.8731, lng: 7.8778 },

  // --- 24 Governorates ---
  { pattern: /\b(?:tunis|tounes)\b|تونس/i, governorate: "Tunis", lat: 36.8065, lng: 10.1815 },
  { pattern: /\b(?:ariana|aryana|aryanah)\b|أريانة|اريانة/i, governorate: "Ariana", lat: 36.8665, lng: 10.1647 },
  { pattern: /\b(?:ben\s*arous|benarous)\b|بن عروس/i, governorate: "Ben Arous", lat: 36.7531, lng: 10.2189 },
  { pattern: /\b(?:manouba|mannouba)\b|منوبة/i, governorate: "Manouba", lat: 36.808, lng: 10.097 },
  { pattern: /\b(?:nabeul)\b|نابل/i, governorate: "Nabeul", lat: 36.4561, lng: 10.7376 },
  { pattern: /\b(?:zaghouan|zaghwan)\b|زغوان/i, governorate: "Zaghouan", lat: 36.4029, lng: 10.1429 },
  { pattern: /\b(?:bizerte|benzart)\b|بنزرت/i, governorate: "Bizerte", lat: 37.2744, lng: 9.8739 },
  { pattern: /\b(?:b[eé]ja)\b|باجة/i, governorate: "Béja", lat: 36.7256, lng: 9.1817 },
  { pattern: /\b(?:jendouba)\b|جندوبة/i, governorate: "Jendouba", lat: 36.5011, lng: 8.7802 },
  { pattern: /\b(?:le\s*kef|el\s*kef|kef)\b|الكاف/i, governorate: "Le Kef", lat: 36.1742, lng: 8.7049 },
  { pattern: /\b(?:siliana)\b|سليانة/i, governorate: "Siliana", lat: 36.0849, lng: 9.3708 },
  { pattern: /\b(?:sousse|soussa)\b|سوسة/i, governorate: "Sousse", lat: 35.8256, lng: 10.6369 },
  { pattern: /\b(?:monastir|mestir)\b|المنستير/i, governorate: "Monastir", lat: 35.777, lng: 10.8262 },
  { pattern: /\b(?:mahdia|mahdiya)\b|المهدية/i, governorate: "Mahdia", lat: 35.5047, lng: 11.0622 },
  { pattern: /\b(?:sfax|sfe9es)\b|صفاقس/i, governorate: "Sfax", lat: 34.7406, lng: 10.7603 },
  { pattern: /\b(?:kairouan|9ayrawan|kayrawan)\b|القيروان/i, governorate: "Kairouan", lat: 35.6781, lng: 10.0963 },
  { pattern: /\b(?:kasserine|gasrine)\b|القصرين/i, governorate: "Kasserine", lat: 35.1676, lng: 8.8365 },
  { pattern: /\b(?:sidi\s*bouzid)\b|سيدي بوزيد/i, governorate: "Sidi Bouzid", lat: 35.0382, lng: 9.4849 },
  { pattern: /\b(?:gab[eè]s|9abes)\b|قابس/i, governorate: "Gabès", lat: 33.8815, lng: 10.0982 },
  { pattern: /\b(?:m[eé]denine)\b|مدنين/i, governorate: "Médenine", lat: 33.3399, lng: 10.4959 },
  { pattern: /\b(?:tataouine|tatawin)\b|تطاوين/i, governorate: "Tataouine", lat: 32.9297, lng: 10.4518 },
  { pattern: /\b(?:gafsa|9afsa)\b|قفصة/i, governorate: "Gafsa", lat: 34.425, lng: 8.7842 },
  { pattern: /\b(?:tozeur|touzer)\b|توزر/i, governorate: "Tozeur", lat: 33.9197, lng: 8.1335 },
  { pattern: /\b(?:k[eé]bili|9bili)\b|قبلي/i, governorate: "Kébili", lat: 33.7044, lng: 8.969 },
];

function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Matches any Tunisian neighborhood, delegation, or governorate inside free text. */
export function lookupLocality(text: string | null | undefined): LocalityMatch | null {
  if (!text) return null;
  for (const entry of TUNISIA_LOCALITIES) {
    if (entry.pattern.test(text)) {
      return {
        governorate: entry.governorate,
        delegation: entry.delegation,
        lat: entry.lat,
        lng: entry.lng,
      };
    }
  }
  return null;
}

export function governoratePoint(governorate: string | null | undefined): GeoPoint | null {
  if (!governorate) return null;
  const direct = POINTS[fold(governorate)];
  if (direct) return direct;
  const local = lookupLocality(governorate);
  return local ? { lat: local.lat, lng: local.lng } : null;
}

/** Best local anchor point: prefers specific delegation/neighborhood over coarse governorate center. */
export function localityPoint(
  delegationOrText: string | null | undefined,
  governorate?: string | null,
): GeoPoint | null {
  if (delegationOrText) {
    const sub = lookupLocality(delegationOrText);
    if (sub && sub.delegation) return { lat: sub.lat, lng: sub.lng };
  }
  return governoratePoint(governorate) ?? (delegationOrText ? governoratePoint(delegationOrText) : null);
}

export const TUNISIA_BOUNDS = { south: 30.2, north: 37.6, west: 7.5, east: 11.7 };

export function inTunisiaBounds(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 30 && lat <= 38 && lng >= 7 && lng <= 12;
}
