import {
  buildAiControlPromptDirectives,
  DEFAULT_AI_CONTROLS,
  type WorkspaceAiControls,
} from "@/lib/context/ai-controls";
import { extractAmountsMillimes, passesPriceFirewall } from "@/lib/domain/firewall";
import type { BuyerLanguage, TextScript } from "@/lib/domain/language";
import { ACTIVE_MARKET } from "@/lib/domain/locale";
import { firewallChecked, formatMillimesForChat } from "@/lib/domain/pricing";
import type { ProCategory, ProProfileRow, ProServiceRow } from "./types";

/**
 * Creator & Professional Style Prompt Composer + Rate & Medical Safety Firewalls.
 *
 * Non-negotiable rules (AGENTS.md):
 * - Model proposes, code decides.
 * - Money only from `src/lib/domain/pricing.ts`, stored as integer millimes.
 * - Model text never invents an amount or rate below floor; every reply passes the price firewall.
 * - Doctor presets must never diagnose or prescribe; emergency symptoms immediately escalate
 *   with a critical alert and SAMU (`190`) guidance.
 * - No timestamps or random IDs inside prompts so cassette replay keys stay stable.
 */

export interface MedicalRedFlagCheck {
  isEmergency: boolean;
  triggers: string[];
}

const MEDICAL_RED_FLAG_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "chest_pain",
    pattern:
      /(?:wja3\s*(?:fel|fi)?\s*(?:sder|9alb|galb)|(?:sderi|9albi|galbi)\s*youja3|وجيعة\s*في\s*الصدر|وجع\s*(?:في\s*)?(?:الصدر|القلب)|صدري\s*يوجع|قلبي\s*يوجع|ألم\s*(?:شديد\s*)?في\s*الصدر|douleur\s*thoracique|mal\s*(?:à\s*la\s*|au\s*)poitrine|crise\s*cardiaque|infarctus|chest\s*pain|heart\s*attack)/i,
  },
  {
    label: "breathing_difficulty",
    pattern:
      /(?:9at3et\s*nfas|nfas\s*ma9tou3|ma\s*najamch\s*netnaffes|manajamch\s*netnaffes|ne9es\s*nfas|ضيق\s*(?:في\s*)?(?:ال)?تنفس|ما\s*نجمش\s*نتنفس|انقطاع\s*النفس|اختناق|مخنوق|difficulté\s*[àa]\s*respirer|n['’]arrive\s*pas\s*[àa]\s*respirer|étouffement|essoufflement\s*sévère|détresse\s*respiratoire|can['’]?t\s*breathe|cannot\s*breathe|shortness\s*of\s*breath|trouble\s*breathing)/i,
  },
  {
    label: "severe_bleeding",
    pattern:
      /(?:dam\s*(?:barcha|9wi|ysob)|nezif|نزيف\s*(?:حاد|قوي)?|دم\s*(?:برشا|قوي|كثير)|hémorragie|saignement\s*abondant|perd\s*beaucoup\s*de\s*sang|severe\s*bleeding|heavy\s*bleeding)/i,
  },
  {
    label: "loss_of_consciousness_or_stroke",
    pattern:
      /(?:f9ad\s*el\s*wa3y|dekh\s*w\s*ta7|ta7\s* مغمى|فقد\s*الوعي|إغماء|داخ\s*وطاح|شلل|جلطة|صرع|perte\s*de\s*connaissance|évanoui|inconscient|paralysie|convulsion|avc\b|unconscious|fainted|passed\s*out|stroke|seizure)/i,
  },
  {
    label: "critical_poisoning_or_infant_emergency",
    pattern:
      /(?:تسمم|انتحار|سخانة\s*قوية\s*(?:برشا\s*)?(?:للرضيع|للببي)|skhana\s*9wiya.*(?:bebe|bébé|rdhi3)|empoisonnement|surdosage|overdose|urgence\s*vitale|suicid)/i,
  },
];

/**
 * Deterministically detects life-threatening medical emergency symptoms in
 * Tunisian Derja (Arabizi & Arabic script), French, Arabic, and English.
 */
export function detectMedicalRedFlag(text: string): MedicalRedFlagCheck {
  const clean = text.trim();
  if (!clean) return { isEmergency: false, triggers: [] };
  const triggers: string[] = [];
  for (const item of MEDICAL_RED_FLAG_PATTERNS) {
    if (item.pattern.test(clean)) {
      triggers.push(item.label);
    }
  }
  return { isEmergency: triggers.length > 0, triggers };
}

const MEDICAL_DIAGNOSIS_OR_RX_ASK =
  /(?:a3tini\s*dwa|chnowa\s*(?:nakhoudh|nakhou)\s*dwa|ektbli\s*dwa|kifeh\s*ndawi|chnia\s*el\s*mardh|chnowa\s*el\s*mardh|اعطيني\s*دواء|شنوة\s*(?:ناخذ|الدواء)|اكتبلي\s*دواء|شنوة\s*مرضي|ما\s*هو\s*تشخيصي|quel\s*médicament\s*prendre|prescrire|ordonnance\s*sans|quel\s*est\s*mon\s*diagnostic|antibiotique\s*sans|what\s*medication\s*should\s*i\s*take|prescribe\s*me|diagnose\s*me)/i;

/** Detects when a patient asks a doctor account to diagnose or prescribe over DM. */
export function detectMedicalDiagnosisOrPrescriptionAsk(text: string): boolean {
  return MEDICAL_DIAGNOSIS_OR_RX_ASK.test(text);
}

const FORBIDDEN_DOCTOR_OUTPUT =
  /(?:je\s+vous\s+prescris|prenez\s+\d+\s*(?:mg|ml|comprim|gélule)|take\s+\d+\s*(?:mg|ml|tablet|pill)|خوذ\s+\d+|نكتبلك\s+دواء|تشخيصك\s+هو|votre\s+diagnostic\s+est|vous\s+souffrez\s+de\s+[a-zà-ÿ]+ite\b|\b(?:amoxicilline|augmentin|azithromycine|cortisone|prednisolone|ciprofloxacine)\s+\d+)/i;

/**
 * Ensures a model-generated doctor reply never prescribes medication/dosages
 * or issues an unexamined medical diagnosis.
 */
export function passesMedicalSafetyFirewall(reply: string): boolean {
  return !FORBIDDEN_DOCTOR_OUTPUT.test(reply);
}

/**
 * Deterministic SAMU 190 emergency response in the patient's language and script.
 * Contains zero prices and immediately directs the patient to emergency care.
 */
export function buildMedicalEmergencyReply(
  language: BuyerLanguage,
  script: TextScript | null,
  displayName?: string,
): string {
  const samu = ACTIVE_MARKET.emergencyNumber;
  const docLabel = displayName?.trim() || "Dr.";
  if (language === "derja" && script === "arabic") {
    return `⚠️ هذي حالة استعجالية! عيشك اتصل فوراً بالإسعاف SAMU على الرقم ${samu} وإلا امشي لأقرب قسم استعجالي (Urgences) توا. ما تستناش رد في الميساجات — بعثنا تنبيه عاجل لـ ${docLabel}.`;
  }
  if (language === "fr") {
    return `⚠️ Urgence médicale détectée : veuillez appeler immédiatement le SAMU au ${samu} ou vous rendre aux urgences les plus proches sans attendre. Une alerte critique a été transmise à ${docLabel}.`;
  }
  if (language === "ar") {
    return `⚠️ هذه حالة طبية طارئة! يرجى الاتصال فوراً بالإسعاف (SAMU) على الرقم ${samu} أو التوجه إلى أقرب قسم طوارئ دون انتظار. تم إرسال تنبيه عاجل إلى ${docLabel}.`;
  }
  if (language === "en") {
    return `⚠️ Medical emergency detected: please call SAMU at ${samu} immediately or go to the nearest emergency room right away. A critical alert has been sent to ${docLabel}.`;
  }
  return `⚠️ Hedhi 7ala isti3jaliya! 3aychek kallem SAMU ${samu} tawa walla emchi l a9reb Urgences fisa3. Ma testannech réponse fel messages — b3athna alerte urgente l ${docLabel}.`;
}

/**
 * Deterministic non-diagnosis / non-prescription boundary reply for Doctor accounts.
 */
export function buildMedicalBoundaryReply(
  language: BuyerLanguage,
  script: TextScript | null,
  service?: ProServiceRow | null,
): string {
  const rateText =
    service?.price_millimes != null ? ` (${formatMillimesForChat(service.price_millimes)})` : "";
  const serviceTitle = service?.title ?? "Consultation au Cabinet";

  if (language === "derja" && script === "arabic") {
    return `على سلامتك! لسلامتك الصحية ما نجموش نشخصو المرض وإلا نكتبو دواء في الميساج من غير فحص طبي. تنجم تحجز ${serviceTitle}${rateText} — عطيني اسمك الكامل، رقم التليفون (+216)، والنهار اللي يساعدك.`;
  }
  if (language === "fr") {
    return `Pour votre sécurité médicale, nous ne pouvons ni poser un diagnostic ni prescrire un traitement par message sans examen clinique. Nous pouvons planifier une ${serviceTitle}${rateText} : envoyez-moi votre nom complet, votre numéro (+216) et le créneau souhaité.`;
  }
  if (language === "ar") {
    return `لسلامتك الطبية، لا يمكن تشخيص الحالة أو وصف دواء عبر الرسائل دون فحص سريري. يمكنك حجز ${serviceTitle}${rateText}: أرسل اسمك الكامل ورقم هاتفك (+216) والموعد المفضل.`;
  }
  if (language === "en") {
    return `For your medical safety, we cannot diagnose a condition or prescribe medication over DM without an examination. To book a ${serviceTitle}${rateText}, please share your full name, phone number (+216), and preferred day/time.`;
  }
  return `3la slamtek! L slamtek el sa77iya ma najamouch nchakhssou walla na3tiw dwa fel messages بلاش فحص. Tnajem ta7jez ${serviceTitle}${rateText} — a3tini esmek, numrok (+216), w el nhar elli ysa3dek.`;
}

export interface ProRateDecision {
  action: "quote_standard" | "accept_counter" | "clamp_to_floor";
  quotedMillimes: number | null;
  listMillimes: number | null;
  floorMillimes: number | null;
  acceptedClientBudget: boolean;
  belowFloor: boolean;
}

/**
 * Deterministic rate negotiation and floor clamp engine for Creator/Pro services
 * and brand deals. Never allows a quote below `floor_millimes` (or `minDealBudgetMillimes`).
 */
export function resolveProServiceOfferMillimes(input: {
  service: Pick<ProServiceRow, "price_millimes" | "floor_millimes" | "pricing_mode"> | null;
  minDealBudgetMillimes?: number | null;
  proposedBudgetMillimes: number | null;
  asksDiscountOrGifted: boolean;
}): ProRateDecision {
  const listMillimes = input.service?.price_millimes ?? input.minDealBudgetMillimes ?? null;
  const rawFloor =
    input.service?.floor_millimes ??
    input.service?.price_millimes ??
    input.minDealBudgetMillimes ??
    null;
  const floorMillimes =
    rawFloor !== null && listMillimes !== null ? Math.min(rawFloor, listMillimes) : rawFloor;

  if (input.proposedBudgetMillimes !== null) {
    if (floorMillimes !== null && input.proposedBudgetMillimes < floorMillimes) {
      return {
        action: "clamp_to_floor",
        quotedMillimes: floorMillimes,
        listMillimes,
        floorMillimes,
        acceptedClientBudget: false,
        belowFloor: true,
      };
    }
    if (
      listMillimes !== null &&
      floorMillimes !== null &&
      input.proposedBudgetMillimes >= floorMillimes &&
      input.proposedBudgetMillimes < listMillimes
    ) {
      return {
        action: "accept_counter",
        quotedMillimes: input.proposedBudgetMillimes,
        listMillimes,
        floorMillimes,
        acceptedClientBudget: true,
        belowFloor: false,
      };
    }
    return {
      action: "quote_standard",
      quotedMillimes: listMillimes ?? input.proposedBudgetMillimes,
      listMillimes,
      floorMillimes,
      acceptedClientBudget: true,
      belowFloor: false,
    };
  }

  if (input.asksDiscountOrGifted && floorMillimes !== null) {
    return {
      action: "clamp_to_floor",
      quotedMillimes: floorMillimes,
      listMillimes,
      floorMillimes,
      acceptedClientBudget: false,
      belowFloor: true,
    };
  }

  return {
    action: "quote_standard",
    quotedMillimes: listMillimes,
    listMillimes,
    floorMillimes,
    acceptedClientBudget: false,
    belowFloor: false,
  };
}

/**
 * Collects the exact set of integer millime amounts allowed to appear in a
 * model-written Pro reply. Never includes any amount below `floorMillimes`.
 * Optionally merges standard list prices of other active services so the AI
 * can naturally answer multi-service inquiries while keeping floor protection.
 */
export function collectAllowedProMillimes(
  decision: ProRateDecision,
  extraServiceMillimes?: number[],
): number[] {
  const floor = decision.floorMillimes ?? 0;
  const candidates = [
    decision.quotedMillimes,
    decision.listMillimes,
    decision.floorMillimes,
    ...(extraServiceMillimes ?? []),
  ];
  const uniq = new Set<number>();
  for (const m of candidates) {
    if (typeof m === "number" && Number.isInteger(m) && m >= floor && m > 0) {
      uniq.add(m);
    }
  }
  return [...uniq];
}

const FALSE_FREE_PROMISE =
  /\b(?:0\s*(?:dt|dinar)|billech|(?<!(?:parking|stationnement|wifi|wi-fi|livraison|acc[eè]s)\s+)gratuit(?:e|ement)?|for\s+free|free\s+collab|مجانا|بلاش\s*فلوس)\b/i;

/**
 * Normalizes English/French thousands separators in DT amounts (e.g. "1,200 DT" or "1 200 DT")
 * to canonical `pricing.ts` format ("1200DT") when the whole-thousand dinar value is an
 * allowed amount (and the decimal-millime interpretation is not).
 */
export function normalizeProReplyAmounts(reply: string, allowedMillimes: number[]): string {
  const allowedSet = new Set(allowedMillimes);
  return reply.replace(
    /\b(\d{1,3})[,\s](\d{3})\s*(dt|dinar|dinars|دينار)\b/gi,
    (full, head: string, tail: string) => {
      const asThousandsMillimes = (Number(head) * 1000 + Number(tail)) * 1000;
      const asDecimalMillimes = Number(head) * 1000 + Number(tail);
      if (allowedSet.has(asThousandsMillimes) && !allowedSet.has(asDecimalMillimes)) {
        return formatMillimesForChat(asThousandsMillimes);
      }
      return full;
    },
  );
}

/**
 * Verifies that a model reply:
 * 1. Only mentions DT/alf amounts producible from `allowedMillimes` via `pricing.ts`.
 * 2. Never mentions any amount below `floorMillimes`.
 * 3. Never promises free/gifted work when a positive `floorMillimes` is active.
 */
export function passesProRateFirewall(
  reply: string,
  allowedMillimes: number[],
  floorMillimes: number | null,
): boolean {
  const normalized = normalizeProReplyAmounts(reply, allowedMillimes);
  if (!passesPriceFirewall(normalized, new Set(allowedMillimes))) return false;
  if (firewallChecked(normalized, allowedMillimes) === null) return false;
  const extracted = extractAmountsMillimes(normalized);
  if (floorMillimes !== null && floorMillimes > 0) {
    if (extracted.some((amt) => amt < floorMillimes)) return false;
    if (FALSE_FREE_PROMISE.test(normalized)) return false;
  }
  return true;
}

/** Builds a Google Maps pin URL for a clinic or studio when coordinates or address exist. */
export function buildProLocationPinUrl(
  profile: Pick<ProProfileRow, "lat" | "lng" | "clinic_or_studio_address" | "location_city">,
): string | null {
  if (typeof profile.lat === "number" && typeof profile.lng === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${profile.lat},${profile.lng}`;
  }
  const addr = profile.clinic_or_studio_address?.trim();
  if (addr) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
  }
  return null;
}

const LANGUAGE_DIRECTIVE: Record<BuyerLanguage, string> = {
  derja:
    "Reply in natural Tunisian Derja (Arabizi, mixing everyday French loanwords the way Tunisians text on WhatsApp/Instagram).",
  fr: "Reply in clear, natural, professional French.",
  ar: "Reply in clear, polite Modern Standard Arabic.",
  en: "Reply in clear, natural English.",
};

/**
 * Deterministic persona style system prompt builder.
 * Contains zero timestamps and zero random UUIDs so replay cassette keys remain stable.
 */
export function buildProStyleSystemPrompt(input: {
  profile: ProProfileRow;
  language: BuyerLanguage;
  script: TextScript | null;
  allowedMillimes: number[];
  activeService?: ProServiceRow | null;
  knowledgeBlock?: string | null;
  conversationHistory?: string | null;
  controls?: WorkspaceAiControls;
}): string {
  const { profile, language, script, allowedMillimes, activeService, knowledgeBlock, conversationHistory } = input;
  const controls = input.controls ?? DEFAULT_AI_CONTROLS;
  const controlDirectives = buildAiControlPromptDirectives(controls, language);
  const languageInstruction =
    language === "derja" && script === "arabic"
      ? "Reply in natural Tunisian Derja written in Arabic script (not formal MSA, not Latin Arabizi)."
      : LANGUAGE_DIRECTIVE[language];

  const samplesBlock =
    profile.style_samples.length > 0
      ? profile.style_samples
        .slice(0, 6)
        .map((s, idx) => `Example ${idx + 1} (${s.situation}): "${s.reply}"`)
        .join("\n")
      : "No sample texts provided; keep the tone warm, natural, concise, and authentic to Tunisia.";

  const allowedFormatted =
    allowedMillimes.length > 0
      ? allowedMillimes.map((m) => formatMillimesForChat(m)).join(", ")
      : "None (do NOT write any price or money amount in this reply)";

  const safetyRule =
    profile.profession_preset === ("doctor" as ProCategory)
      ? `MEDICAL SAFETY FIREWALL: You represent a medical clinic (${profile.display_name}). NEVER diagnose a condition, NEVER prescribe or suggest medication/dosages over DM. If the patient has emergency symptoms, tell them to call SAMU ${ACTIVE_MARKET.emergencyNumber} immediately.`
      : `BOUNDARY FIREWALL: Never commit to a binding date/contract or accept gifted/unpaid work without ${profile.display_name}'s explicit confirmation.`;

  return [
    `You are replying to a direct message as ${profile.display_name} (${profile.headline}), texting like a real human on WhatsApp/Instagram — NEVER like a rigid template or automated form.`,
    `Profession track: ${profile.profession_preset} in ${profile.location_city}, Tunisia.`,
    profile.bio ? `Bio: ${profile.bio}` : null,
    profile.clinic_or_studio_address ? `Address / Location: ${profile.clinic_or_studio_address}` : null,
    activeService
      ? `Active Service Package: ${activeService.title} (${activeService.duration_label}) — ${activeService.description}`
      : null,
    knowledgeBlock ? `Full Workspace Knowledge & Live Updates:\n${knowledgeBlock}` : null,
    `Voice & Style Rules: ${profile.style_rules}`,
    `Hard Boundaries: ${profile.boundaries_note}`,
    safetyRule,
    `Style Examples in ${profile.display_name}'s real voice:\n${samplesBlock}`,
    conversationHistory ? `Recent Conversation History (do NOT repeat greetings or already-answered points):\n${conversationHistory}` : null,
    `Language Directive: ${languageInstruction}`,
    controlDirectives,
    `PRICE FIREWALL: Allowed price amounts in this reply: ${allowedFormatted}. NEVER invent, discount, or alter any amount. Never quote below the minimum floor.`,
    "CONVERSATIONAL DISCIPLINE: Answer what the client actually asked first using the workspace knowledge & calendar schedule above. Do not repeat robotic phrases or re-ask details already given. No markdown headings or bullet templates.",
  ]
    .filter(Boolean)
    .join("\n");
}
