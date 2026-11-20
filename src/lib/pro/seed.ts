import { getProPreset } from "./presets";
import type { ProCategory } from "./types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export interface SeedProResult {
  seeded: boolean;
  missingSchema?: boolean;
  error?: string;
}

/**
 * Seeds a new Creator / Professional workspace with Tunisia-first profile,
 * services, sample opportunities, an initial alert, and a welcome briefing.
 * Idempotent: skips if `pro_profiles` already exists for the merchant.
 */
export async function seedProWorkspace(
  supabase: Admin,
  merchantId: string,
  presetCategory: ProCategory = "creator",
  customDisplayName?: string,
): Promise<SeedProResult> {
  const preset = getProPreset(presetCategory);

  const existing = await supabase
    .from("pro_profiles")
    .select("merchant_id")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (existing.error) {
    const missingSchema = /relation|schema|pro_profiles/i.test(existing.error.message);
    return { seeded: false, missingSchema, error: existing.error.message };
  }
  if (existing.data) {
    return { seeded: true };
  }

  const displayName = customDisplayName?.trim() || preset.defaultDisplayName;

  const { error: profileErr } = await supabase.from("pro_profiles").insert({
    merchant_id: merchantId,
    display_name: displayName,
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
  });
  if (profileErr) {
    return {
      seeded: false,
      missingSchema: /relation|column|schema/i.test(profileErr.message),
      error: profileErr.message,
    };
  }

  if (preset.services.length > 0) {
    await supabase.from("pro_services").insert(
      preset.services.map((service) => ({
        merchant_id: merchantId,
        title: service.title,
        category: service.category,
        description: service.description,
        deliverables: service.deliverables,
        duration_label: service.duration_label,
        price_millimes: service.price_millimes,
        price_display: service.price_display,
        floor_millimes: service.floor_millimes,
        pricing_mode: service.pricing_mode,
        intake_questions: service.intake_questions,
        prep_or_details_template: service.prep_or_details_template,
        booking_url: service.booking_url ?? null,
        active: true,
      })),
    );
  }

  let firstOpportunityId: string | null = null;
  for (const opp of preset.sampleOpportunities) {
    const { data: insertedOpp } = await supabase
      .from("opportunities")
      .insert({
        merchant_id: merchantId,
        source: opp.source,
        title: opp.title,
        brand_or_client: opp.brand_or_client,
        category: opp.category,
        description: opp.description,
        compensation_text: opp.compensation_text,
        budget_millimes: opp.budget_millimes,
        deadline_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (insertedOpp?.id) {
      if (!firstOpportunityId) firstOpportunityId = insertedOpp.id as string;
      await supabase.from("opportunity_matches").insert({
        merchant_id: merchantId,
        opportunity_id: insertedOpp.id,
        fit_score: opp.fit_score,
        urgency: opp.urgency,
        fit_reasons: opp.fit_reasons,
        draft_pitch: opp.draft_pitch,
        status: "new",
      });
    }
  }

  await supabase.from("pro_alerts").insert({
    merchant_id: merchantId,
    opportunity_id: firstOpportunityId,
    severity: preset.sampleAlert.severity,
    category: preset.sampleAlert.category,
    title: preset.sampleAlert.title,
    summary: preset.sampleAlert.summary,
    recommended_action: preset.sampleAlert.recommended_action,
    draft_reply: preset.sampleAlert.draft_reply,
    status: "unread",
    notified_channels: ["in_app"],
  });

  await supabase.from("agent_briefings").insert({
    merchant_id: merchantId,
    headline: preset.welcomeBriefing.headline,
    highlights: preset.welcomeBriefing.highlights,
    stats: {
      dmsHandled: 0,
      activeInquiries: 0,
      opportunitiesSpotted: preset.sampleOpportunities.length,
      unreadAlerts: 1,
    },
    action_items: preset.welcomeBriefing.actionItems,
  });

  return { seeded: true };
}
