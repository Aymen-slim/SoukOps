import { z } from "zod";
import { transcribe } from "@/lib/ai/asr";
import { cosineSimilarity, embedConfigured, embedTexts } from "@/lib/ai/embeddings";
import { sparkJson, sparkText } from "@/lib/ai/spark";
import {
  createCalendarEvent,
  getCalendarConnection,
  listUpcomingBusyEvents,
} from "@/lib/calendar/calendar-store";
import {
  findCalendarConflicts,
  parseDurationMinutes,
  parseRequestedDateToSlot,
} from "@/lib/calendar/date-parser";
import { pushEventToGoogleCalendar } from "@/lib/calendar/google-calendar";
import { channelAdapter } from "@/lib/channels";
import {
  DEFAULT_AI_CONTROLS,
  loadWorkspaceAiControls,
  maxReplyCharsForLength,
  resolveControlledReplyLanguage,
  type WorkspaceAiControls,
} from "@/lib/context/ai-controls";
import { loadProKnowledgePacket, loadRecentConversationHistory } from "@/lib/context/workspace-context";
import {
  DERJA_GLOSSARY,
  extractCustomerName,
  extractGovernorate,
  extractNameWithPhone,
  extractPhone,
  normalizeTunisianPhone,
  parseMoneyMillimes,
} from "@/lib/domain/derja";
import { extractAmountsMillimes } from "@/lib/domain/firewall";
import {
  buyerLanguageOf,
  buyerScriptOf,
  detectTextScript,
  resolveBuyerLanguage,
  type BuyerLanguage,
  type TextScript,
} from "@/lib/domain/language";
import { formatMillimesForChat } from "@/lib/domain/pricing";
import { logEvent } from "@/lib/pipeline/events";
import { asrBias } from "@/lib/pipeline/seller-voice";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchProAlertNotifications } from "./notify";
import { getProPreset } from "./presets";
import {
  buildMedicalBoundaryReply,
  buildMedicalEmergencyReply,
  buildProLocationPinUrl,
  buildProStyleSystemPrompt,
  collectAllowedProMillimes,
  detectMedicalDiagnosisOrPrescriptionAsk,
  detectMedicalRedFlag,
  normalizeProReplyAmounts,
  passesMedicalSafetyFirewall,
  passesProRateFirewall,
  resolveProServiceOfferMillimes,
  type ProRateDecision,
} from "./style-prompt";
import {
  isProCategory,
  type ProCategory,
  type ProProfileRow,
  type ProServiceRow,
  type ServiceInquiryStatus,
} from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ProMessageRow {
  id: string;
  kind: string;
  body: string | null;
  media_path: string | null;
  created_at: string;
}

export interface ProConversationRow {
  id: string;
  merchant_id: string;
  customer_id: string | null;
  slots: Record<string, unknown> | null;
  negotiation: Record<string, unknown> | null;
  ai_paused: boolean | null;
  updated_at: string;
}

export const proUnderstandSchema = z.object({
  intent: z.enum([
    "service_inquiry",
    "rate_negotiation",
    "ask_location",
    "brand_opportunity",
    "fan_message",
    "medical_emergency",
    "angry_or_human",
    "greeting",
    "other",
  ]),
  matchedServiceIndex: z.number().int().min(0).max(20).nullable(),
  clientName: z.string().nullable(),
  clientPhone: z.string().nullable(),
  requestedDate: z.string().nullable(),
  locationOrVenue: z.string().nullable(),
  scopeSummary: z.string().nullable(),
  deliverablesRequested: z.string().nullable(),
  proposedBudgetMillimes: z.number().int().nullable(),
  asksDiscountOrGifted: z.boolean(),
  flags: z.object({
    isMedicalEmergency: z.boolean(),
    asksMedicalDiagnosisOrPrescription: z.boolean(),
    insultOrAngry: z.boolean(),
    wantsHuman: z.boolean(),
    isHighValueOpportunity: z.boolean(),
  }),
});

export type ProUnderstanding = z.infer<typeof proUnderstandSchema>;

export const proUnifiedTurnSchema = proUnderstandSchema.extend({
  replyText: z.string().nullable(),
});

export type ProUnifiedTurn = z.infer<typeof proUnifiedTurnSchema>;

const nullableString = { type: ["string", "null"] };
export const proUnderstandJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "intent",
    "matchedServiceIndex",
    "clientName",
    "clientPhone",
    "requestedDate",
    "locationOrVenue",
    "scopeSummary",
    "deliverablesRequested",
    "proposedBudgetMillimes",
    "asksDiscountOrGifted",
    "flags",
  ],
  properties: {
    intent: {
      type: "string",
      enum: [
        "service_inquiry",
        "rate_negotiation",
        "ask_location",
        "brand_opportunity",
        "fan_message",
        "medical_emergency",
        "angry_or_human",
        "greeting",
        "other",
      ],
    },
    matchedServiceIndex: { type: ["integer", "null"] },
    clientName: nullableString,
    clientPhone: nullableString,
    requestedDate: nullableString,
    locationOrVenue: nullableString,
    scopeSummary: nullableString,
    deliverablesRequested: nullableString,
    proposedBudgetMillimes: { type: ["integer", "null"] },
    asksDiscountOrGifted: { type: "boolean" },
    flags: {
      type: "object",
      additionalProperties: false,
      required: [
        "isMedicalEmergency",
        "asksMedicalDiagnosisOrPrescription",
        "insultOrAngry",
        "wantsHuman",
        "isHighValueOpportunity",
      ],
      properties: {
        isMedicalEmergency: { type: "boolean" },
        asksMedicalDiagnosisOrPrescription: { type: "boolean" },
        insultOrAngry: { type: "boolean" },
        wantsHuman: { type: "boolean" },
        isHighValueOpportunity: { type: "boolean" },
      },
    },
  },
};

export const proUnifiedTurnJsonSchema: Record<string, unknown> = {
  ...proUnderstandJsonSchema,
  required: [...(proUnderstandJsonSchema.required as string[]), "replyText"],
  properties: {
    ...(proUnderstandJsonSchema.properties as Record<string, unknown>),
    replyText: nullableString,
  },
};

const EMPTY_PRO_UNDERSTANDING: ProUnderstanding = {
  intent: "other",
  matchedServiceIndex: null,
  clientName: null,
  clientPhone: null,
  requestedDate: null,
  locationOrVenue: null,
  scopeSummary: null,
  deliverablesRequested: null,
  proposedBudgetMillimes: null,
  asksDiscountOrGifted: false,
  flags: {
    isMedicalEmergency: false,
    asksMedicalDiagnosisOrPrescription: false,
    insultOrAngry: false,
    wantsHuman: false,
    isHighValueOpportunity: false,
  },
};

const SERVICE_SYNONYMS: Array<{ pattern: RegExp; tokens: string[] }> = [
  {
    pattern: /\b(?:t[eé]l[eé]consultation|visio|en\s*ligne|lecture\s*de\s*bilan|تحاليل|تليكونسلتاسيون|عن\s*بعد)\b/i,
    tokens: ["teleconsultation", "téléconsultation", "bilan"],
  },
  {
    pattern: /\b(?:certificat|checkup|pr[eé]ventif|sport|شهادة\s*طبية)\b/i,
    tokens: ["checkup", "certificat", "préventif"],
  },
  {
    pattern: /\b(?:consultation|cabinet|visite|rdv|rendez[\s-]*vous|طبيب|موعد|عيادة|كونسلتاسيون)\b/i,
    tokens: ["consultation", "cabinet"],
  },
  {
    pattern: /\b(?:mariage|outia|3ers|عرس|وطية|wedding|fian[cç]ailles)\b/i,
    tokens: ["mariage", "outia", "event"],
  },
  {
    pattern: /\b(?:shooting\s*produit|studio|photos?\s*produit|e-?commerce|packshot)\b/i,
    tokens: ["studio", "produit"],
  },
  {
    pattern: /\b(?:reel|reels|tournage|clip|brand|commercial|pub|drone|vid[eé]o|فيديو|ريلز)\b/i,
    tokens: ["commercial", "reel", "reels", "brand"],
  },
  {
    pattern: /\b(?:ugc|paid\s*ads|meta\s*ads|tiktok\s*ads|sans\s*publication)\b/i,
    tokens: ["ugc"],
  },
  {
    pattern: /\b(?:[eé]v[eé]nement|event|hosting|animation|pr[eé]sence|inauguration|lancement\s*boutique)\b/i,
    tokens: ["appearance", "événement", "hosting"],
  },
  {
    pattern: /\b(?:sponsor|sponsoris[eé]|collab|collaboration|partenariat|story|stories|ambassad)\b/i,
    tokens: ["sponsorship", "sponsored", "reel"],
  },
];

/**
 * Deterministic service matcher across Derja (Arabizi/Arabic), French, Arabic, and English.
 */
export function matchProServiceDeterministic(
  text: string,
  services: ProServiceRow[],
): { service: ProServiceRow; index: number; score: number } | null {
  if (services.length === 0) return null;
  const clean = text.toLowerCase().trim();
  if (!clean) return null;

  const activeSynTokens = new Set<string>();
  for (const syn of SERVICE_SYNONYMS) {
    if (syn.pattern.test(clean)) {
      for (const tok of syn.tokens) activeSynTokens.add(tok.toLowerCase());
    }
  }

  let bestIndex = -1;
  let bestScore = 0;

  for (let i = 0; i < services.length; i++) {
    const svc = services[i]!;
    const haystack = `${svc.title} ${svc.category} ${svc.description} ${svc.deliverables.join(" ")}`.toLowerCase();
    let score = 0;

    for (const synTok of activeSynTokens) {
      if (haystack.includes(synTok)) score += 3;
    }

    const titleWords = svc.title
      .toLowerCase()
      .split(/[^a-z0-9à-ÿ\u0600-\u06FF]+/)
      .filter((w) => w.length >= 3);
    for (const word of titleWords) {
      if (clean.includes(word)) score += 2;
    }

    if (svc.category && clean.includes(svc.category.toLowerCase())) {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  if (bestIndex >= 0 && bestScore > 0) {
    return { service: services[bestIndex]!, index: bestIndex, score: bestScore };
  }
  return null;
}

/**
 * Semantic lookup against `pro_services` (using `gemini-embedding-2` + `match_pro_services` RPC
 * when configured) combined with deterministic keyword matching fallback.
 */
export async function lookupProServicesSemantic(
  supabase: AdminClient,
  merchantId: string,
  queryText: string,
  services: ProServiceRow[],
  conversationId?: string,
): Promise<{ service: ProServiceRow; index: number; source: "vector" | "deterministic" } | null> {
  if (services.length === 0) return null;
  const det = matchProServiceDeterministic(queryText, services);

  if (queryText.trim().length >= 4 && embedConfigured()) {
    try {
      const [vector] = await embedTexts([queryText.slice(0, 400)], conversationId);
      if (vector) {
        const { data: rpcHits } = await supabase.rpc("match_pro_services", {
          p_merchant: merchantId,
          p_embedding: vector,
          p_k: 3,
        });
        if (Array.isArray(rpcHits) && rpcHits.length > 0) {
          const topHit = rpcHits[0] as { service_id?: string; distance?: number };
          const distance = typeof topHit.distance === "number" ? topHit.distance : 1;
          const idx = services.findIndex((s) => s.id === topHit.service_id);
          if (idx >= 0 && distance <= 0.45) {
            return { service: services[idx]!, index: idx, source: "vector" };
          }
        }
      }
    } catch {
      // Fall back to deterministic match when vector RPC or embedding provider is offline.
    }
  }

  if (det) {
    return { service: det.service, index: det.index, source: "deterministic" };
  }
  return null;
}

export interface ProOpportunityLookupHit {
  opportunityId: string;
  title: string;
  brandOrClient: string;
  budgetMillimes: number | null;
  score: number;
  source: "vector" | "keyword";
}

/**
 * Semantic & keyword lookup against existing `opportunities` for the merchant
 * so inbound DMs referencing or matching a board/DM brief link cleanly.
 */
export async function lookupProOpportunitiesSemantic(
  supabase: AdminClient,
  merchantId: string,
  queryText: string,
  profile: ProProfileRow,
  queryVector?: number[] | null,
): Promise<ProOpportunityLookupHit | null> {
  const clean = queryText.toLowerCase().trim();
  if (clean.length < 6) return null;

  try {
    const { data } = await supabase
      .from("opportunities")
      .select("id, title, brand_or_client, description, budget_millimes, embedding")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(20);

    const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    if (rows.length === 0) return null;

    let best: ProOpportunityLookupHit | null = null;
    for (const row of rows) {
      const id = typeof row.id === "string" ? row.id : "";
      const title = typeof row.title === "string" ? row.title : "";
      const brand = typeof row.brand_or_client === "string" ? row.brand_or_client : "";
      const desc = typeof row.description === "string" ? row.description : "";
      const budget = typeof row.budget_millimes === "number" ? row.budget_millimes : null;
      if (!id || !title) continue;

      let vectorSim = 0;
      if (
        queryVector &&
        Array.isArray(row.embedding) &&
        row.embedding.length === queryVector.length
      ) {
        vectorSim = cosineSimilarity(queryVector, row.embedding as number[]);
      }

      const brandTokens = brand
        .toLowerCase()
        .split(/[^a-z0-9à-ÿ\u0600-\u06FF]+/)
        .filter((w) => w.length >= 3);
      const titleTokens = title
        .toLowerCase()
        .split(/[^a-z0-9à-ÿ\u0600-\u06FF]+/)
        .filter((w) => w.length >= 4);

      let keywordHits = 0;
      for (const tok of brandTokens) {
        if (clean.includes(tok)) keywordHits += 3;
      }
      for (const tok of titleTokens) {
        if (clean.includes(tok)) keywordHits += 1;
      }
      for (const kw of profile.opportunity_keywords) {
        const lowerKw = kw.toLowerCase();
        if (clean.includes(lowerKw) && `${title} ${desc}`.toLowerCase().includes(lowerKw)) {
          keywordHits += 1;
        }
      }

      const combinedScore = vectorSim >= 0.65 ? Math.round(vectorSim * 100) : keywordHits * 15;
      if (combinedScore >= 45 && (!best || combinedScore > best.score)) {
        best = {
          opportunityId: id,
          title,
          brandOrClient: brand,
          budgetMillimes: budget,
          score: Math.min(99, combinedScore),
          source: vectorSim >= 0.65 ? "vector" : "keyword",
        };
      }
    }
    return best;
  } catch {
    return null;
  }
}

const DATE_EXTRACTOR =
  /\b((?:nhar\s+el\s+[a-z0-9]+|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|ghodwa|demain|après[\s-]*demain|la\s+semaine\s+prochaine|ce\s+week[\s-]*end|\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|جانفي|فيفري|مارس|أفريل|ماي|جوان|جويلية|أوت|سبتمبر|أكتوبر|نوفمبر|ديسمبر)|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)(?:\s+(?:sbah|3chiya|matin|après[\s-]*midi|soir|à\s*\d{1,2}h\d{0,2}|الصبح|العشية))?|(?:sbah|3chiya|matin|après[\s-]*midi)\s+(?:ghodwa|demain)|يوم\s+(?:السبت|الأحد|الإثنين|الثلاثاء|الأربعاء|الخميس|الجمعة)(?:\s+(?:صباحا|مساء|الصبح|العشية))?|غدوة\s*(?:الصبح|العشية)?)\b/i;

const VENUE_EXTRACTOR =
  /\b(?:fi|fel|à|au|a|في)\s+((?:la\s+marsa|marsa|lac\s*[12]?|les\s+berges\s+du\s+lac|ennasr\s*[12]?|hammamet|sousse|djerba|sfax|bizerte|monastir|nabeul|mahdia|gammarth|carthage|sidi\s+bou\s+said|ariana|manar|menzah|bardo|centre\s+urbain\s+nord|tunis|حمامات|سوسة|جربة|صفاقس|تونس|المرسى|البحيرة|النصر|أريانة|قمرت)(?:\s*[,/-]?\s*(?:salle|hôtel|hotel|studio|clinique|dar)\s+[A-Za-zÀ-ÿ0-9\u0600-\u06FF'’-]+)?)\b/i;

const DISCOUNT_OR_GIFTED_PATTERN =
  /\b(?:na9es|na9as|n9es|ghali|ghalia|remise|rabais|moins\s+cher|gratuit|gifted|sans\s+budget|échange\s+de\s+visibilité|cadeau|barter|نقص|غالي|مجانا|هدية)\b/i;

const LOCATION_ASK_PATTERN =
  /\b(?:win\s+(?:el\s+)?(?:cabinet|studio|adresse|blasa)|adresse\s+exacte|localisation|pin|gps|maps|où\s+se\s+trouve|وين\s+(?:العيادة|الستوديو|العنوان)|لوكاليزاسيون)\b/i;

const BRAND_OPPORTUNITY_PATTERN =
  /\b(?:campagne|sponsor|sponsoris[eé]|collaboration|partenariat|ambassad|marque|agence|brief|lancement|retainer|contrat|شراكة|إشهار|حملة|ماركة)\b/i;

const FAN_LOVE_PATTERN =
  /\b(?:n7ebbek|nhebbek|bravo|fan|adora|meilleure?\s+créat|نحبك|برافو|يعطيك\s+الصحة\s+على\s+المحتوى|أحسن\s+صانع)\b/i;

const ANGRY_OR_HUMAN_PATTERN =
  /\b(?:n7eb\s+nahki\s+m3a|responsable|humain|personne\s+réelle|arnaque|nul|فضيحة|نحب\s+نحكي\s+مع)\b/i;

export function extractRequestedDate(text: string): string | null {
  const match = text.match(DATE_EXTRACTOR);
  return match?.[1]?.trim() ?? null;
}

export function extractLocationOrVenue(text: string): string | null {
  const venue = text.match(VENUE_EXTRACTOR);
  if (venue?.[1]) return venue[1].trim();
  const gov = extractGovernorate(text);
  if (gov) return gov.delegation ? `${gov.delegation}, ${gov.governorate}` : gov.governorate;
  return null;
}

const PRO_NAME_STOPWORDS =
  /\b(?:intéressé|interesse|disponible|malade|patient|client|docteur|urgent|b9addech|combien|tournage|mariage|consultation|sponsor|marque|agence)\b/i;

/**
 * Extracts a client or contact name across Arabizi Derja, Arabic-script Derja,
 * French, and English ("esmi Karim", "اسمي سارة", "je suis Amine", "معاك ياسين").
 */
export function extractProClientName(text: string): string | null {
  const base = extractCustomerName(text) ?? extractNameWithPhone(text);
  if (base) return base;

  const arabicIntro = text.match(
    /(?:اسمي|إسمي|معاك|أنا)\s+([\u0600-\u06FF]{2,20}(?:\s+[\u0600-\u06FF]{2,20}){0,2})/,
  );
  if (arabicIntro?.[1]) {
    const candidate = arabicIntro[1]
      .replace(/\s+(?:نحب|بغيت|عندي|من|في|رقمي|تليفوني).*$/, "")
      .trim();
    if (candidate.length >= 2) return candidate;
  }

  const latinIntro = text.match(
    /(?:je\s+suis|moi\s+c['’]est|ma3ak|m3ak)\s+([A-ZÀ-Ÿa-zà-ÿ][A-Za-zÀ-ÿ'’-]{1,24}(?:\s+[A-ZÀ-Ÿa-zà-ÿ][A-Za-zÀ-ÿ'’-]{1,24}){0,1})/i,
  );
  if (latinIntro?.[1]) {
    const candidate = latinIntro[1]
      .replace(/\b(?:de|du|pour|et|w|num|tél|tel)\b.*$/i, "")
      .trim();
    if (candidate.length >= 2 && !PRO_NAME_STOPWORDS.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Parses Derja & French money expressions into integer millimes, including
 * thousands-separated amounts like "1,200 DT", "1 800 DT", and "malyoun w nos" (1,500 DT).
 */
export function parseProBudgetMillimes(text: string): number | null {
  const normalized = text.toLowerCase().trim();
  if (/\bmalyoun\s+w\s+(?:nos|noss|chtar)\b|مليون\s+ونص/.test(normalized)) {
    return 1_500_000;
  }
  // Thousands-grouped whole dinars: "1,200 DT", "1 800 DT", "2,500 dinars"
  const groupedThousands = normalized.match(
    /\b([1-9]\d{0,2})[,\s](\d00)\s*(?:dt|dinar|dinars|دينار)\b/i,
  );
  if (groupedThousands) {
    const dinars = Number(groupedThousands[1]) * 1000 + Number(groupedThousands[2]);
    return dinars * 1000;
  }
  return parseMoneyMillimes(text);
}

/**
 * Deterministic fallback enrichment over `proUnderstandSchema` so critical
 * intake slots, budgets, safety flags, and service matches never drop.
 */
export function applyProDeterministicFallbacks(
  text: string,
  base: ProUnderstanding,
  services: ProServiceRow[],
  preset: ProCategory,
): ProUnderstanding {
  const clean = text.trim();
  const redFlag = detectMedicalRedFlag(clean);
  const asksDiagOrRx = preset === "doctor" && detectMedicalDiagnosisOrPrescriptionAsk(clean);
  const phone = base.clientPhone
    ? (normalizeTunisianPhone(base.clientPhone) ?? extractPhone(clean))
    : extractPhone(clean);
  const name =
    base.clientName?.trim() ||
    extractProClientName(clean) ||
    null;
  const date = base.requestedDate?.trim() || extractRequestedDate(clean);
  const location = base.locationOrVenue?.trim() || extractLocationOrVenue(clean);
  const budget = base.proposedBudgetMillimes ?? parseProBudgetMillimes(clean);
  const asksDiscount = base.asksDiscountOrGifted || DISCOUNT_OR_GIFTED_PATTERN.test(clean);

  const detService = matchProServiceDeterministic(clean, services);
  const matchedServiceIndex =
    base.matchedServiceIndex !== null &&
      base.matchedServiceIndex >= 0 &&
      base.matchedServiceIndex < services.length
      ? base.matchedServiceIndex
      : (detService?.index ?? null);

  let intent = base.intent;
  if (preset === "doctor" && (redFlag.isEmergency || base.flags.isMedicalEmergency)) {
    intent = "medical_emergency";
  } else if (ANGRY_OR_HUMAN_PATTERN.test(clean) || base.flags.insultOrAngry || base.flags.wantsHuman) {
    intent = "angry_or_human";
  } else if (LOCATION_ASK_PATTERN.test(clean) && intent === "other") {
    intent = "ask_location";
  } else if (asksDiscount || (budget !== null && matchedServiceIndex !== null)) {
    intent = intent === "brand_opportunity" ? "brand_opportunity" : "rate_negotiation";
  } else if (BRAND_OPPORTUNITY_PATTERN.test(clean) && (preset === "creator" || preset === "cameraman")) {
    intent = matchedServiceIndex !== null && intent === "service_inquiry" ? "service_inquiry" : "brand_opportunity";
  } else if (
    preset === "creator" &&
    FAN_LOVE_PATTERN.test(clean) &&
    matchedServiceIndex === null &&
    budget === null &&
    !BRAND_OPPORTUNITY_PATTERN.test(clean)
  ) {
    intent = "fan_message";
  } else if (
    intent === "other" &&
    (matchedServiceIndex !== null || date !== null || location !== null || phone !== null)
  ) {
    intent = "service_inquiry";
  }

  const scopeSummary =
    base.scopeSummary?.trim() ||
    (matchedServiceIndex !== null ? services[matchedServiceIndex]?.title ?? null : null);

  const isHighValueOpportunity =
    base.flags.isHighValueOpportunity ||
    intent === "brand_opportunity" ||
    ((preset === "creator" || preset === "cameraman") && BRAND_OPPORTUNITY_PATTERN.test(clean)) ||
    (budget !== null && budget >= 700_000);

  return {
    ...base,
    intent,
    matchedServiceIndex,
    clientName: name,
    clientPhone: phone,
    requestedDate: date,
    locationOrVenue: location,
    scopeSummary,
    proposedBudgetMillimes: budget,
    asksDiscountOrGifted: asksDiscount,
    flags: {
      isMedicalEmergency: preset === "doctor" && (redFlag.isEmergency || base.flags.isMedicalEmergency),
      asksMedicalDiagnosisOrPrescription:
        preset === "doctor" && (asksDiagOrRx || base.flags.asksMedicalDiagnosisOrPrescription),
      insultOrAngry: base.flags.insultOrAngry,
      wantsHuman: base.flags.wantsHuman || ANGRY_OR_HUMAN_PATTERN.test(clean),
      isHighValueOpportunity,
    },
  };
}

const PRICE_QUESTION_PATTERN =
  /\b(?:b9addech|b9adech|combien|prix|tarif|soum|rate|price|how\s+much|devis|budget|forfait|pack)\b|بقداش|سعر|شحال/i;

/**
 * Single unified Gemini call: extracts structured intake/opportunity signals AND writes
 * a natural, human-sounding reply using full workspace knowledge & conversation history.
 * Eliminates the redundant 2-LLM-call round trip on normal chat turns.
 */
export async function understandAndReplyProTurn(req: {
  text: string;
  images?: string[];
  services: ProServiceRow[];
  profile: ProProfileRow;
  priorSlots: Record<string, unknown>;
  language: BuyerLanguage;
  script: TextScript | null;
  knowledgeBlock: string;
  conversationHistory: string;
  allowedMillimes: number[];
  preRateHint?: string | null;
  calendarHint?: string | null;
  activeService?: ProServiceRow | null;
  controls?: WorkspaceAiControls;
  conversationId?: string;
}): Promise<{ understanding: ProUnderstanding; replyText: string | null }> {
  const priorContextParts: string[] = [];
  if (typeof req.priorSlots.matchedServiceTitle === "string") {
    priorContextParts.push(`service=${req.priorSlots.matchedServiceTitle}`);
  }
  if (typeof req.priorSlots.clientName === "string") {
    priorContextParts.push(`clientName=${req.priorSlots.clientName}`);
  }
  if (typeof req.priorSlots.clientPhone === "string") {
    priorContextParts.push(`clientPhone=${req.priorSlots.clientPhone}`);
  }
  if (typeof req.priorSlots.requestedDate === "string") {
    priorContextParts.push(`requestedDate=${req.priorSlots.requestedDate}`);
  }
  if (typeof req.priorSlots.locationOrVenue === "string") {
    priorContextParts.push(`locationOrVenue=${req.priorSlots.locationOrVenue}`);
  }

  const stylePrompt = buildProStyleSystemPrompt({
    profile: req.profile,
    language: req.language,
    script: req.script,
    allowedMillimes: req.allowedMillimes,
    activeService: req.activeService,
    knowledgeBlock: req.knowledgeBlock,
    conversationHistory: req.conversationHistory,
    controls: req.controls,
  });

  const system = [
    stylePrompt,
    "",
    "TASK: Return strictly the JSON schema with BOTH:",
    "1) Structured extraction fields (intent, matchedServiceIndex 0-based from the services list or null, clientName, clientPhone, requestedDate, locationOrVenue, scopeSummary, deliverablesRequested, proposedBudgetMillimes in integer millimes where 1 DT = 1000, asksDiscountOrGifted, flags).",
    "   - flags.isMedicalEmergency: true ONLY for life-threatening symptoms (chest pain, breathing difficulty, severe bleeding, unconsciousness, stroke, infant emergency).",
    "   - flags.asksMedicalDiagnosisOrPrescription: true when a patient asks a doctor to diagnose or prescribe medication over DM.",
    "   - Use null for any unstated intake field. Never invent client info.",
    "2) replyText: Your natural, human-sounding reply to this client following the exact Language Directive, Message Length, Conversational Style, and Emoji rules above, answering their question directly using the Full Workspace Knowledge, Calendar Schedule & Live Updates. Do NOT re-ask fields already in Prior conversation context. Never invent prices or quote below allowed amounts.",
  ].join("\n");

  const user = [
    priorContextParts.length > 0 ? `Prior conversation context (already known): ${priorContextParts.join(", ")}` : null,
    req.preRateHint ? `Rate guidance (code-verified): ${req.preRateHint}` : null,
    req.calendarHint ? `Calendar check (code-verified): ${req.calendarHint}` : null,
    `Incoming client message: ${req.text || "(media attachment)"}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await sparkJson({
      schema: proUnifiedTurnSchema,
      jsonSchema: proUnifiedTurnJsonSchema,
      schemaName: "pro_unified_turn",
      system,
      user,
      images: req.images,
      conversationId: req.conversationId,
      tier: "fast_multimodal",
      languageHint: req.language,
    });
    const { replyText, ...extracted } = raw;
    return {
      understanding: applyProDeterministicFallbacks(req.text, extracted, req.services, req.profile.profession_preset),
      replyText: replyText?.trim() || null,
    };
  } catch {
    return {
      understanding: applyProDeterministicFallbacks(
        req.text,
        EMPTY_PRO_UNDERSTANDING,
        req.services,
        req.profile.profession_preset,
      ),
      replyText: null,
    };
  }
}

export async function understandProTurn(req: {
  text: string;
  images?: string[];
  services: ProServiceRow[];
  profile: ProProfileRow;
  priorSlots: Record<string, unknown>;
  conversationId?: string;
}): Promise<ProUnderstanding> {
  const serviceCatalogLines = req.services
    .map(
      (s, idx) =>
        `${idx}: ${s.title} (category=${s.category}, rate=${s.price_millimes !== null ? formatMillimesForChat(s.price_millimes) : s.price_display
        }, floor=${s.floor_millimes !== null ? formatMillimesForChat(s.floor_millimes) : "none"})`,
    )
    .join("\n");

  const priorContextParts: string[] = [];
  if (typeof req.priorSlots.matchedServiceTitle === "string") {
    priorContextParts.push(`service=${req.priorSlots.matchedServiceTitle}`);
  }
  if (typeof req.priorSlots.clientName === "string") {
    priorContextParts.push(`clientName=${req.priorSlots.clientName}`);
  }
  if (typeof req.priorSlots.clientPhone === "string") {
    priorContextParts.push(`clientPhone=${req.priorSlots.clientPhone}`);
  }
  if (typeof req.priorSlots.requestedDate === "string") {
    priorContextParts.push(`requestedDate=${req.priorSlots.requestedDate}`);
  }
  if (typeof req.priorSlots.locationOrVenue === "string") {
    priorContextParts.push(`locationOrVenue=${req.priorSlots.locationOrVenue}`);
  }

  const system = [
    `You extract structured DM intake and opportunity signals for a Tunisian professional (${req.profile.profession_preset}: ${req.profile.display_name}).`,
    "Messages may be in Tunisian Derja (Arabizi or Arabic script), French, Arabic, or English.",
    "Rules:",
    "- matchedServiceIndex: 0-based index from the Available Services list when the client is asking about or booking a specific service, or null.",
    "- proposedBudgetMillimes: convert any stated budget or counter-offer in DT / dinars / alf / malyoun to integer millimes (1 DT = 1000; '700 DT' = 700000; '800 alf' = 800000; 'malyoun' = 1000000).",
    "- asksDiscountOrGifted: true when the client/brand asks for a discount, lower rate, free/gifted collab, or visibility exchange.",
    "- flags.isMedicalEmergency: true ONLY when the message describes life-threatening emergency symptoms (chest pain, difficulty breathing, severe bleeding, unconsciousness, stroke, infant emergency).",
    "- flags.asksMedicalDiagnosisOrPrescription: true when a patient asks a doctor to diagnose an illness or prescribe/recommend medication over DM.",
    "- Use null for any field not stated. Never invent values.",
  ].join("\n");

  const user = [
    `Available Services:\n${serviceCatalogLines || "None"}`,
    priorContextParts.length > 0 ? `Prior conversation context: ${priorContextParts.join(", ")}` : null,
    `Incoming DM text: ${req.text || "(media attachment)"}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await sparkJson({
      schema: proUnderstandSchema,
      jsonSchema: proUnderstandJsonSchema,
      schemaName: "pro_understand_turn",
      system,
      user,
      images: req.images,
      conversationId: req.conversationId,
      tier: "fast_multimodal",
    });
    return applyProDeterministicFallbacks(req.text, raw, req.services, req.profile.profession_preset);
  } catch {
    return applyProDeterministicFallbacks(
      req.text,
      EMPTY_PRO_UNDERSTANDING,
      req.services,
      req.profile.profession_preset,
    );
  }
}

export type MissingProField =
  | "service"
  | "clientName"
  | "clientPhone"
  | "requestedDate"
  | "locationOrVenue"
  | "scopeSummary";

export interface ProIntakeEvaluation {
  complete: boolean;
  missingFields: MissingProField[];
}

/**
 * Evaluates whether all required intake fields for a profession preset and
 * matched service have been collected.
 */
export function evaluateProIntake(
  preset: ProCategory,
  slots: Record<string, unknown>,
  hasMatchedService: boolean,
): ProIntakeEvaluation {
  const hasName = typeof slots.clientName === "string" && Boolean(slots.clientName.trim());
  const hasPhone = typeof slots.clientPhone === "string" && Boolean(slots.clientPhone.trim());
  const hasDate = typeof slots.requestedDate === "string" && Boolean(slots.requestedDate.trim());
  const hasLocation = typeof slots.locationOrVenue === "string" && Boolean(slots.locationOrVenue.trim());
  const hasScope =
    hasMatchedService ||
    (typeof slots.scopeSummary === "string" && Boolean(slots.scopeSummary.trim())) ||
    (typeof slots.deliverablesRequested === "string" && Boolean(slots.deliverablesRequested.trim()));

  const missing: MissingProField[] = [];
  if (!hasScope) missing.push("service");

  if (preset === "doctor") {
    if (!hasName) missing.push("clientName");
    if (!hasPhone) missing.push("clientPhone");
    if (!hasDate) missing.push("requestedDate");
  } else if (preset === "cameraman") {
    if (!hasDate) missing.push("requestedDate");
    if (!hasLocation) missing.push("locationOrVenue");
    if (!hasPhone) missing.push("clientPhone");
  } else if (preset === "creator") {
    if (!hasScope) missing.push("scopeSummary");
    if (!hasDate) missing.push("requestedDate");
    if (!hasPhone && !hasName) missing.push("clientPhone");
  } else {
    if (!hasScope) missing.push("scopeSummary");
    if (!hasPhone) missing.push("clientPhone");
  }

  return {
    complete: missing.length === 0,
    missingFields: missing,
  };
}

function formatMissingIntakePrompt(
  missing: MissingProField[],
  language: BuyerLanguage,
  script: TextScript | null,
  preset: ProCategory,
): string {
  if (language === "derja" && script === "arabic") {
    const items: string[] = [];
    if (missing.includes("service") || missing.includes("scopeSummary")) items.push("تفاصيل الخدمة اللي تحب عليها");
    if (missing.includes("clientName")) items.push("اسمك الكامل");
    if (missing.includes("requestedDate")) items.push(preset === "doctor" ? "النهار والوقت اللي يساعدك" : "تاريخ الموعد/التصوير");
    if (missing.includes("locationOrVenue")) items.push("المدينة أو البلاصة");
    if (missing.includes("clientPhone")) items.push("رقم التليفون متاعك (+216)");
    return `عيشك عطيني ${items.join("، ")} باش نسجل الطلب متاعك ونبعثلك التفاصيل الكاملة.`;
  }
  if (language === "fr") {
    const items: string[] = [];
    if (missing.includes("service") || missing.includes("scopeSummary")) items.push("la prestation souhaitée");
    if (missing.includes("clientName")) items.push("votre nom complet");
    if (missing.includes("requestedDate")) items.push(preset === "doctor" ? "le jour et créneau souhaité" : "la date souhaitée");
    if (missing.includes("locationOrVenue")) items.push("la ville ou le lieu");
    if (missing.includes("clientPhone")) items.push("votre numéro de téléphone (+216)");
    return `Merci de m'indiquer ${items.join(", ")} pour enregistrer votre demande et vous envoyer tous les détails.`;
  }
  if (language === "ar") {
    const items: string[] = [];
    if (missing.includes("service") || missing.includes("scopeSummary")) items.push("الخدمة المطلوبة");
    if (missing.includes("clientName")) items.push("الاسم الكامل");
    if (missing.includes("requestedDate")) items.push("التاريخ والوقت المفضل");
    if (missing.includes("locationOrVenue")) items.push("المدينة أو المكان");
    if (missing.includes("clientPhone")) items.push("رقم الهاتف (+216)");
    return `يرجى إرسال ${items.join("، ")} لتسجيل طلبك وإرسال كافة التفاصيل.`;
  }
  if (language === "en") {
    const items: string[] = [];
    if (missing.includes("service") || missing.includes("scopeSummary")) items.push("the service you need");
    if (missing.includes("clientName")) items.push("your full name");
    if (missing.includes("requestedDate")) items.push("your preferred date/time");
    if (missing.includes("locationOrVenue")) items.push("the city or venue");
    if (missing.includes("clientPhone")) items.push("your phone number (+216)");
    return `Please share ${items.join(", ")} so I can log your request and send the full package details.`;
  }

  const itemsDerja: string[] = [];
  if (missing.includes("service") || missing.includes("scopeSummary")) itemsDerja.push("chnowa el service walla el projet");
  if (missing.includes("clientName")) itemsDerja.push("esmek el kemel");
  if (missing.includes("requestedDate")) {
    itemsDerja.push(preset === "doctor" ? "el nhar w el wa9t elli ysa3dek" : "el date mta3 el tournage/événement");
  }
  if (missing.includes("locationOrVenue")) itemsDerja.push("el blasa walla el mdina");
  if (missing.includes("clientPhone")) itemsDerja.push("numrok (+216)");
  return `A3tini ${itemsDerja.join(", ")} bch nsajel el demande w nab3athlek les détails el kol.`;
}

export interface ProReplyFacts {
  profile: ProProfileRow;
  service: ProServiceRow | null;
  rateDecision: ProRateDecision;
  intake: ProIntakeEvaluation;
  slots: Record<string, unknown>;
  language: BuyerLanguage;
  script: TextScript | null;
  clientText: string;
  isFanMessage: boolean;
  askedLocation: boolean;
  knowledgeBlock?: string;
  conversationHistory?: string;
  allowedServiceMillimes?: number[];
  requireQuotedPrice?: boolean;
  controls?: WorkspaceAiControls;
  calendarHint?: string | null;
}

/**
 * Deterministic template fallback for Creator & Professional replies.
 * All amounts come exclusively from `formatMillimesForChat()` (`pricing.ts`).
 */
export function buildProTemplateReply(facts: ProReplyFacts): string {
  const { profile, service, rateDecision, intake, slots, language, script, isFanMessage } = facts;

  if (isFanMessage) {
    if (language === "derja" && script === "arabic") {
      return `عيشك برشا يا غالي(ة)! فرحتني بميساجك وربي يفضلك. كان عندك أي سؤال ولا مشروع مرحبا بيك في كل وقت!`;
    }
    if (language === "fr") {
      return `Merci infiniment pour votre message et votre soutien, ça me touche beaucoup !`;
    }
    if (language === "ar") {
      return `شكراً جزيلاً على رسالتك الطيبة ودعمك المتواصل!`;
    }
    if (language === "en") {
      return `Thank you so much for your kind message and support!`;
    }
    return `3aychek barcha ya ghali(a)! Farra7tni b messagek — merci 3al da3m mte3ek!`;
  }

  const quotedFormatted =
    rateDecision.quotedMillimes !== null ? formatMillimesForChat(rateDecision.quotedMillimes) : null;
  const listFormatted =
    rateDecision.listMillimes !== null ? formatMillimesForChat(rateDecision.listMillimes) : null;

  const notedParts: string[] = [];
  if (typeof slots.clientName === "string" && slots.clientName.trim()) notedParts.push(slots.clientName.trim());
  if (typeof slots.requestedDate === "string" && slots.requestedDate.trim()) notedParts.push(slots.requestedDate.trim());
  if (typeof slots.locationOrVenue === "string" && slots.locationOrVenue.trim()) notedParts.push(slots.locationOrVenue.trim());
  if (typeof slots.clientPhone === "string" && slots.clientPhone.trim()) notedParts.push(slots.clientPhone.trim());

  // 1. Rate-floor protection branch (client asked for below-floor budget or gifted collab)
  if (rateDecision.action === "clamp_to_floor" && quotedFormatted) {
    const svcTitle = service?.title ?? profile.display_name;
    const followUp = intake.complete
      ? service?.prep_or_details_template ?? ""
      : formatMissingIntakePrompt(intake.missingFields, language, script, profile.profession_preset);

    if (language === "derja" && script === "arabic") {
      return `مرحبا بيك! بالنسبة لـ ${svcTitle}${listFormatted && listFormatted !== quotedFormatted ? ` السعر العادي ${listFormatted} و` : " "}أقل سوم نجمو نخدمو بيه هو ${quotedFormatted} (ما نجموش نعملو أقل ولا مجاني). ${followUp}`.trim();
    }
    if (language === "fr") {
      return `Bonjour ! Pour ${svcTitle},${listFormatted && listFormatted !== quotedFormatted ? ` le tarif standard est de ${listFormatted} et` : ""} notre tarif minimum plancher est de ${quotedFormatted} (nous ne pouvons pas descendre en dessous ni accepter du non-rémunéré). ${followUp}`.trim();
    }
    if (language === "ar") {
      return `مرحباً! بخصوص ${svcTitle}، الحد الأدنى للسعر هو ${quotedFormatted} ولا يمكن النزول تحته. ${followUp}`.trim();
    }
    if (language === "en") {
      return `Hello! For ${svcTitle}, our minimum floor rate is ${quotedFormatted} and we cannot go lower or accept unpaid deals. ${followUp}`.trim();
    }
    return `Ahla bik! Bel nesba l ${svcTitle},${listFormatted && listFormatted !== quotedFormatted ? ` el tarif el 3adi ${listFormatted} w` : ""} akher soum minimum howa ${quotedFormatted} (ma najamouch na9sou akther walla nkhdmou gifted). ${followUp}`.trim();
  }

  // 2. Intake complete -> Deliver structured service package details & prep template
  if (intake.complete && service) {
    const detailsLine = service.prep_or_details_template;
    const deliverablesLine =
      service.deliverables.length > 0 ? `(${service.deliverables.join(" · ")})` : "";
    const notedSummary = notedParts.length > 0 ? notedParts.join(" · ") : "";
    const addressPart = profile.clinic_or_studio_address
      ? ` 📍 ${profile.clinic_or_studio_address}.`
      : "";

    if (language === "derja" && script === "arabic") {
      return `مريقل، سجلت المعطيات متاعك (${notedSummary}). هذي تفاصيل ${service.title}${quotedFormatted ? ` بـ ${quotedFormatted}` : ""} ${deliverablesLine}: ${detailsLine}${addressPart} تو يأكدلك ${profile.display_name} الموعد النهائي!`;
    }
    if (language === "fr") {
      return `C'est bien noté (${notedSummary}). Voici les détails pour ${service.title}${quotedFormatted ? ` (${quotedFormatted})` : ""} ${deliverablesLine} : ${detailsLine}${addressPart} ${profile.display_name} vous confirmera la validation finale rapidement.`;
    }
    if (language === "ar") {
      return `تم تسجيل بياناتك (${notedSummary}). إليك تفاصيل ${service.title}${quotedFormatted ? ` (${quotedFormatted})` : ""} ${deliverablesLine}: ${detailsLine}${addressPart}`;
    }
    if (language === "en") {
      return `All noted (${notedSummary}). Here are the package details for ${service.title}${quotedFormatted ? ` (${quotedFormatted})` : ""} ${deliverablesLine}: ${detailsLine}${addressPart}`;
    }
    return `Mrigel, sajalt les détails mte3ek (${notedSummary}). Hedhi el offre ${service.title}${quotedFormatted ? ` b ${quotedFormatted}` : ""} ${deliverablesLine}: ${detailsLine}${addressPart} Taw ${profile.display_name} yakkedlek!`;
  }

  // 3. Service matched or general inquiry -> Quote rate & ask missing intake questions
  const headParts: string[] = [];
  if (service) {
    if (language === "derja" && script === "arabic") {
      headParts.push(
        `مرحبا بيك! ${service.title}${quotedFormatted ? ` بـ ${quotedFormatted}` : ""} (${service.duration_label}).`,
      );
    } else if (language === "fr") {
      headParts.push(
        `Bonjour ! Pour ${service.title}${quotedFormatted ? `, le tarif est de ${quotedFormatted}` : ""} (${service.duration_label}).`,
      );
    } else if (language === "ar") {
      headParts.push(
        `مرحباً بك! ${service.title}${quotedFormatted ? ` بسعر ${quotedFormatted}` : ""} (${service.duration_label}).`,
      );
    } else if (language === "en") {
      headParts.push(
        `Welcome! ${service.title}${quotedFormatted ? ` is ${quotedFormatted}` : ""} (${service.duration_label}).`,
      );
    } else {
      headParts.push(
        `Ahla bik! El ${service.title}${quotedFormatted ? ` b ${quotedFormatted}` : ""} (${service.duration_label}).`,
      );
    }
  } else {
    if (language === "derja" && script === "arabic") {
      headParts.push(`مرحبا بيك عند ${profile.display_name}!`);
    } else if (language === "fr") {
      headParts.push(`Bonjour et bienvenue chez ${profile.display_name} !`);
    } else if (language === "ar") {
      headParts.push(`مرحباً بك لدى ${profile.display_name}!`);
    } else if (language === "en") {
      headParts.push(`Hello and welcome to ${profile.display_name}'s desk!`);
    } else {
      headParts.push(`Ahla w sahla bik 3and ${profile.display_name}!`);
    }
  }

  if (notedParts.length > 0) {
    if (language === "derja" && script === "arabic") {
      headParts.push(`سجلتلك: ${notedParts.join("، ")}.`);
    } else if (language === "fr") {
      headParts.push(`J'ai bien noté : ${notedParts.join(", ")}.`);
    } else if (language === "ar") {
      headParts.push(`تم تسجيل: ${notedParts.join("، ")}.`);
    } else if (language === "en") {
      headParts.push(`Noted: ${notedParts.join(", ")}.`);
    } else {
      headParts.push(`Sajaltlek: ${notedParts.join(", ")}.`);
    }
  }

  if (facts.askedLocation && profile.clinic_or_studio_address) {
    headParts.push(`📍 ${profile.clinic_or_studio_address}.`);
  }

  headParts.push(
    formatMissingIntakePrompt(intake.missingFields, language, script, profile.profession_preset),
  );
  return headParts.join(" ");
}

/**
 * Validates a model-generated Pro reply against length, medical safety,
 * rate-floor firewall, and required quoted rate rules.
 */
export function validateProCandidateReply(
  rawCandidate: string,
  facts: ProReplyFacts,
): string | null {
  const trimmed = rawCandidate.trim();
  const maxChars = maxReplyCharsForLength(facts.controls?.replyLength ?? "medium", "pro");
  if (!trimmed || trimmed.length > maxChars) return null;

  const allowedMillimes = collectAllowedProMillimes(
    facts.rateDecision,
    facts.allowedServiceMillimes,
  );
  const candidate = normalizeProReplyAmounts(trimmed, allowedMillimes);

  if (
    facts.profile.profession_preset === "doctor" &&
    !passesMedicalSafetyFirewall(candidate)
  ) {
    return null;
  }

  if (
    !passesProRateFirewall(
      candidate,
      allowedMillimes,
      facts.rateDecision.floorMillimes,
    )
  ) {
    return null;
  }

  const mustStatePrice =
    !facts.isFanMessage &&
    facts.rateDecision.quotedMillimes !== null &&
    (facts.rateDecision.action === "clamp_to_floor" ||
      facts.requireQuotedPrice === true ||
      PRICE_QUESTION_PATTERN.test(facts.clientText));

  if (mustStatePrice && facts.rateDecision.quotedMillimes !== null) {
    const mentioned = extractAmountsMillimes(candidate);
    if (!mentioned.includes(facts.rateDecision.quotedMillimes)) {
      return null;
    }
  }

  return candidate;
}

/**
 * Generates a style-cloned reply (`tier: "style_writer"`) and validates it
 * against the Pro Rate Firewall and Medical Safety Firewall, falling back to
 * `buildProTemplateReply` on any violation or provider error.
 */
export async function phraseProReply(
  facts: ProReplyFacts,
  conversationId?: string,
): Promise<{ text: string; source: "style_writer" | "template" }> {
  const fallback = buildProTemplateReply(facts);
  const allowedMillimes = collectAllowedProMillimes(
    facts.rateDecision,
    facts.allowedServiceMillimes,
  );
  const system = buildProStyleSystemPrompt({
    profile: facts.profile,
    language: facts.language,
    script: facts.script,
    allowedMillimes,
    activeService: facts.service,
    knowledgeBlock: facts.knowledgeBlock,
    conversationHistory: facts.conversationHistory,
    controls: facts.controls,
  });

  const quotedFormatted =
    facts.rateDecision.quotedMillimes !== null
      ? formatMillimesForChat(facts.rateDecision.quotedMillimes)
      : null;

  const knownLines: string[] = [];
  if (facts.service) knownLines.push(`Matched service: ${facts.service.title}`);
  if (quotedFormatted) knownLines.push(`Exact rate to state if quoting price: ${quotedFormatted}`);
  if (typeof facts.slots.clientName === "string") knownLines.push(`Client name (already known): ${facts.slots.clientName}`);
  if (typeof facts.slots.clientPhone === "string") knownLines.push(`Client phone (already known): ${facts.slots.clientPhone}`);
  if (typeof facts.slots.requestedDate === "string") knownLines.push(`Requested date (already known): ${facts.slots.requestedDate}`);
  if (typeof facts.slots.locationOrVenue === "string") knownLines.push(`Location/venue (already known): ${facts.slots.locationOrVenue}`);

  const directive = facts.isFanMessage
    ? "This is a warm fan/supporter DM. Reply warmly and naturally in your signature tone with zero prices."
    : facts.rateDecision.action === "clamp_to_floor" && quotedFormatted
      ? `The client asked for a rate below your minimum floor (or free/gifted). Politely decline going lower, state your exact minimum rate ${quotedFormatted}, and ask naturally for any missing details: ${facts.intake.missingFields.join(", ") || "none"}.`
      : facts.intake.complete && facts.service
        ? `All intake details are collected! Confirm the noted details naturally, share the service package info (${facts.service.prep_or_details_template}), and state the exact rate ${quotedFormatted ?? ""}.`
        : `Answer what the client just asked first using the workspace knowledge, acknowledge any new details they shared, mention the service rate ${quotedFormatted ?? "(only if relevant)"} when quoting, and gently ask for missing details if appropriate: ${facts.intake.missingFields.join(", ") || "none"}.`;

  try {
    const raw = await sparkText({
      system,
      user: [
        `Client message: ${facts.clientText || "(sent media)"}`,
        `Known context:\n${knownLines.join("\n") || "None yet"}`,
        facts.calendarHint ? `Calendar check: ${facts.calendarHint}` : null,
        `Action directive: ${directive}`,
      ]
        .filter(Boolean)
        .join("\n"),
      conversationId,
      tier: "style_writer",
      languageHint: facts.language,
    });

    const validated = validateProCandidateReply(raw, facts);
    if (!validated) {
      return { text: fallback, source: "template" };
    }
    return { text: validated, source: "style_writer" };
  } catch {
    return { text: fallback, source: "template" };
  }
}

function buildFallbackProfile(merchantId: string, category: ProCategory, merchantName?: string): ProProfileRow {
  const preset = getProPreset(category);
  return {
    merchant_id: merchantId,
    display_name: merchantName?.trim() || preset.defaultDisplayName,
    headline: preset.headline,
    profession_preset: preset.id,
    bio: preset.bio,
    location_city: preset.locationCity,
    clinic_or_studio_address: preset.clinicOrStudioAddress,
    lat: preset.lat,
    lng: preset.lng,
    style_samples: preset.styleSamples,
    style_rules: preset.styleRules,
    boundaries_note: preset.boundariesNote,
    opportunity_goals: preset.opportunityGoals,
    opportunity_keywords: preset.opportunityKeywords,
    min_deal_budget_millimes: preset.minDealBudgetMillimes,
    auto_reply_enabled: true,
    alert_whatsapp_phone: null,
    alert_email: null,
  };
}

function buildFallbackServices(merchantId: string, category: ProCategory): ProServiceRow[] {
  const preset = getProPreset(category);
  return preset.services.map((s, idx) => ({
    id: `preset-${category}-${idx}`,
    merchant_id: merchantId,
    title: s.title,
    category: s.category,
    description: s.description,
    deliverables: s.deliverables,
    duration_label: s.duration_label,
    price_millimes: s.price_millimes,
    price_display: s.price_display,
    floor_millimes: s.floor_millimes,
    pricing_mode: s.pricing_mode,
    intake_questions: s.intake_questions,
    prep_or_details_template: s.prep_or_details_template,
    booking_url: s.booking_url ?? null,
    active: true,
  }));
}

async function loadProWorkspaceContext(
  supabase: AdminClient,
  merchantId: string,
  fallbackCategory?: ProCategory | null,
  merchantName?: string,
): Promise<{ profile: ProProfileRow; services: ProServiceRow[] }> {
  const category: ProCategory = fallbackCategory ?? "creator";
  const [profileRes, servicesRes] = await Promise.all([
    supabase.from("pro_profiles").select("*").eq("merchant_id", merchantId).maybeSingle(),
    supabase
      .from("pro_services")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("active", true)
      .order("created_at", { ascending: true }),
  ]);

  const rawProfile = profileRes.data as Record<string, unknown> | null;
  const profile: ProProfileRow = rawProfile
    ? {
      merchant_id: String(rawProfile.merchant_id ?? merchantId),
      display_name: String(rawProfile.display_name ?? merchantName ?? "Pro Desk"),
      headline: String(rawProfile.headline ?? ""),
      profession_preset: isProCategory(rawProfile.profession_preset)
        ? rawProfile.profession_preset
        : category,
      bio: String(rawProfile.bio ?? ""),
      location_city: String(rawProfile.location_city ?? "Tunis"),
      clinic_or_studio_address: String(rawProfile.clinic_or_studio_address ?? ""),
      lat: typeof rawProfile.lat === "number" ? rawProfile.lat : null,
      lng: typeof rawProfile.lng === "number" ? rawProfile.lng : null,
      style_samples: Array.isArray(rawProfile.style_samples)
        ? (rawProfile.style_samples as ProProfileRow["style_samples"])
        : [],
      style_rules: String(rawProfile.style_rules ?? ""),
      boundaries_note: String(rawProfile.boundaries_note ?? ""),
      opportunity_goals: String(rawProfile.opportunity_goals ?? ""),
      opportunity_keywords: Array.isArray(rawProfile.opportunity_keywords)
        ? (rawProfile.opportunity_keywords as string[])
        : [],
      min_deal_budget_millimes:
        typeof rawProfile.min_deal_budget_millimes === "number"
          ? rawProfile.min_deal_budget_millimes
          : null,
      auto_reply_enabled:
        typeof rawProfile.auto_reply_enabled === "boolean" ? rawProfile.auto_reply_enabled : true,
      alert_whatsapp_phone:
        typeof rawProfile.alert_whatsapp_phone === "string" ? rawProfile.alert_whatsapp_phone : null,
      alert_email: typeof rawProfile.alert_email === "string" ? rawProfile.alert_email : null,
    }
    : buildFallbackProfile(merchantId, category, merchantName);

  const rawServices = Array.isArray(servicesRes.data)
    ? (servicesRes.data as Array<Record<string, unknown>>)
    : [];
  const services: ProServiceRow[] =
    rawServices.length > 0
      ? rawServices.map((row) => ({
        id: String(row.id),
        merchant_id: String(row.merchant_id ?? merchantId),
        title: String(row.title ?? "Service"),
        category: String(row.category ?? "general"),
        description: String(row.description ?? ""),
        deliverables: Array.isArray(row.deliverables) ? (row.deliverables as string[]) : [],
        duration_label: String(row.duration_label ?? ""),
        price_millimes: typeof row.price_millimes === "number" ? row.price_millimes : null,
        price_display: String(row.price_display ?? ""),
        floor_millimes: typeof row.floor_millimes === "number" ? row.floor_millimes : null,
        pricing_mode:
          row.pricing_mode === "starting_at" || row.pricing_mode === "custom_quote"
            ? row.pricing_mode
            : "fixed",
        intake_questions: Array.isArray(row.intake_questions)
          ? (row.intake_questions as string[])
          : [],
        prep_or_details_template: String(row.prep_or_details_template ?? ""),
        booking_url: typeof row.booking_url === "string" ? row.booking_url : null,
        active: Boolean(row.active ?? true),
      }))
      : buildFallbackServices(merchantId, profile.profession_preset);

  return { profile, services };
}

async function upsertProServiceInquiry(
  supabase: AdminClient,
  input: {
    merchantId: string;
    conversationId: string;
    customerId: string | null;
    service: ProServiceRow | null;
    slots: Record<string, unknown>;
    rateDecision: ProRateDecision;
    status: ServiceInquiryStatus;
  },
): Promise<string | null> {
  const realServiceId =
    input.service && !input.service.id.startsWith("preset-") ? input.service.id : null;
  const payload = {
    merchant_id: input.merchantId,
    conversation_id: input.conversationId,
    customer_id: input.customerId,
    service_id: realServiceId,
    client_name: typeof input.slots.clientName === "string" ? input.slots.clientName : null,
    client_phone: typeof input.slots.clientPhone === "string" ? input.slots.clientPhone : null,
    requested_date: typeof input.slots.requestedDate === "string" ? input.slots.requestedDate : null,
    location_text: typeof input.slots.locationOrVenue === "string" ? input.slots.locationOrVenue : null,
    budget_millimes:
      input.rateDecision.quotedMillimes ??
      (typeof input.slots.proposedBudgetMillimes === "number"
        ? input.slots.proposedBudgetMillimes
        : null),
    scope_summary:
      (typeof input.slots.scopeSummary === "string" && input.slots.scopeSummary) ||
      input.service?.title ||
      "Client DM inquiry",
    extracted_details: {
      serviceTitle: input.service?.title ?? null,
      deliverablesRequested: input.slots.deliverablesRequested ?? null,
      rateAction: input.rateDecision.action,
    },
    status: input.status,
    ai_summary: [
      input.service?.title,
      typeof input.slots.clientName === "string" ? input.slots.clientName : null,
      typeof input.slots.requestedDate === "string" ? input.slots.requestedDate : null,
      typeof input.slots.locationOrVenue === "string" ? input.slots.locationOrVenue : null,
      input.rateDecision.quotedMillimes !== null
        ? formatMillimesForChat(input.rateDecision.quotedMillimes)
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
    updated_at: new Date().toISOString(),
  };

  try {
    const existing = await supabase
      .from("service_inquiries")
      .select("id")
      .eq("merchant_id", input.merchantId)
      .eq("conversation_id", input.conversationId)
      .maybeSingle();

    if (existing.data && typeof (existing.data as { id?: unknown }).id === "string") {
      const id = (existing.data as { id: string }).id;
      await supabase.from("service_inquiries").update(payload).eq("id", id);
      return id;
    }

    const inserted = await supabase
      .from("service_inquiries")
      .insert(payload)
      .select("id")
      .maybeSingle();
    return inserted.data && typeof (inserted.data as { id?: unknown }).id === "string"
      ? (inserted.data as { id: string }).id
      : null;
  } catch {
    return null;
  }
}

export interface RunProTurnOptions {
  supabase?: AdminClient;
  conversation?: ProConversationRow;
  messages?: ProMessageRow[];
  proCategory?: ProCategory | null;
  merchantName?: string;
}

/**
 * Creator & Professional DM pipeline turn handler (`workspace_mode === "pro"`).
 * Handles Doctor/Clinic, Cameraman/Media, Public Figure/Creator, and Custom Pro turns.
 */
export async function runProTurn(
  conversationId: string,
  opts?: RunProTurnOptions,
): Promise<void> {
  const supabase = opts?.supabase ?? createAdminClient();

  let conversation = opts?.conversation;
  if (!conversation) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, merchant_id, customer_id, slots, negotiation, ai_paused, updated_at")
      .eq("id", conversationId)
      .single();
    if (error || !data) throw new Error(`conversation not found: ${error?.message}`);
    conversation = data as ProConversationRow;
  }

  const merchantId = conversation.merchant_id;

  let burst = opts?.messages;
  if (!burst) {
    const { data, error } = await supabase
      .from("messages")
      .select("id, kind, body, media_path, created_at")
      .eq("conversation_id", conversationId)
      .eq("direction", "in")
      .gt("created_at", conversation.updated_at)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`messages fetch failed: ${error.message}`);
    burst = (data ?? []) as ProMessageRow[];
  }
  if (burst.length === 0) return;

  const burstCursor = burst[burst.length - 1]!.created_at;
  await logEvent(conversationId, "pro.turn.start", { burstSize: burst.length });

  if (conversation.ai_paused) {
    await logEvent(conversationId, "turn.skipped", { reason: "ai_paused (professional has taken over)" });
    await supabase.from("conversations").update({ updated_at: burstCursor }).eq("id", conversationId);
    return;
  }

  let proCategory = opts?.proCategory ?? null;
  let merchantName = opts?.merchantName;
  if (!proCategory || !merchantName) {
    const { data: merchantRow } = await supabase
      .from("merchants")
      .select("name, pro_category")
      .eq("id", merchantId)
      .maybeSingle();
    if (merchantRow) {
      const m = merchantRow as { name?: unknown; pro_category?: unknown };
      if (!merchantName && typeof m.name === "string") merchantName = m.name;
      if (!proCategory && isProCategory(m.pro_category)) proCategory = m.pro_category;
    }
  }

  const [{ profile, services }, aiControls] = await Promise.all([
    loadProWorkspaceContext(supabase, merchantId, proCategory, merchantName),
    loadWorkspaceAiControls(supabase, merchantId).catch(() => DEFAULT_AI_CONTROLS),
  ]);

  if (!profile.auto_reply_enabled) {
    await logEvent(conversationId, "turn.skipped", { reason: "auto_reply_disabled" });
    await supabase.from("conversations").update({ updated_at: burstCursor }).eq("id", conversationId);
    return;
  }

  const priorSlots: Record<string, unknown> = { ...(conversation.slots ?? {}) };
  const asrKeywords = [
    ...new Set([
      ...services.map((s) => s.title),
      ...profile.opportunity_keywords,
      ...Object.keys(DERJA_GLOSSARY),
      "rendez-vous",
      "consultation",
      "tournage",
      "shooting",
      "mariage",
      "sponsor",
      "reel",
    ]),
  ].slice(0, 100);
  const currentLang = resolveControlledReplyLanguage({
    controls: aiControls,
    priorLanguage: buyerLanguageOf(priorSlots),
  }).language;

  const textParts: string[] = [];
  const imageDataUrls: string[] = [];
  let hadAudio = false;
  let imageCount = 0;

  for (const message of burst) {
    if (message.kind === "audio" && message.media_path) {
      hadAudio = true;
      const { data: file, error: dlErr } = await supabase.storage
        .from("buyer-media")
        .download(message.media_path);
      if (dlErr || !file) throw new Error(`audio download failed: ${dlErr?.message}`);
      const wav = Buffer.from(await file.arrayBuffer());
      const transcript = await transcribe({
        wav,
        keywords: asrKeywords,
        conversationId,
        languageBias: asrBias(currentLang),
      });
      textParts.push(transcript);
      await logEvent(conversationId, "asr.transcript", { transcript });
    } else if (message.kind === "image") {
      imageCount++;
      if (message.body) textParts.push(message.body);
      if (message.media_path && imageDataUrls.length < 2) {
        const { data: file } = await supabase.storage.from("buyer-media").download(message.media_path);
        if (file) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const ext = message.media_path.split(".").pop()?.toLowerCase();
          const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
          imageDataUrls.push(`data:${mime};base64,${buffer.toString("base64")}`);
        }
      }
    } else if (message.body) {
      textParts.push(message.body);
    }
  }

  const combinedText = textParts.join("\n").trim();
  if (!combinedText && imageCount === 0) {
    await supabase.from("conversations").update({ updated_at: burstCursor }).eq("id", conversationId);
    return;
  }

  const audioOnly = hadAudio && burst.every((m) => m.kind === "audio");
  const detectedLang = resolveBuyerLanguage(priorSlots.buyerLanguage, combinedText, { fromAudio: audioOnly });
  const detectedScript = !audioOnly ? detectTextScript(combinedText) : null;
  const resolvedLang = resolveControlledReplyLanguage({
    controls: aiControls,
    detectedLanguage: detectedLang,
    priorLanguage: buyerLanguageOf(priorSlots),
    detectedScript,
    priorScript: buyerScriptOf(priorSlots),
  });
  const nextLang = resolvedLang.language;
  const nextScript = resolvedLang.script;

  const slots: Record<string, unknown> = {
    ...priorSlots,
    buyerLanguage: nextLang,
    buyerScript: nextScript,
  };

  // ---------------------------------------------------------------------------
  // 1. Pre-model deterministic Guardrails (0 AI calls):
  //    a) Doctor Medical Emergency (SAMU 190)
  //    b) Doctor Non-Diagnosis / Non-Prescription Boundary
  //    c) Explicit Angry Client / Human Handover request
  // ---------------------------------------------------------------------------
  if (profile.profession_preset === "doctor") {
    const redFlag = detectMedicalRedFlag(combinedText);
    if (redFlag.isEmergency) {
      const emergencyReply = buildMedicalEmergencyReply(nextLang, nextScript, profile.display_name);
      slots.medicalEmergencyEscalated = true;
      const alertSummary = `Patient reported emergency symptoms (${redFlag.triggers.join(", ")}): "${combinedText.slice(0, 180)}"`;
      const alertAction =
        "Patient was instructed to call SAMU 190 / go to the nearest ER and AI was paused. Review immediately.";
      await Promise.all([
        channelAdapter.sendText(conversationId, emergencyReply),
        supabase
          .from("conversations")
          .update({ slots, ai_paused: true, updated_at: burstCursor })
          .eq("id", conversationId),
        supabase.from("pro_alerts").insert({
          merchant_id: merchantId,
          conversation_id: conversationId,
          severity: "critical",
          category: "medical_red_flag",
          title: "Urgent medical red-flag symptom in patient DM",
          summary: alertSummary,
          recommended_action: alertAction,
          draft_reply: emergencyReply,
          status: "unread",
          notified_channels: ["in_app"],
        }),
        dispatchProAlertNotifications(
          supabase,
          merchantId,
          {
            severity: "critical",
            category: "medical_red_flag",
            title: "Urgent medical red-flag symptom in patient DM",
            summary: alertSummary,
            recommended_action: alertAction,
            draft_reply: emergencyReply,
          },
          { profile },
        ),
        logEvent(conversationId, "pro.safety.medical_red_flag", {
          triggers: redFlag.triggers,
          emergencyNumber: "190",
        }),
      ]);
      return;
    }

    if (detectMedicalDiagnosisOrPrescriptionAsk(combinedText)) {
      const detMatch = matchProServiceDeterministic(combinedText, services);
      const boundaryService = detMatch?.service ?? services[0] ?? null;
      const boundaryReply = buildMedicalBoundaryReply(nextLang, nextScript, boundaryService);
      await Promise.all([
        channelAdapter.sendText(conversationId, boundaryReply),
        supabase.from("conversations").update({ slots, updated_at: burstCursor }).eq("id", conversationId),
        logEvent(conversationId, "pro.safety.non_diagnosis_boundary", {
          serviceTitle: boundaryService?.title ?? null,
          preModel: true,
        }),
      ]);
      return;
    }
  }

  if (ANGRY_OR_HUMAN_PATTERN.test(combinedText)) {
    const handoverReply =
      nextLang === "fr"
        ? `Bien reçu, je transmets votre message directement à ${profile.display_name} qui vous répondra personnellement très vite.`
        : nextLang === "ar"
          ? `تم استلام رسالتك، سيتواصل معك ${profile.display_name} شخصياً في أقرب وقت.`
          : nextLang === "en"
            ? `Got it — I've notified ${profile.display_name} to reply to you personally right away.`
            : nextScript === "arabic"
              ? `وصلت رسالتك، تو بعثت تنبيه لـ ${profile.display_name} باش يجاوبك شخصياً في أقرب وقت.`
              : `Weslet rissaltek — b3atht notification l ${profile.display_name} bch yjewbek directement fisa3.`;

    await Promise.all([
      channelAdapter.sendText(conversationId, handoverReply),
      supabase
        .from("conversations")
        .update({ slots, ai_paused: true, updated_at: burstCursor })
        .eq("id", conversationId),
      supabase.from("pro_alerts").insert({
        merchant_id: merchantId,
        conversation_id: conversationId,
        severity: "urgent",
        category: "custom_request",
        title: "Client asked to speak directly with you",
        summary: combinedText.slice(0, 200),
        recommended_action: "AI is paused on this thread. Open Pro Inbox to reply directly.",
        status: "unread",
        notified_channels: ["in_app"],
      }),
      logEvent(conversationId, "pro.handover", {
        insultOrAngry: false,
        wantsHuman: true,
        preModel: true,
      }),
    ]);
    return;
  }

  // ---------------------------------------------------------------------------
  // 2. Load Full Workspace Knowledge + Conversation History + Input-Driven Call
  //    (1 single Gemini call for extraction + human reply; embeddings skipped
  //     unless the workspace has >15 services and deterministic match missed!)
  // ---------------------------------------------------------------------------
  const priorService =
    typeof slots.matchedServiceId === "string"
      ? (services.find((s) => s.id === slots.matchedServiceId) ?? null)
      : null;
  const preDetService = matchProServiceDeterministic(combinedText, services);
  const preActiveService = priorService ?? preDetService?.service ?? null;

  const [proKnowledge, conversationHistory, opportunityHit, upcomingEvents] = await Promise.all([
    loadProKnowledgePacket(supabase, merchantId, profile, services),
    loadRecentConversationHistory(supabase, conversationId, { beforeIso: burst[0]?.created_at, limit: 10 }),
    lookupProOpportunitiesSemantic(supabase, merchantId, combinedText, profile),
    listUpcomingBusyEvents(supabase, merchantId, 30).catch(() => []),
  ]);

  // Deterministic pre-model calendar conflict check when client mentions a date/time
  const preRequestedDate =
    extractRequestedDate(combinedText) ??
    (typeof slots.requestedDate === "string" ? slots.requestedDate : null);
  const preDurationMins = parseDurationMinutes(preActiveService?.duration_label, 60);
  const preParsedSlot = preRequestedDate
    ? parseRequestedDateToSlot(preRequestedDate, { durationMinutes: preDurationMins })
    : null;
  const preConflicts = preParsedSlot
    ? findCalendarConflicts(preParsedSlot.startAt, preParsedSlot.endAt, upcomingEvents)
    : [];
  const preCalendarHint =
    preConflicts.length > 0 && preParsedSlot
      ? `CONFLICT: The requested slot (${preParsedSlot.label}) overlaps with an existing busy calendar slot ("${preConflicts[0]!.title}"). Politely inform the client that this time is already booked and propose picking another open day/time.`
      : null;

  // Only call embeddings for huge service catalogs (>15) where deterministic match missed.
  const semanticHit =
    !preActiveService && services.length > 15
      ? await lookupProServicesSemantic(supabase, merchantId, combinedText, services, conversationId)
      : null;

  const preProposedBudget =
    parseProBudgetMillimes(combinedText) ??
    (typeof slots.proposedBudgetMillimes === "number" ? slots.proposedBudgetMillimes : null);
  const preAsksDiscount = DISCOUNT_OR_GIFTED_PATTERN.test(combinedText);
  const preRateDecision = resolveProServiceOfferMillimes({
    service: preActiveService ?? semanticHit?.service ?? null,
    minDealBudgetMillimes: profile.min_deal_budget_millimes,
    proposedBudgetMillimes: preProposedBudget,
    asksDiscountOrGifted: preAsksDiscount,
  });
  const preAllowedMillimes = collectAllowedProMillimes(
    preRateDecision,
    proKnowledge.allowedCatalogServiceMillimes,
  );
  const preRateHint =
    preRateDecision.action === "clamp_to_floor" && preRateDecision.quotedMillimes !== null
      ? `Client proposed below floor or asked for a discount/gifted deal. Politely decline going lower and state the exact minimum rate ${formatMillimesForChat(preRateDecision.quotedMillimes)}.`
      : preRateDecision.quotedMillimes !== null && preActiveService
        ? `Active service "${preActiveService.title}" rate is ${formatMillimesForChat(preRateDecision.quotedMillimes)}.`
        : null;

  const unified = await understandAndReplyProTurn({
    text: combinedText,
    images: imageDataUrls.length > 0 ? imageDataUrls : undefined,
    services,
    profile,
    priorSlots: slots,
    language: nextLang,
    script: nextScript,
    knowledgeBlock: proKnowledge.promptBlock,
    conversationHistory,
    allowedMillimes: preAllowedMillimes,
    preRateHint,
    calendarHint: preCalendarHint,
    activeService: preActiveService ?? semanticHit?.service ?? null,
    controls: aiControls,
    conversationId,
  });
  const understood = unified.understanding;

  await logEvent(conversationId, "pro.understand", {
    intent: understood.intent,
    matchedServiceIndex: understood.matchedServiceIndex,
    semanticSource: semanticHit?.source ?? (preDetService ? "deterministic" : null),
    matchedOpportunityId: opportunityHit?.opportunityId ?? null,
    proposedBudgetMillimes: understood.proposedBudgetMillimes,
    flags: understood.flags,
    unifiedReplyProduced: Boolean(unified.replyText),
  });

  // Post-understanding medical emergency check (if model caught a visual/subtle emergency)
  if (profile.profession_preset === "doctor" && understood.flags.isMedicalEmergency) {
    const emergencyReply = buildMedicalEmergencyReply(nextLang, nextScript, profile.display_name);
    slots.medicalEmergencyEscalated = true;
    await Promise.all([
      channelAdapter.sendText(conversationId, emergencyReply),
      supabase
        .from("conversations")
        .update({ slots, ai_paused: true, updated_at: burstCursor })
        .eq("id", conversationId),
      supabase.from("pro_alerts").insert({
        merchant_id: merchantId,
        conversation_id: conversationId,
        severity: "critical",
        category: "medical_red_flag",
        title: "Urgent medical emergency detected in patient DM",
        summary: `Emergency flagged in patient message: "${combinedText.slice(0, 180)}"`,
        recommended_action: "Patient directed to SAMU 190. Review conversation immediately.",
        draft_reply: emergencyReply,
        status: "unread",
        notified_channels: ["in_app"],
      }),
      logEvent(conversationId, "pro.safety.medical_red_flag", {
        triggers: ["model_flagged_emergency"],
        emergencyNumber: "190",
      }),
    ]);
    return;
  }

  // ---------------------------------------------------------------------------
  // 3. Angry Client / Human Handover
  // ---------------------------------------------------------------------------
  if (understood.flags.insultOrAngry || understood.flags.wantsHuman) {
    const handoverReply =
      nextLang === "fr"
        ? `Bien reçu, je transmets votre message directement à ${profile.display_name} qui vous répondra personnellement très vite.`
        : nextLang === "ar"
          ? `تم استلام رسالتك، سيتواصل معك ${profile.display_name} شخصياً في أقرب وقت.`
          : nextLang === "en"
            ? `Got it — I've notified ${profile.display_name} to reply to you personally right away.`
            : nextScript === "arabic"
              ? `وصلت رسالتك، تو بعثت تنبيه لـ ${profile.display_name} باش يجاوبك شخصياً في أقرب وقت.`
              : `Weslet رسالتك — b3atht notification l ${profile.display_name} bch yjewbek directement fisa3.`;

    await Promise.all([
      channelAdapter.sendText(conversationId, handoverReply),
      supabase
        .from("conversations")
        .update({ slots, ai_paused: true, updated_at: burstCursor })
        .eq("id", conversationId),
      supabase.from("pro_alerts").insert({
        merchant_id: merchantId,
        conversation_id: conversationId,
        severity: "urgent",
        category: understood.flags.insultOrAngry ? "angry_client" : "custom_request",
        title: understood.flags.insultOrAngry
          ? "Frustrated client DM — human takeover requested"
          : "Client asked to speak directly with you",
        summary: combinedText.slice(0, 200),
        recommended_action: "AI is paused on this thread. Open Pro Inbox to reply directly.",
        status: "unread",
        notified_channels: ["in_app"],
      }),
      logEvent(conversationId, "pro.handover", {
        insultOrAngry: understood.flags.insultOrAngry,
        wantsHuman: understood.flags.wantsHuman,
      }),
    ]);
    return;
  }

  // ---------------------------------------------------------------------------
  // 4. Resolve Matched Service & Merge Intake Slots
  // ---------------------------------------------------------------------------
  let activeService: ProServiceRow | null = null;
  if (priorService) {
    // Keep prior service sticky across multi-turn intake unless the client explicitly
    // switches to a different service with strong title/category specificity.
    const detMatch = preDetService;
    if (detMatch && detMatch.service.id !== priorService.id && detMatch.score >= 5) {
      activeService = detMatch.service;
    } else {
      activeService = priorService;
    }
  } else if (
    understood.matchedServiceIndex !== null &&
    services[understood.matchedServiceIndex]
  ) {
    activeService = services[understood.matchedServiceIndex]!;
  } else if (semanticHit) {
    activeService = semanticHit.service;
  } else if (
    services.length > 0 &&
    (profile.profession_preset === "doctor" || understood.intent === "rate_negotiation")
  ) {
    activeService = services[0]!;
  }

  if (activeService) {
    slots.matchedServiceId = activeService.id;
    slots.matchedServiceTitle = activeService.title;
  }
  if (understood.clientName) slots.clientName = understood.clientName;
  if (understood.clientPhone) slots.clientPhone = understood.clientPhone;
  if (understood.requestedDate) slots.requestedDate = understood.requestedDate;
  if (understood.locationOrVenue) slots.locationOrVenue = understood.locationOrVenue;
  if (understood.scopeSummary) slots.scopeSummary = understood.scopeSummary;
  if (understood.deliverablesRequested) slots.deliverablesRequested = understood.deliverablesRequested;
  if (understood.proposedBudgetMillimes !== null) {
    slots.proposedBudgetMillimes = understood.proposedBudgetMillimes;
  }

  // Persist client name/phone on customer record when available
  if (
    conversation.customer_id &&
    (typeof slots.clientName === "string" || typeof slots.clientPhone === "string")
  ) {
    const customerPatch: Record<string, unknown> = {};
    if (typeof slots.clientName === "string") customerPatch.name = slots.clientName;
    if (typeof slots.clientPhone === "string") customerPatch.phone = slots.clientPhone;
    void Promise.resolve(
      supabase.from("customers").update(customerPatch).eq("id", conversation.customer_id),
    ).catch(() => undefined);
  }

  // ---------------------------------------------------------------------------
  // 5. Doctor Non-Diagnosis / Non-Prescription Safety Boundary
  // ---------------------------------------------------------------------------
  if (profile.profession_preset === "doctor" && understood.flags.asksMedicalDiagnosisOrPrescription) {
    const boundaryReply = buildMedicalBoundaryReply(nextLang, nextScript, activeService ?? services[0]);
    await Promise.all([
      channelAdapter.sendText(conversationId, boundaryReply),
      supabase.from("conversations").update({ slots, updated_at: burstCursor }).eq("id", conversationId),
      logEvent(conversationId, "pro.safety.non_diagnosis_boundary", {
        serviceTitle: (activeService ?? services[0])?.title ?? null,
      }),
    ]);
    return;
  }

  // ---------------------------------------------------------------------------
  // 6. Rate Negotiation & Floor Firewall + Intake Evaluation
  // ---------------------------------------------------------------------------
  const proposedBudget =
    understood.proposedBudgetMillimes ??
    (typeof slots.proposedBudgetMillimes === "number" ? slots.proposedBudgetMillimes : null);

  const rateDecision = resolveProServiceOfferMillimes({
    service: activeService,
    minDealBudgetMillimes: profile.min_deal_budget_millimes,
    proposedBudgetMillimes: proposedBudget,
    asksDiscountOrGifted: understood.asksDiscountOrGifted,
  });

  if (rateDecision.quotedMillimes !== null) {
    slots.agreedRateMillimes = rateDecision.quotedMillimes;
  }

  if (rateDecision.action === "clamp_to_floor") {
    await logEvent(conversationId, "pro.rate_firewall.clamped", {
      proposedBudgetMillimes: proposedBudget,
      floorMillimes: rateDecision.floorMillimes,
      quotedMillimes: rateDecision.quotedMillimes,
    });
  }

  const intake = evaluateProIntake(
    profile.profession_preset,
    slots,
    activeService !== null,
  );

  const isFanMessage =
    understood.intent === "fan_message" &&
    activeService === null &&
    proposedBudget === null;

  const inquiryStatus: ServiceInquiryStatus = intake.complete
    ? "details_sent"
    : "discussing";

  if (!isFanMessage && (activeService !== null || Object.keys(slots).length > 2)) {
    const inquiryId = await upsertProServiceInquiry(supabase, {
      merchantId,
      conversationId,
      customerId: conversation.customer_id,
      service: activeService,
      slots,
      rateDecision,
      status: inquiryStatus,
    });
    if (inquiryId) {
      slots.inquiryId = inquiryId;
    }
    if (intake.complete) {
      slots.detailsSent = true;
    }
    await logEvent(conversationId, "pro.inquiry.updated", {
      inquiryId,
      status: inquiryStatus,
      complete: intake.complete,
      missingFields: intake.missingFields,
    });
  }

  // Spot high-value DM commercial opportunities (Creator sponsorships / Cameraman VIP shoots)
  if (
    !isFanMessage &&
    (understood.intent === "brand_opportunity" || understood.flags.isHighValueOpportunity) &&
    !slots.opportunityLogged
  ) {
    slots.opportunityLogged = true;
    const budgetForOpp = rateDecision.quotedMillimes ?? proposedBudget ?? profile.min_deal_budget_millimes;
    const fitsFloor =
      profile.min_deal_budget_millimes === null ||
      (typeof proposedBudget === "number" && proposedBudget >= profile.min_deal_budget_millimes);
    const fitScore = fitsFloor ? 88 : 64;
    try {
      const oppTitle =
        (typeof slots.scopeSummary === "string" && slots.scopeSummary) ||
        activeService?.title ||
        "Inbound DM Collaboration Brief";
      const brandName =
        (typeof slots.clientName === "string" && slots.clientName) || "Inbound DM Client";
      const { data: oppRow } = await supabase
        .from("opportunities")
        .insert({
          merchant_id: merchantId,
          source: "dm",
          conversation_id: conversationId,
          title: oppTitle,
          brand_or_client: brandName,
          category: profile.profession_preset === "cameraman" ? "shoot" : "sponsorship",
          description: combinedText.slice(0, 500),
          compensation_text:
            budgetForOpp !== null ? formatMillimesForChat(budgetForOpp) : "À définir",
          budget_millimes: budgetForOpp,
        })
        .select("id")
        .maybeSingle();

      const oppId =
        oppRow && typeof (oppRow as { id?: unknown }).id === "string"
          ? (oppRow as { id: string }).id
          : (opportunityHit?.opportunityId ?? null);
      if (oppId) {
        const draftPitch = buildProTemplateReply({
          profile,
          service: activeService,
          rateDecision,
          intake,
          slots,
          language: nextLang,
          script: nextScript,
          clientText: combinedText,
          isFanMessage: false,
          askedLocation: false,
        });
        await supabase.from("opportunity_matches").insert({
          merchant_id: merchantId,
          opportunity_id: oppId,
          fit_score: fitScore,
          urgency: fitScore >= 80 ? "high" : "medium",
          fit_reasons: [
            fitsFloor
              ? "Meets or exceeds your minimum deal budget floor"
              : "Inbound brand inquiry below standard floor (clamped to minimum rate)",
            `Matched ${profile.profession_preset} track in ${profile.location_city}`,
          ],
          draft_pitch: draftPitch,
          status: "new",
        });
        if (fitScore >= 75) {
          const alertTitle = `High-fit DM opportunity (${fitScore}% match): ${oppTitle}`;
          const alertSummary = `${brandName} sent a commercial brief${budgetForOpp !== null ? ` (${formatMillimesForChat(budgetForOpp)})` : ""
            }: "${combinedText.slice(0, 160)}"`;
          const alertAction = "Review the AI-scoped reply & opportunity match in your Pro Desk.";
          await supabase.from("pro_alerts").insert({
            merchant_id: merchantId,
            conversation_id: conversationId,
            opportunity_id: oppId,
            severity: "urgent",
            category: "opportunity_match",
            title: alertTitle,
            summary: alertSummary,
            recommended_action: alertAction,
            draft_reply: draftPitch,
            status: "unread",
            notified_channels: ["in_app"],
          });
          await dispatchProAlertNotifications(
            supabase,
            merchantId,
            {
              severity: "urgent",
              category: "opportunity_match",
              title: alertTitle,
              summary: alertSummary,
              recommended_action: alertAction,
              draft_reply: draftPitch,
            },
            { profile },
          );
        }
      }
    } catch {
      // Non-fatal if opportunities table is not migrated yet in a unit test stub.
    }
  }

  // ---------------------------------------------------------------------------
  // 6b. Deterministic Calendar Conflict Check & Auto-Booking (Tentative/Confirmed)
  // ---------------------------------------------------------------------------
  let postCalendarHint: string | null = preCalendarHint;
  const finalRequestedDate = typeof slots.requestedDate === "string" ? slots.requestedDate : null;
  if (!isFanMessage && finalRequestedDate) {
    const durationMins = parseDurationMinutes(activeService?.duration_label, 60);
    const parsedSlot = parseRequestedDateToSlot(finalRequestedDate, { durationMinutes: durationMins });
    if (parsedSlot) {
      const conflicts = findCalendarConflicts(parsedSlot.startAt, parsedSlot.endAt, upcomingEvents);
      if (conflicts.length > 0) {
        postCalendarHint = `CONFLICT: The requested slot (${parsedSlot.label}) overlaps with "${conflicts[0]!.title}". Politely let the client know this slot is already taken and ask for an alternative time.`;
      } else if (
        intake.complete &&
        aiControls.calendarAutoBook !== "manual" &&
        !slots.calendarEventId
      ) {
        try {
          const eventTitle = [
            activeService?.title ?? profile.headline ?? "Client Booking",
            typeof slots.clientName === "string" ? `— ${slots.clientName}` : null,
          ]
            .filter(Boolean)
            .join(" ");
          const eventType =
            profile.profession_preset === "cameraman"
              ? "shoot"
              : profile.profession_preset === "creator"
                ? "meeting"
                : "appointment";
          let bookedEvent = await createCalendarEvent(supabase, merchantId, {
            title: eventTitle,
            description: [
              typeof slots.scopeSummary === "string" ? `Scope: ${slots.scopeSummary}` : null,
              rateDecision.quotedMillimes !== null
                ? `Rate: ${formatMillimesForChat(rateDecision.quotedMillimes)}`
                : null,
              `Auto-added from DM (${finalRequestedDate})`,
            ]
              .filter(Boolean)
              .join("\n"),
            start_at: parsedSlot.startAt,
            end_at: parsedSlot.endAt,
            all_day: parsedSlot.allDay,
            location:
              (typeof slots.locationOrVenue === "string" && slots.locationOrVenue) ||
              profile.clinic_or_studio_address ||
              profile.location_city,
            event_type: eventType,
            status: aiControls.calendarAutoBook === "confirmed" ? "confirmed" : "tentative",
            source: "ai_dm",
            conversation_id: conversationId,
            inquiry_id: typeof slots.inquiryId === "string" ? slots.inquiryId : null,
            client_name: typeof slots.clientName === "string" ? slots.clientName : null,
            client_phone: typeof slots.clientPhone === "string" ? slots.clientPhone : null,
          });
          slots.calendarEventId = bookedEvent.id;
          slots.calendarBookedSlot = parsedSlot.label;

          // Best-effort push to connected Google Calendar when autoPush is enabled
          let pushedToGoogle = false;
          const gConn = await getCalendarConnection(supabase, merchantId).catch(() => null);
          if (gConn && gConn.auto_push) {
            try {
              bookedEvent = await pushEventToGoogleCalendar(supabase, merchantId, bookedEvent);
              pushedToGoogle = Boolean(bookedEvent.google_event_id);
            } catch {
              // Non-fatal: local event is already saved and can be pushed on next Sync
            }
          }

          await logEvent(conversationId, "pro.calendar.booked", {
            eventId: bookedEvent.id,
            slot: parsedSlot.label,
            status: bookedEvent.status,
            pushedToGoogle,
          });
          postCalendarHint = `Booked on workspace calendar for ${parsedSlot.label} (${bookedEvent.status}).`;
        } catch {
          // Non-fatal if calendar storage is unavailable in a stubbed test
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Validate Unified Human Reply (1-call fast path) or Repair via phraseProReply
  // ---------------------------------------------------------------------------
  const askedLocation = understood.intent === "ask_location" || LOCATION_ASK_PATTERN.test(combinedText);
  const replyFacts: ProReplyFacts = {
    profile,
    service: activeService,
    rateDecision,
    intake,
    slots,
    language: nextLang,
    script: nextScript,
    clientText: combinedText,
    isFanMessage,
    askedLocation,
    knowledgeBlock: proKnowledge.promptBlock,
    conversationHistory,
    allowedServiceMillimes: proKnowledge.allowedCatalogServiceMillimes,
    controls: aiControls,
    calendarHint: postCalendarHint,
    requireQuotedPrice:
      rateDecision.action === "clamp_to_floor" ||
      understood.intent === "rate_negotiation" ||
      PRICE_QUESTION_PATTERN.test(combinedText),
  };

  const newlyDiscoveredConflict = Boolean(postCalendarHint?.startsWith("CONFLICT:") && !preCalendarHint);
  const validatedUnified =
    unified.replyText && !newlyDiscoveredConflict
      ? validateProCandidateReply(unified.replyText, replyFacts)
      : null;

  const reply: { text: string; source: "unified" | "style_writer" | "template" } = validatedUnified
    ? { text: validatedUnified, source: "unified" }
    : await phraseProReply(replyFacts, conversationId);

  if (
    activeService &&
    rateDecision.quotedMillimes !== null &&
    extractAmountsMillimes(reply.text).includes(rateDecision.quotedMillimes)
  ) {
    slots.priceQuotedForServiceId = activeService.id;
  }

  await channelAdapter.sendText(conversationId, reply.text);

  // Send clinic/studio GPS pin link when location was requested or when Doctor/Cameraman package details are delivered
  const pinUrl = buildProLocationPinUrl(profile);
  const shouldSendPin =
    Boolean(pinUrl) &&
    !slots.pinSent &&
    (askedLocation ||
      (intake.complete &&
        (profile.profession_preset === "doctor" || profile.profession_preset === "cameraman")));

  if (shouldSendPin && pinUrl) {
    slots.pinSent = true;
    const pinCaption =
      nextLang === "fr"
        ? `📍 Localisation ${profile.display_name} : ${profile.clinic_or_studio_address || profile.location_city}`
        : nextLang === "ar" || (nextLang === "derja" && nextScript === "arabic")
          ? `📍 موقع ${profile.display_name}: ${profile.clinic_or_studio_address || profile.location_city}`
          : `📍 Localisation ${profile.display_name}: ${profile.clinic_or_studio_address || profile.location_city}`;
    await channelAdapter.sendPinLink(conversationId, pinUrl, pinCaption);
  }

  await supabase
    .from("conversations")
    .update({ slots, updated_at: burstCursor })
    .eq("id", conversationId);

  await logEvent(conversationId, "pro.reply.sent", {
    reply: reply.text,
    source: reply.source,
    serviceTitle: activeService?.title ?? null,
    quotedMillimes: rateDecision.quotedMillimes,
    rateAction: rateDecision.action,
    intakeComplete: intake.complete,
    pinSent: shouldSendPin,
    controls: {
      replyLength: aiControls.replyLength,
      replyStyle: aiControls.replyStyle,
      emojiLevel: aiControls.emojiLevel,
      languageMode: aiControls.languageMode,
      resolvedLanguage: nextLang,
    },
  });
}
