import { z } from "zod";
import { sparkJson } from "@/lib/ai/spark";
import { formatMillimesForChat } from "@/lib/domain/pricing";
import { logEvent } from "@/lib/pipeline/events";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getProPreset } from "./presets";
import { isProCategory, type ProProfileRow } from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

export const briefingSynthesisSchema = z.object({
  headline: z.string().trim().min(5).max(200),
  highlights: z.array(z.string().trim().min(3).max(240)).min(1).max(6),
  actionItems: z.array(z.string().trim().min(3).max(240)).min(1).max(5),
});

export type BriefingSynthesis = z.infer<typeof briefingSynthesisSchema>;

const briefingSynthesisJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "highlights", "actionItems"],
  properties: {
    headline: { type: "string" },
    highlights: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: { type: "string" },
    },
    actionItems: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string" },
    },
  },
};

export interface ProBriefingStats {
  dmsHandled: number;
  activeInquiries: number;
  opportunitiesSpotted: number;
  unreadAlerts: number;
  criticalAlerts: number;
  topOpportunityScore: number | null;
  topOpportunityBudgetMillimes: number | null;
}

export interface AgentBriefingRecord {
  id: string | null;
  merchant_id: string;
  period_start: string;
  period_end: string;
  headline: string;
  highlights: string[];
  stats: ProBriefingStats;
  action_items: string[];
  created_at: string;
  source: "reasoning" | "deterministic";
}

interface BriefingSnapshot {
  profile: ProProfileRow;
  stats: ProBriefingStats;
  recentInquiries: Array<{
    clientName: string | null;
    scopeSummary: string;
    status: string;
    budgetMillimes: number | null;
  }>;
  topOpportunities: Array<{
    title: string;
    brandOrClient: string;
    fitScore: number;
    urgency: string;
    budgetMillimes: number | null;
  }>;
  unreadAlertRows: Array<{
    severity: string;
    category: string;
    title: string;
  }>;
}

async function collectBriefingSnapshot(
  supabase: AdminClient,
  merchantId: string,
  sinceIso: string,
): Promise<BriefingSnapshot> {
  const [
    { data: profileRow },
    { data: merchantRow },
    { data: convRows },
    { data: inquiryRows },
    { data: matchRows },
    { data: alertRows },
  ] = await Promise.all([
    supabase.from("pro_profiles").select("*").eq("merchant_id", merchantId).maybeSingle(),
    supabase.from("merchants").select("name, pro_category").eq("id", merchantId).maybeSingle(),
    supabase.from("conversations").select("id").eq("merchant_id", merchantId).limit(100),
    supabase
      .from("service_inquiries")
      .select("client_name, scope_summary, status, budget_millimes, updated_at")
      .eq("merchant_id", merchantId)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("opportunity_matches")
      .select("fit_score, urgency, status, opportunity_id")
      .eq("merchant_id", merchantId)
      .in("status", ["new", "shortlisted"])
      .order("fit_score", { ascending: false })
      .limit(10),
    supabase
      .from("pro_alerts")
      .select("severity, category, title, status")
      .eq("merchant_id", merchantId)
      .eq("status", "unread")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const m = (merchantRow ?? {}) as { name?: unknown; pro_category?: unknown };
  const fallbackCategory = isProCategory(m.pro_category) ? m.pro_category : "creator";
  const preset = getProPreset(fallbackCategory);
  const rawProfile = (profileRow ?? null) as Record<string, unknown> | null;
  const profile: ProProfileRow = rawProfile
    ? {
        merchant_id: merchantId,
        display_name: String(rawProfile.display_name ?? m.name ?? preset.defaultDisplayName),
        headline: String(rawProfile.headline ?? preset.headline),
        profession_preset: isProCategory(rawProfile.profession_preset)
          ? rawProfile.profession_preset
          : preset.id,
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
          typeof rawProfile.alert_whatsapp_phone === "string"
            ? rawProfile.alert_whatsapp_phone
            : null,
        alert_email: typeof rawProfile.alert_email === "string" ? rawProfile.alert_email : null,
      }
    : {
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

  const convIds = ((convRows ?? []) as Array<{ id?: unknown }>)
    .map((c) => (typeof c.id === "string" ? c.id : ""))
    .filter(Boolean);

  let dmsHandled = 0;
  if (convIds.length > 0) {
    const { data: outMsgs } = await supabase
      .from("messages")
      .select("id")
      .in("conversation_id", convIds)
      .eq("direction", "out")
      .gte("created_at", sinceIso)
      .limit(500);
    dmsHandled = Array.isArray(outMsgs) ? outMsgs.length : 0;
  }

  const oppIds = ((matchRows ?? []) as Array<{ opportunity_id?: unknown }>)
    .map((r) => (typeof r.opportunity_id === "string" ? r.opportunity_id : ""))
    .filter(Boolean);

  const oppMap = new Map<
    string,
    { title: string; brandOrClient: string; budgetMillimes: number | null }
  >();
  if (oppIds.length > 0) {
    const { data: oppDetails } = await supabase
      .from("opportunities")
      .select("id, title, brand_or_client, budget_millimes")
      .in("id", oppIds);
    for (const row of (oppDetails ?? []) as Array<Record<string, unknown>>) {
      const id = typeof row.id === "string" ? row.id : "";
      if (!id) continue;
      oppMap.set(id, {
        title: String(row.title ?? "Opportunity"),
        brandOrClient: String(row.brand_or_client ?? "Client"),
        budgetMillimes: typeof row.budget_millimes === "number" ? row.budget_millimes : null,
      });
    }
  }

  const topOpportunities = ((matchRows ?? []) as Array<Record<string, unknown>>).map((mRow) => {
    const oid = String(mRow.opportunity_id ?? "");
    const detail = oppMap.get(oid);
    return {
      title: detail?.title ?? "Opportunity",
      brandOrClient: detail?.brandOrClient ?? "Client",
      fitScore: typeof mRow.fit_score === "number" ? mRow.fit_score : 50,
      urgency: String(mRow.urgency ?? "medium"),
      budgetMillimes: detail?.budgetMillimes ?? null,
    };
  });

  const recentInquiries = ((inquiryRows ?? []) as Array<Record<string, unknown>>).map((iRow) => ({
    clientName: typeof iRow.client_name === "string" ? iRow.client_name : null,
    scopeSummary: String(iRow.scope_summary ?? "Service inquiry"),
    status: String(iRow.status ?? "discussing"),
    budgetMillimes: typeof iRow.budget_millimes === "number" ? iRow.budget_millimes : null,
  }));

  const unreadAlertRows = ((alertRows ?? []) as Array<Record<string, unknown>>).map((aRow) => ({
    severity: String(aRow.severity ?? "important"),
    category: String(aRow.category ?? "custom_request"),
    title: String(aRow.title ?? "Alert"),
  }));

  const activeInquiries = recentInquiries.filter((i) =>
    ["discussing", "details_sent", "needs_approval"].includes(i.status),
  ).length;

  const criticalAlerts = unreadAlertRows.filter(
    (a) => a.severity === "critical" || a.severity === "urgent",
  ).length;

  const stats: ProBriefingStats = {
    dmsHandled,
    activeInquiries,
    opportunitiesSpotted: topOpportunities.length,
    unreadAlerts: unreadAlertRows.length,
    criticalAlerts,
    topOpportunityScore: topOpportunities[0]?.fitScore ?? null,
    topOpportunityBudgetMillimes: topOpportunities[0]?.budgetMillimes ?? null,
  };

  return {
    profile,
    stats,
    recentInquiries,
    topOpportunities,
    unreadAlertRows,
  };
}

/**
 * Deterministic fallback briefing built strictly from verified DB stats and `pricing.ts`.
 */
export function buildFallbackBriefing(snapshot: BriefingSnapshot): BriefingSynthesis {
  const { profile, stats, topOpportunities, unreadAlertRows } = snapshot;

  const headline =
    stats.criticalAlerts > 0
      ? `${stats.criticalAlerts} urgent alert${stats.criticalAlerts > 1 ? "s" : ""} need your attention alongside ${stats.opportunitiesSpotted} matched opportunit${stats.opportunitiesSpotted === 1 ? "y" : "ies"}.`
      : stats.opportunitiesSpotted > 0
        ? `${stats.dmsHandled} DMs handled, ${stats.activeInquiries} active inquiries, and ${stats.opportunitiesSpotted} scored opportunities ready for review.`
        : `${profile.display_name}'s assistant is active — ${stats.dmsHandled} DMs handled and ${stats.activeInquiries} active client inquiries.`;

  const highlights: string[] = [
    `${stats.dmsHandled} automated replies delivered in your voice across the last 24 hours`,
    `${stats.activeInquiries} active client service inquiries tracked with structured intake details`,
  ];

  if (topOpportunities[0]) {
    const top = topOpportunities[0];
    const budgetPart =
      top.budgetMillimes !== null ? ` · ${formatMillimesForChat(top.budgetMillimes)}` : "";
    highlights.push(
      `Top opportunity: ${top.brandOrClient} — ${top.title} (${top.fitScore}% fit${budgetPart})`,
    );
  }
  if (unreadAlertRows[0]) {
    highlights.push(
      `${stats.unreadAlerts} unread alert${stats.unreadAlerts === 1 ? "" : "s"} — latest: ${unreadAlertRows[0].title}`,
    );
  }

  const actionItems: string[] = [];
  if (stats.criticalAlerts > 0) {
    actionItems.push(`Open Urgent Alerts to handle ${stats.criticalAlerts} high-priority escalation(s) first`);
  }
  if (topOpportunities[0]) {
    actionItems.push(`Review & approve the AI-drafted pitch for "${topOpportunities[0].title}" in Opportunities`);
  }
  if (stats.activeInquiries > 0) {
    actionItems.push(`Confirm dates or custom quotes on ${stats.activeInquiries} active client inquiry(ies)`);
  }
  if (actionItems.length === 0) {
    actionItems.push("Run an Opportunity Scan or share your demo link to test live Derja & French DMs");
  }

  return {
    headline,
    highlights: highlights.slice(0, 6),
    actionItems: actionItems.slice(0, 5),
  };
}

/**
 * Builds a deterministic executive briefing from live DB metrics with 0 LLM calls.
 * Used by background/polling GET `/api/pro/briefing` so sidebar refreshes never invoke a model.
 */
export async function buildDeterministicProBriefing(
  supabase: AdminClient,
  merchantId: string,
  opts?: { windowHours?: number },
): Promise<AgentBriefingRecord> {
  const windowHours = Math.max(1, Math.min(168, opts?.windowHours ?? 24));
  const now = new Date();
  const periodStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000).toISOString();
  const periodEnd = now.toISOString();

  const snapshot = await collectBriefingSnapshot(supabase, merchantId, periodStart);
  const synthesis = buildFallbackBriefing(snapshot);

  return {
    id: null,
    merchant_id: merchantId,
    period_start: periodStart,
    period_end: periodEnd,
    headline: synthesis.headline,
    highlights: synthesis.highlights,
    stats: snapshot.stats,
    action_items: synthesis.actionItems,
    created_at: periodEnd,
    source: "deterministic",
  };
}

/**
 * Synthesizes an executive "What's New" briefing from the last 24h (or custom window)
 * using `tier: "reasoning"` with deterministic fallback, and persists it to `agent_briefings`.
 */
export async function generateProBriefing(
  supabase: AdminClient,
  merchantId: string,
  opts?: { windowHours?: number },
): Promise<AgentBriefingRecord> {
  const windowHours = Math.max(1, Math.min(168, opts?.windowHours ?? 24));
  const now = new Date();
  const periodStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000).toISOString();
  const periodEnd = now.toISOString();

  const snapshot = await collectBriefingSnapshot(supabase, merchantId, periodStart);
  const fallback = buildFallbackBriefing(snapshot);

  let synthesis = fallback;
  let source: "reasoning" | "deterministic" = "deterministic";

  const system = [
    `You write a crisp, executive "What's New" daily dashboard briefing in plain English for ${snapshot.profile.display_name} (${snapshot.profile.headline}, ${snapshot.profile.profession_preset} in Tunisia).`,
    "Use ONLY the verified numbers and items given below. Never invent counts, names, or DT amounts.",
    "Prioritize urgent/critical alerts first, then high-fit opportunities, then active client inquiries.",
    "Keep each highlight and action item under 180 characters. Return strictly the JSON schema.",
  ].join("\n");

  const user = [
    `Verified Activity Stats:`,
    `- DMs handled: ${snapshot.stats.dmsHandled}`,
    `- Active service inquiries: ${snapshot.stats.activeInquiries}`,
    `- Scored opportunities waiting: ${snapshot.stats.opportunitiesSpotted}`,
    `- Unread alerts: ${snapshot.stats.unreadAlerts} (urgent/critical: ${snapshot.stats.criticalAlerts})`,
    snapshot.unreadAlertRows.length > 0
      ? `Unread Alerts:\n${snapshot.unreadAlertRows
          .slice(0, 5)
          .map((a) => `- [${a.severity.toUpperCase()}/${a.category}] ${a.title}`)
          .join("\n")}`
      : "Unread Alerts: None",
    snapshot.topOpportunities.length > 0
      ? `Top Opportunities:\n${snapshot.topOpportunities
          .slice(0, 4)
          .map(
            (o) =>
              `- ${o.brandOrClient}: ${o.title} (${o.fitScore}% fit, ${o.urgency}${
                o.budgetMillimes !== null ? `, ${formatMillimesForChat(o.budgetMillimes)}` : ""
              })`,
          )
          .join("\n")}`
      : "Top Opportunities: None",
    snapshot.recentInquiries.length > 0
      ? `Recent Client Inquiries:\n${snapshot.recentInquiries
          .slice(0, 4)
          .map(
            (i) =>
              `- ${i.clientName ?? "Client"}: ${i.scopeSummary} [${i.status}]${
                i.budgetMillimes !== null ? ` (${formatMillimesForChat(i.budgetMillimes)})` : ""
              }`,
          )
          .join("\n")}`
      : "Recent Client Inquiries: None",
  ].join("\n");

  try {
    const raw = await sparkJson({
      schema: briefingSynthesisSchema,
      jsonSchema: briefingSynthesisJsonSchema,
      schemaName: "pro_daily_briefing",
      system,
      user,
      tier: "reasoning",
    });
    synthesis = raw;
    source = "reasoning";
  } catch {
    synthesis = fallback;
    source = "deterministic";
  }

  let id: string | null = null;
  let createdAt = periodEnd;
  try {
    const { data } = await supabase
      .from("agent_briefings")
      .insert({
        merchant_id: merchantId,
        period_start: periodStart,
        period_end: periodEnd,
        headline: synthesis.headline,
        highlights: synthesis.highlights,
        stats: snapshot.stats,
        action_items: synthesis.actionItems,
      })
      .select("id, created_at")
      .maybeSingle();
    if (data) {
      const row = data as { id?: unknown; created_at?: unknown };
      if (typeof row.id === "string") id = row.id;
      if (typeof row.created_at === "string") createdAt = row.created_at;
    }
  } catch {
    // Non-fatal if table insert fails in partial setups
  }

  await logEvent(null, "pro.briefing.generated", {
    merchantId,
    source,
    stats: snapshot.stats,
  });

  return {
    id,
    merchant_id: merchantId,
    period_start: periodStart,
    period_end: periodEnd,
    headline: synthesis.headline,
    highlights: synthesis.highlights,
    stats: snapshot.stats,
    action_items: synthesis.actionItems,
    created_at: createdAt,
    source,
  };
}
