import { z } from "zod";
import { cosineSimilarity, embedConfigured, embedTexts } from "@/lib/ai/embeddings";
import { sparkJson } from "@/lib/ai/spark";
import { formatMillimesForChat } from "@/lib/domain/pricing";
import { logEvent } from "@/lib/pipeline/events";
import type { createAdminClient } from "@/lib/supabase/admin";
import { createProAlert } from "./notify";
import { getProPreset } from "./presets";
import {
  normalizeProReplyAmounts,
  passesMedicalSafetyFirewall,
  passesProRateFirewall,
} from "./style-prompt";
import { parseProBudgetMillimes } from "./turn";
import {
  isProCategory,
  type OpportunityCategory,
  type OpportunityMatchStatus,
  type OpportunitySource,
  type ProProfileRow,
} from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

export const opportunityCategoryValues = [
  "sponsorship",
  "shoot",
  "medical_talk",
  "partnership",
  "vip_client",
  "custom",
] as const;

export const opportunityUrgencyValues = ["low", "medium", "high", "critical"] as const;
export type OpportunityUrgency = (typeof opportunityUrgencyValues)[number];

export const opportunityEvaluationSchema = z.object({
  fitScore: z.number().int().min(0).max(100),
  urgency: z.enum(opportunityUrgencyValues),
  category: z.enum(opportunityCategoryValues),
  fitReasons: z.array(z.string().trim().min(2).max(200)).min(1).max(5),
  draftPitch: z.string().trim().min(10).max(1200),
});

export type OpportunityEvaluation = z.infer<typeof opportunityEvaluationSchema>;

const opportunityEvaluationJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["fitScore", "urgency", "category", "fitReasons", "draftPitch"],
  properties: {
    fitScore: { type: "integer", minimum: 0, maximum: 100 },
    urgency: { type: "string", enum: [...opportunityUrgencyValues] },
    category: { type: "string", enum: [...opportunityCategoryValues] },
    fitReasons: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string" },
    },
    draftPitch: { type: "string" },
  },
};

export interface OpportunityCandidate {
  id?: string;
  source: OpportunitySource;
  conversationId?: string | null;
  title: string;
  brandOrClient: string;
  category?: OpportunityCategory;
  description: string;
  compensationText?: string;
  budgetMillimes?: number | null;
  deadlineAt?: string | null;
  applyUrl?: string | null;
  embedding?: number[] | null;
}

export const opportunityIngestSchema = z.object({
  source: z.enum(["dm", "comment", "board", "manual"]).default("board"),
  conversationId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(3).max(200),
  brandOrClient: z.string().trim().min(1).max(120).default("External Brief"),
  category: z.enum(opportunityCategoryValues).optional(),
  description: z.string().trim().min(5).max(3000),
  compensationText: z.string().trim().max(120).optional(),
  budgetMillimes: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  deadlineAt: z.string().datetime().nullable().optional(),
  applyUrl: z.string().url().max(500).nullable().optional(),
});

export type OpportunityIngestInput = z.infer<typeof opportunityIngestSchema>;

function inferCategory(text: string, profile: ProProfileRow): OpportunityCategory {
  const lower = text.toLowerCase();
  if (/\b(?:podcast|conf[eé]rence|s[eé]minaire|bien-?[eê]tre|sant[eé]|clinique|m[eé]dical)\b/i.test(lower)) {
    return "medical_talk";
  }
  if (/\b(?:tournage|shooting|drone|vid[eé]o|mariage|outia|clip|montage|h[oô]tel)\b/i.test(lower)) {
    return "shoot";
  }
  if (/\b(?:sponsor|reel|ugc|ambassad|campagne|collab|influenceur|cr[eé]ateur)\b/i.test(lower)) {
    return "sponsorship";
  }
  if (/\b(?:partenariat|partnership|retainer|mensuel|long terme)\b/i.test(lower)) {
    return "partnership";
  }
  if (profile.profession_preset === "doctor") return "medical_talk";
  if (profile.profession_preset === "cameraman") return "shoot";
  if (profile.profession_preset === "creator") return "sponsorship";
  return "custom";
}

function hoursUntilDeadline(deadlineAt?: string | null, nowMs = Date.now()): number | null {
  if (!deadlineAt) return null;
  const parsed = Date.parse(deadlineAt);
  if (Number.isNaN(parsed)) return null;
  return (parsed - nowMs) / (1000 * 60 * 60);
}

/**
 * Deterministic Opportunity Fit Scorer & Pitch Drafter (always safe, price-firewalled,
 * and used as fallback when `tier: "reasoning"` is offline or fails validation).
 */
export function scoreOpportunityDeterministic(
  candidate: OpportunityCandidate,
  profile: ProProfileRow,
  opts?: { vectorSimilarity?: number | null; nowMs?: number },
): OpportunityEvaluation {
  const haystack = `${candidate.title} ${candidate.brandOrClient} ${candidate.description} ${candidate.compensationText ?? ""}`.toLowerCase();
  const budget =
    candidate.budgetMillimes ??
    parseProBudgetMillimes(`${candidate.compensationText ?? ""} ${candidate.description}`);
  const floor = profile.min_deal_budget_millimes;

  let score = 42;
  const reasons: string[] = [];

  // 1. Keyword alignment with profile opportunity_keywords
  const matchedKeywords = profile.opportunity_keywords.filter((kw) =>
    kw.trim().length >= 2 && haystack.includes(kw.trim().toLowerCase()),
  );
  if (matchedKeywords.length > 0) {
    score += Math.min(28, matchedKeywords.length * 8);
    reasons.push(`Matches your focus keywords: ${matchedKeywords.slice(0, 4).join(", ")}`);
  }

  // 2. Vector similarity boost (when gemini-embedding-2 vectors exist)
  if (typeof opts?.vectorSimilarity === "number" && opts.vectorSimilarity > 0.55) {
    const boost = Math.round((opts.vectorSimilarity - 0.5) * 35);
    score += Math.min(20, Math.max(0, boost));
    reasons.push(`Strong semantic alignment (${Math.round(opts.vectorSimilarity * 100)}% vector fit)`);
  }

  // 3. Budget floor evaluation (integer millimes)
  if (budget !== null && floor !== null) {
    if (budget >= floor * 1.5) {
      score += 22;
      reasons.push(
        `Budget (${formatMillimesForChat(budget)}) is well above your ${formatMillimesForChat(floor)} floor`,
      );
    } else if (budget >= floor) {
      score += 15;
      reasons.push(
        `Budget (${formatMillimesForChat(budget)}) meets your ${formatMillimesForChat(floor)} minimum floor`,
      );
    } else if (budget > 0) {
      score -= 18;
      reasons.push(
        `Stated budget (${formatMillimesForChat(budget)}) is below your ${formatMillimesForChat(floor)} floor — hold minimum rate`,
      );
    }
  } else if (budget !== null && budget > 0) {
    score += 12;
    reasons.push(`Clear compensation stated upfront (${formatMillimesForChat(budget)})`);
  }

  // 4. Tunisia locality alignment
  const city = profile.location_city.trim().toLowerCase();
  if (
    (city && haystack.includes(city)) ||
    /\b(?:tunisie|tunisia|tunis|hammamet|sousse|djerba|sfax|marsa|lac|ennasr|ariana)\b/i.test(haystack)
  ) {
    score += 8;
    reasons.push(`Located in Tunisia (${profile.location_city} market fit)`);
  }

  // 5. Urgency from deadline & fit
  const hrs = hoursUntilDeadline(candidate.deadlineAt, opts?.nowMs);
  let urgency: OpportunityUrgency = "medium";
  if (hrs !== null && hrs > 0 && hrs <= 24) {
    urgency = "critical";
    score += 6;
    reasons.push("Deadline closes within 24 hours");
  } else if (hrs !== null && hrs > 0 && hrs <= 72) {
    urgency = "high";
    score += 4;
    reasons.push("Closing within 72 hours — fast response recommended");
  } else if (score >= 82) {
    urgency = "high";
  } else if (score < 55) {
    urgency = "low";
  }

  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const category = candidate.category ?? inferCategory(haystack, profile);
  if (reasons.length === 0) {
    reasons.push(`Relevant ${profile.profession_preset} opportunity in Tunisia`);
  }

  // Safe rate text (never quotes below floor)
  const safeRateMillimes =
    budget !== null && (floor === null || budget >= floor)
      ? budget
      : floor;
  const rateSentence =
    safeRateMillimes !== null
      ? ` Mon tarif de référence démarre à ${formatMillimesForChat(safeRateMillimes)}.`
      : "";

  const draftPitch =
    profile.profession_preset === "doctor"
      ? `Bonjour ${candidate.brandOrClient}, je suis ${profile.display_name} (${profile.headline}). Votre brief "${candidate.title}" correspond parfaitement à mes interventions en Tunisie.${rateSentence} Je suis disponible pour échanger sur le format et le planning cette semaine.`
      : profile.profession_preset === "cameraman"
        ? `Bonjour ${candidate.brandOrClient} ! Je suis ${profile.display_name} (${profile.headline}). Votre projet "${candidate.title}" matche parfaitement mes productions 4K en Tunisie.${rateSentence} Je peux vous partager mon showreel et confirmer mes disponibilités sur WhatsApp.`
        : `Bonjour ${candidate.brandOrClient} ! Je suis ${profile.display_name} (${profile.headline}). Votre brief "${candidate.title}" correspond très bien à mon audience en Tunisie.${rateSentence} Je serais ravi(e) d'échanger les détails et le calendrier avec votre équipe.`;

  return {
    fitScore: clampedScore,
    urgency,
    category,
    fitReasons: reasons.slice(0, 5),
    draftPitch,
  };
}

/**
 * Evaluates an opportunity against the user's `pro_profiles` goals, floor, and
 * voice using `tier: "reasoning"` (`gemini-4-argon` / `gpt-6-astra` / `claude-opus-5-5`).
 * Enforces Zod validation, rate-floor firewall, and doctor medical safety firewall.
 */
export async function evaluateOpportunityFit(
  candidate: OpportunityCandidate,
  profile: ProProfileRow,
  opts?: { vectorSimilarity?: number | null; conversationId?: string },
): Promise<{ evaluation: OpportunityEvaluation; source: "reasoning" | "deterministic" }> {
  const baseline = scoreOpportunityDeterministic(candidate, profile, {
    vectorSimilarity: opts?.vectorSimilarity,
  });

  const budget =
    candidate.budgetMillimes ??
    parseProBudgetMillimes(`${candidate.compensationText ?? ""} ${candidate.description}`);
  const floor = profile.min_deal_budget_millimes;

  const allowedMillimes: number[] = [];
  if (floor !== null && floor > 0) allowedMillimes.push(floor);
  if (budget !== null && budget > 0 && (floor === null || budget >= floor)) {
    allowedMillimes.push(budget);
  }

  const samplesBlock = profile.style_samples
    .slice(0, 3)
    .map((s, idx) => `Sample ${idx + 1} (${s.situation}): "${s.reply}"`)
    .join("\n");

  const system = [
    `You are the Opportunity Radar reasoning engine for ${profile.display_name} (${profile.headline}, track=${profile.profession_preset}, city=${profile.location_city}, Tunisia).`,
    `Opportunity Goals: ${profile.opportunity_goals}`,
    `Priority Keywords: ${profile.opportunity_keywords.join(", ") || "none"}`,
    `Minimum Budget Floor: ${floor !== null ? formatMillimesForChat(floor) : "flexible"}`,
    `Voice & Style Rules: ${profile.style_rules}`,
    `Hard Boundaries: ${profile.boundaries_note}`,
    samplesBlock ? `Voice Samples:\n${samplesBlock}` : null,
    `PRICE FIREWALL: If you mention any DT amount in draftPitch, use ONLY allowed amounts (${
      allowedMillimes.length > 0 ? allowedMillimes.map(formatMillimesForChat).join(", ") : "none"
    }) and NEVER quote below the minimum floor.`,
    "Return strictly the JSON schema. Write fitReasons in concise English and draftPitch in the person's authentic French/Derja style.",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `Opportunity Source: ${candidate.source}`,
    `Title: ${candidate.title}`,
    `Brand / Client: ${candidate.brandOrClient}`,
    `Description: ${candidate.description}`,
    `Compensation: ${candidate.compensationText ?? (budget !== null ? formatMillimesForChat(budget) : "Not stated")}`,
    typeof opts?.vectorSimilarity === "number"
      ? `Semantic Similarity Score: ${Math.round(opts.vectorSimilarity * 100)}%`
      : null,
    `Deterministic Baseline Fit: ${baseline.fitScore}/100 (${baseline.urgency})`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await sparkJson({
      schema: opportunityEvaluationSchema,
      jsonSchema: opportunityEvaluationJsonSchema,
      schemaName: "pro_opportunity_eval",
      system,
      user,
      tier: "reasoning",
      conversationId: opts?.conversationId,
    });

    const normalizedPitch = normalizeProReplyAmounts(raw.draftPitch, allowedMillimes);
    const rateOk = passesProRateFirewall(normalizedPitch, allowedMillimes, floor);
    const medOk =
      profile.profession_preset !== "doctor" || passesMedicalSafetyFirewall(normalizedPitch);

    if (!rateOk || !medOk) {
      return {
        evaluation: {
          ...raw,
          draftPitch: baseline.draftPitch,
        },
        source: "deterministic",
      };
    }

    return {
      evaluation: {
        ...raw,
        draftPitch: normalizedPitch,
      },
      source: "reasoning",
    };
  } catch {
    return { evaluation: baseline, source: "deterministic" };
  }
}

export function shouldAlertForOpportunity(evaluation: OpportunityEvaluation): boolean {
  return (
    evaluation.fitScore >= 75 ||
    evaluation.urgency === "high" ||
    evaluation.urgency === "critical"
  );
}

async function loadProfileForMerchant(
  supabase: AdminClient,
  merchantId: string,
): Promise<ProProfileRow> {
  const [{ data: profileRow }, { data: merchantRow }] = await Promise.all([
    supabase.from("pro_profiles").select("*").eq("merchant_id", merchantId).maybeSingle(),
    supabase.from("merchants").select("name, pro_category").eq("id", merchantId).maybeSingle(),
  ]);

  const m = (merchantRow ?? {}) as { name?: unknown; pro_category?: unknown };
  const fallbackCategory = isProCategory(m.pro_category) ? m.pro_category : "creator";
  const preset = getProPreset(fallbackCategory);
  if (!profileRow) {
    return {
      merchant_id: merchantId,
      display_name: typeof m.name === "string" ? m.name : preset.defaultDisplayName,
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

  const row = profileRow as Record<string, unknown>;
  return {
    merchant_id: merchantId,
    display_name: String(row.display_name ?? preset.defaultDisplayName),
    headline: String(row.headline ?? preset.headline),
    profession_preset: isProCategory(row.profession_preset) ? row.profession_preset : preset.id,
    bio: String(row.bio ?? ""),
    location_city: String(row.location_city ?? "Tunis"),
    clinic_or_studio_address: String(row.clinic_or_studio_address ?? ""),
    lat: typeof row.lat === "number" ? row.lat : null,
    lng: typeof row.lng === "number" ? row.lng : null,
    style_samples: Array.isArray(row.style_samples)
      ? (row.style_samples as ProProfileRow["style_samples"])
      : [],
    style_rules: String(row.style_rules ?? ""),
    boundaries_note: String(row.boundaries_note ?? ""),
    opportunity_goals: String(row.opportunity_goals ?? ""),
    opportunity_keywords: Array.isArray(row.opportunity_keywords)
      ? (row.opportunity_keywords as string[])
      : [],
    min_deal_budget_millimes:
      typeof row.min_deal_budget_millimes === "number" ? row.min_deal_budget_millimes : null,
    auto_reply_enabled:
      typeof row.auto_reply_enabled === "boolean" ? row.auto_reply_enabled : true,
    alert_whatsapp_phone:
      typeof row.alert_whatsapp_phone === "string" ? row.alert_whatsapp_phone : null,
    alert_email: typeof row.alert_email === "string" ? row.alert_email : null,
  };
}

export interface ScoredOpportunityResult {
  opportunityId: string;
  matchId: string | null;
  evaluation: OpportunityEvaluation;
  source: "reasoning" | "deterministic";
  status: OpportunityMatchStatus;
  alertCreated: boolean;
  alertId: string | null;
}

/**
 * Ingests a new brief into `opportunities` (unless `candidate.id` already exists),
 * scores it via `evaluateOpportunityFit`, upserts `opportunity_matches` with `status = "new"`
 * (never auto-applying without explicit human approval), and creates a `pro_alerts` row
 * when `fitScore >= 75` or urgency is high/critical.
 */
export async function ingestAndScoreOpportunity(
  supabase: AdminClient,
  merchantId: string,
  candidate: OpportunityCandidate,
  opts?: { profile?: ProProfileRow; profileEmbedding?: number[] | null; fetchImpl?: typeof fetch },
): Promise<ScoredOpportunityResult> {
  const profile = opts?.profile ?? (await loadProfileForMerchant(supabase, merchantId));
  const budgetMillimes =
    candidate.budgetMillimes ??
    parseProBudgetMillimes(`${candidate.compensationText ?? ""} ${candidate.description}`);

  let oppEmbedding = candidate.embedding ?? null;
  let vectorSim: number | null = null;
  if (!oppEmbedding && embedConfigured()) {
    try {
      const [vec] = await embedTexts([`${candidate.title}. ${candidate.description}`.slice(0, 600)]);
      oppEmbedding = vec ?? null;
    } catch {
      oppEmbedding = null;
    }
  }
  if (oppEmbedding && opts?.profileEmbedding && oppEmbedding.length === opts.profileEmbedding.length) {
    vectorSim = cosineSimilarity(oppEmbedding, opts.profileEmbedding);
  }

  const { evaluation, source } = await evaluateOpportunityFit(
    { ...candidate, budgetMillimes },
    profile,
    { vectorSimilarity: vectorSim, conversationId: candidate.conversationId ?? undefined },
  );

  let opportunityId = candidate.id ?? "";
  if (!opportunityId) {
    const insertPayload: Record<string, unknown> = {
      merchant_id: merchantId,
      source: candidate.source,
      conversation_id: candidate.conversationId ?? null,
      title: candidate.title,
      brand_or_client: candidate.brandOrClient,
      category: candidate.category ?? evaluation.category,
      description: candidate.description,
      compensation_text:
        candidate.compensationText?.trim() ||
        (budgetMillimes !== null ? formatMillimesForChat(budgetMillimes) : "À définir"),
      budget_millimes: budgetMillimes,
      deadline_at: candidate.deadlineAt ?? null,
      apply_url: candidate.applyUrl ?? null,
    };
    if (oppEmbedding) insertPayload.embedding = oppEmbedding;

    const { data: oppRow, error: oppErr } = await supabase
      .from("opportunities")
      .insert(insertPayload)
      .select("id")
      .single();
    if (oppErr || !oppRow) {
      throw new Error(`opportunity insert failed: ${oppErr?.message ?? "unknown"}`);
    }
    opportunityId = String((oppRow as { id: unknown }).id);
  }

  const { data: matchRow, error: matchErr } = await supabase
    .from("opportunity_matches")
    .upsert(
      {
        merchant_id: merchantId,
        opportunity_id: opportunityId,
        fit_score: evaluation.fitScore,
        urgency: evaluation.urgency,
        fit_reasons: evaluation.fitReasons,
        draft_pitch: evaluation.draftPitch,
        status: "new",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "merchant_id,opportunity_id" },
    )
    .select("id")
    .maybeSingle();

  if (matchErr) {
    throw new Error(`opportunity match upsert failed: ${matchErr.message}`);
  }

  const matchId =
    matchRow && typeof (matchRow as { id?: unknown }).id === "string"
      ? (matchRow as { id: string }).id
      : null;

  let alertCreated = false;
  let alertId: string | null = null;
  if (shouldAlertForOpportunity(evaluation)) {
    const isUrgent =
      evaluation.fitScore >= 85 ||
      evaluation.urgency === "high" ||
      evaluation.urgency === "critical";
    const hrs = hoursUntilDeadline(candidate.deadlineAt);
    const alertCategory = hrs !== null && hrs > 0 && hrs <= 72 ? "deadline" : "opportunity_match";

    const alertRes = await createProAlert(supabase, {
      merchantId,
      conversationId: candidate.conversationId ?? null,
      opportunityId,
      severity: isUrgent ? "urgent" : "important",
      category: alertCategory,
      title: `${evaluation.fitScore}% match — ${candidate.title}`,
      summary: `${candidate.brandOrClient}: ${evaluation.fitReasons[0] ?? candidate.description.slice(0, 140)}`,
      recommendedAction: "Review the AI-drafted pitch in Opportunities and approve before sending.",
      draftReply: evaluation.draftPitch,
      profile,
      fetchImpl: opts?.fetchImpl,
    });
    alertCreated = Boolean(alertRes.id);
    alertId = alertRes.id;
  }

  await logEvent(candidate.conversationId ?? null, "pro.opportunity.scored", {
    opportunityId,
    fitScore: evaluation.fitScore,
    urgency: evaluation.urgency,
    source,
    alertCreated,
  });

  return {
    opportunityId,
    matchId,
    evaluation,
    source,
    status: "new",
    alertCreated,
    alertId,
  };
}

const DM_OPPORTUNITY_SIGNAL =
  /\b(?:collab|collaboration|sponsor|sponsoris[eé]|partenariat|campagne|marque|agence|brief|tournage|shooting|mariage|outia|podcast|conf[eé]rence|interview|retainer|ugc|ambassad|devis|budget|offre|شراكة|إشهار|حملة|تعاون)\b/i;

export interface ScanOpportunitiesSummary {
  scannedDms: number;
  scannedBoard: number;
  newMatches: number;
  alertsCreated: number;
  matches: ScoredOpportunityResult[];
}

/**
 * Scans BOTH:
 * 1. Recent inbound DM conversations containing commercial/opportunity signals not yet tracked.
 * 2. Unmatched Opportunity Board briefs for this merchant (or shared public board rows where `merchant_id IS NULL`).
 */
export async function scanMerchantOpportunities(
  supabase: AdminClient,
  merchantId: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<ScanOpportunitiesSummary> {
  const profile = await loadProfileForMerchant(supabase, merchantId);

  const [{ data: existingMatches }, { data: boardOpps }, { data: recentConvs }] = await Promise.all([
    supabase
      .from("opportunity_matches")
      .select("opportunity_id")
      .eq("merchant_id", merchantId),
    supabase
      .from("opportunities")
      .select("id, source, conversation_id, title, brand_or_client, category, description, compensation_text, budget_millimes, deadline_at, apply_url, embedding")
      .or(`merchant_id.eq.${merchantId},merchant_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("conversations")
      .select("id, customer_id, slots, updated_at")
      .eq("merchant_id", merchantId)
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);

  const matchedIds = new Set(
    (existingMatches ?? []).map((r) => String((r as { opportunity_id: unknown }).opportunity_id)),
  );
  const existingConvIds = new Set(
    (boardOpps ?? [])
      .map((r) => (r as { conversation_id?: unknown }).conversation_id)
      .filter((id): id is string => typeof id === "string"),
  );

  let profileEmbedding: number[] | null = null;
  if (embedConfigured() && profile.opportunity_goals.trim()) {
    try {
      const [vec] = await embedTexts([
        `${profile.headline}. ${profile.opportunity_goals}. ${profile.opportunity_keywords.join(", ")}`.slice(
          0,
          600,
        ),
      ]);
      profileEmbedding = vec ?? null;
    } catch {
      profileEmbedding = null;
    }
  }

  const results: ScoredOpportunityResult[] = [];
  let scannedBoard = 0;
  let scannedDms = 0;

  // 1. Score unmatched board briefs
  for (const row of (boardOpps ?? []) as Array<Record<string, unknown>>) {
    const id = String(row.id ?? "");
    if (!id || matchedIds.has(id)) continue;
    scannedBoard++;
    const scored = await ingestAndScoreOpportunity(
      supabase,
      merchantId,
      {
        id,
        source: (row.source as OpportunitySource) ?? "board",
        conversationId: typeof row.conversation_id === "string" ? row.conversation_id : null,
        title: String(row.title ?? "Opportunity"),
        brandOrClient: String(row.brand_or_client ?? "External Brief"),
        category: (row.category as OpportunityCategory) ?? undefined,
        description: String(row.description ?? ""),
        compensationText: typeof row.compensation_text === "string" ? row.compensation_text : undefined,
        budgetMillimes: typeof row.budget_millimes === "number" ? row.budget_millimes : null,
        deadlineAt: typeof row.deadline_at === "string" ? row.deadline_at : null,
        applyUrl: typeof row.apply_url === "string" ? row.apply_url : null,
        embedding: Array.isArray(row.embedding) ? (row.embedding as number[]) : null,
      },
      { profile, profileEmbedding, fetchImpl: opts?.fetchImpl },
    );
    results.push(scored);
    matchedIds.add(id);
  }

  // 2. Scan recent inbound DMs for unlogged opportunity signals
  const candidateConvs = ((recentConvs ?? []) as Array<Record<string, unknown>>).filter((c) => {
    const id = String(c.id ?? "");
    return id && !existingConvIds.has(id);
  });

  if (candidateConvs.length > 0) {
    const convIds = candidateConvs.map((c) => String(c.id));
    const { data: inboundMsgs } = await supabase
      .from("messages")
      .select("conversation_id, body, created_at")
      .in("conversation_id", convIds)
      .eq("direction", "in")
      .order("created_at", { ascending: true })
      .limit(120);

    const byConv = new Map<string, string[]>();
    for (const msg of (inboundMsgs ?? []) as Array<{ conversation_id?: unknown; body?: unknown }>) {
      const cid = typeof msg.conversation_id === "string" ? msg.conversation_id : "";
      const body = typeof msg.body === "string" ? msg.body.trim() : "";
      if (!cid || !body) continue;
      const list = byConv.get(cid) ?? [];
      list.push(body);
      byConv.set(cid, list);
    }

    for (const conv of candidateConvs) {
      const cid = String(conv.id);
      const text = (byConv.get(cid) ?? []).join("\n").trim();
      if (!text) continue;
      scannedDms++;

      const lower = text.toLowerCase();
      const budget = parseProBudgetMillimes(text);
      const keywordHit = profile.opportunity_keywords.some(
        (kw) => kw.trim().length >= 3 && lower.includes(kw.trim().toLowerCase()),
      );
      const hasSignal =
        DM_OPPORTUNITY_SIGNAL.test(text) ||
        keywordHit ||
        (budget !== null &&
          profile.min_deal_budget_millimes !== null &&
          budget >= profile.min_deal_budget_millimes);

      if (!hasSignal) continue;

      const slots = (conv.slots ?? {}) as Record<string, unknown>;
      const title =
        (typeof slots.scopeSummary === "string" && slots.scopeSummary) ||
        (typeof slots.matchedServiceTitle === "string" && `DM Inquiry: ${slots.matchedServiceTitle}`) ||
        `Inbound DM Opportunity (${profile.location_city})`;
      const brandOrClient =
        (typeof slots.clientName === "string" && slots.clientName) || "Inbound DM Client";

      const scored = await ingestAndScoreOpportunity(
        supabase,
        merchantId,
        {
          source: "dm",
          conversationId: cid,
          title,
          brandOrClient,
          description: text.slice(0, 600),
          budgetMillimes: budget,
        },
        { profile, profileEmbedding, fetchImpl: opts?.fetchImpl },
      );
      results.push(scored);
    }
  }

  return {
    scannedDms,
    scannedBoard,
    newMatches: results.length,
    alertsCreated: results.filter((r) => r.alertCreated).length,
    matches: results,
  };
}
