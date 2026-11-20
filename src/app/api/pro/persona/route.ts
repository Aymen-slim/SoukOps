import { NextResponse } from "next/server";
import { z } from "zod";
import { embedConfigured, embedTexts } from "@/lib/ai/embeddings";
import { normalizeTunisianPhone } from "@/lib/domain/derja";
import { requireProMerchant } from "@/lib/pro/guard";
import { getProPreset } from "@/lib/pro/presets";
import { PRO_CATEGORIES } from "@/lib/pro/types";

const styleSampleSchema = z.object({
  situation: z.string().trim().min(2).max(200),
  reply: z.string().trim().min(2).max(1000),
});

const personaPatchSchema = z.object({
  display_name: z.string().trim().min(2).max(120).optional(),
  headline: z.string().trim().max(200).optional(),
  profession_preset: z.enum(PRO_CATEGORIES).optional(),
  bio: z.string().trim().max(1500).optional(),
  location_city: z.string().trim().max(80).optional(),
  clinic_or_studio_address: z.string().trim().max(240).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  style_samples: z.array(styleSampleSchema).max(10).optional(),
  style_rules: z.string().trim().max(1500).optional(),
  boundaries_note: z.string().trim().max(1500).optional(),
  opportunity_goals: z.string().trim().max(1500).optional(),
  opportunity_keywords: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  min_deal_budget_millimes: z.number().int().min(0).max(500_000_000).nullable().optional(),
  auto_reply_enabled: z.boolean().optional(),
  alert_whatsapp_phone: z.string().trim().max(40).nullable().optional(),
  alert_email: z.string().trim().email().max(160).nullable().or(z.literal("")).optional(),
});

export async function GET() {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const { data, error } = await supabase
    .from("pro_profiles")
    .select("*")
    .eq("merchant_id", merchant.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const preset = getProPreset(merchant.pro_category);
  return NextResponse.json({
    profile: data ?? {
      merchant_id: merchant.id,
      display_name: merchant.name || preset.defaultDisplayName,
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
    },
    preset,
  });
}

export async function PATCH(request: Request) {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const parsed = personaPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid persona update payload" },
      { status: 400 },
    );
  }

  const v = parsed.data;
  const patch: Record<string, unknown> = {
    ...v,
    updated_at: new Date().toISOString(),
  };

  if (v.alert_whatsapp_phone !== undefined) {
    if (!v.alert_whatsapp_phone) {
      patch.alert_whatsapp_phone = null;
    } else {
      const normalized = normalizeTunisianPhone(v.alert_whatsapp_phone);
      if (!normalized) {
        return NextResponse.json(
          { error: "Use a valid Tunisian WhatsApp number (+216 XX XXX XXX)." },
          { status: 400 },
        );
      }
      patch.alert_whatsapp_phone = normalized;
    }
  }
  if (v.alert_email === "") {
    patch.alert_email = null;
  }

  // Re-embed profile goals when opportunity matching criteria change
  if (
    embedConfigured() &&
    (v.opportunity_goals !== undefined ||
      v.opportunity_keywords !== undefined ||
      v.headline !== undefined ||
      v.bio !== undefined)
  ) {
    try {
      const text = [
        v.headline ?? "",
        v.bio ?? "",
        v.opportunity_goals ?? "",
        (v.opportunity_keywords ?? []).join(", "),
      ]
        .join(". ")
        .trim();
      if (text.length >= 4) {
        const [vec] = await embedTexts([text.slice(0, 600)]);
        if (vec) patch.embedding = vec;
      }
    } catch {
      // Embedding update is best-effort
    }
  }

  const { data: existing } = await supabase
    .from("pro_profiles")
    .select("merchant_id")
    .eq("merchant_id", merchant.id)
    .maybeSingle();

  let saved: unknown = null;
  if (existing) {
    const { data, error } = await supabase
      .from("pro_profiles")
      .update(patch)
      .eq("merchant_id", merchant.id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    saved = data;
  } else {
    const preset = getProPreset(v.profession_preset ?? merchant.pro_category);
    const { data, error } = await supabase
      .from("pro_profiles")
      .insert({
        merchant_id: merchant.id,
        display_name: v.display_name ?? merchant.name ?? preset.defaultDisplayName,
        headline: v.headline ?? preset.headline,
        profession_preset: v.profession_preset ?? preset.id,
        bio: v.bio ?? preset.bio,
        location_city: v.location_city ?? preset.locationCity,
        clinic_or_studio_address: v.clinic_or_studio_address ?? preset.clinicOrStudioAddress,
        lat: v.lat ?? preset.lat,
        lng: v.lng ?? preset.lng,
        style_samples: v.style_samples ?? preset.styleSamples,
        style_rules: v.style_rules ?? preset.styleRules,
        boundaries_note: v.boundaries_note ?? preset.boundariesNote,
        opportunity_goals: v.opportunity_goals ?? preset.opportunityGoals,
        opportunity_keywords: v.opportunity_keywords ?? preset.opportunityKeywords,
        min_deal_budget_millimes: v.min_deal_budget_millimes ?? preset.minDealBudgetMillimes,
        auto_reply_enabled: v.auto_reply_enabled ?? true,
        alert_whatsapp_phone: patch.alert_whatsapp_phone ?? null,
        alert_email: patch.alert_email ?? null,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    saved = data;
  }

  if (v.display_name || v.profession_preset) {
    const merchantPatch: Record<string, unknown> = {};
    if (v.display_name) merchantPatch.name = v.display_name;
    if (v.profession_preset) merchantPatch.pro_category = v.profession_preset;
    await supabase.from("merchants").update(merchantPatch).eq("id", merchant.id);
  }

  return NextResponse.json({ profile: saved });
}
