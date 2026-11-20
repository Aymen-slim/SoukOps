"use client";

import { useState } from "react";
import { Plus, Save01, ShieldTick, Trash01 } from "@untitledui/icons";
import { invalidateDashboardUrl, useDashboardResource } from "@/app/dashboard/use-poll";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { AiControlsPanel } from "@/components/context/ai-controls-panel";
import { ContextChatPanel } from "@/components/context/context-chat-panel";
import { Alert } from "@/components/foundations/alert/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import type { ProCategory, ProProfileRow, ProStyleSample } from "@/lib/pro/types";

export default function ProPersonaPage() {
  const { data, error, reload } = useDashboardResource<{ profile: ProProfileRow }>("/api/pro/persona");
  const profile = data?.profile ?? null;

  if (!profile) {
    return (
      <div className="flex flex-col gap-6">
        <div className="border-b border-[#E4E4E7] pb-5">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#52525B]">
            Voice Clone &amp; Guardrails
          </p>
          <h1 className="mt-1.5 text-2xl font-medium tracking-[-0.03em] text-[#09090B] sm:text-3xl">
            My Style, Boundaries &amp; Alert Routing
          </h1>
        </div>
        {error ? (
          <Alert color="error">{error}</Alert>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-[#52525B]">
              Loading your persona settings…
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return <PersonaEditor key={profile.merchant_id} profile={profile} onSaved={reload} />;
}

function PersonaEditor({
  profile,
  onSaved,
}: {
  profile: ProProfileRow;
  onSaved: () => Promise<unknown>;
}) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [headline, setHeadline] = useState(profile.headline ?? "");
  const [preset, setPreset] = useState<ProCategory>(profile.profession_preset ?? "creator");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [locationCity, setLocationCity] = useState(profile.location_city ?? "Tunis");
  const [address, setAddress] = useState(profile.clinic_or_studio_address ?? "");
  const [styleRules, setStyleRules] = useState(profile.style_rules ?? "");
  const [boundariesNote, setBoundariesNote] = useState(profile.boundaries_note ?? "");
  const [styleSamples, setStyleSamples] = useState<ProStyleSample[]>(
    Array.isArray(profile.style_samples) ? profile.style_samples : [],
  );
  const [opportunityGoals, setOpportunityGoals] = useState(profile.opportunity_goals ?? "");
  const [keywordsCsv, setKeywordsCsv] = useState((profile.opportunity_keywords ?? []).join(", "));
  const [minBudgetDt, setMinBudgetDt] = useState(
    profile.min_deal_budget_millimes != null ? String(profile.min_deal_budget_millimes / 1000) : "",
  );
  const [alertPhone, setAlertPhone] = useState(profile.alert_whatsapp_phone ?? "");
  const [alertEmail, setAlertEmail] = useState(profile.alert_email ?? "");
  const [autoReply, setAutoReply] = useState(profile.auto_reply_enabled ?? true);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function savePersona() {
    setSaving(true);
    setFeedback(null);
    try {
      const parsedDt = Number(minBudgetDt.trim().replace(",", "."));
      const minMillimes =
        minBudgetDt.trim() && Number.isFinite(parsedDt) && parsedDt >= 0
          ? Math.round(parsedDt * 1000)
          : null;

      const res = await fetch("/api/pro/persona", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
          headline: headline.trim(),
          profession_preset: preset,
          bio: bio.trim(),
          location_city: locationCity.trim(),
          clinic_or_studio_address: address.trim(),
          style_rules: styleRules.trim(),
          boundaries_note: boundariesNote.trim(),
          style_samples: styleSamples.filter((s) => s.situation.trim() && s.reply.trim()),
          opportunity_goals: opportunityGoals.trim(),
          opportunity_keywords: keywordsCsv
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          min_deal_budget_millimes: minMillimes,
          auto_reply_enabled: autoReply,
          alert_whatsapp_phone: alertPhone.trim() || null,
          alert_email: alertEmail.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setFeedback({ kind: "error", text: body?.error ?? "Could not save style settings." });
        return;
      }
      invalidateDashboardUrl("/api/pro/persona");
      await onSaved();
      setFeedback({
        kind: "success",
        text: "Persona voice, boundaries, opportunity goals & alert channels saved.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E4E4E7] pb-5">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#52525B]">
            Voice Clone &amp; Guardrails
          </p>
          <h1 className="mt-1.5 text-2xl font-medium tracking-[-0.03em] text-[#09090B] sm:text-3xl">
            My Style, Boundaries &amp; Alert Routing
          </h1>
          <p className="mt-1 text-sm text-[#52525B]">
            Teach Wassalha how you talk in Tunisian Derja, French, Arabic &amp; English — and set your hard safety &amp; deal rules.
          </p>
        </div>
        <Button color="primary" size="sm" iconLeading={Save01} isDisabled={saving} onClick={() => void savePersona()}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      {feedback ? <Alert color={feedback.kind}>{feedback.text}</Alert> : null}

      {/* AI Reply Control Panel (Length, Casual Style, Emojis, Languages) */}
      <AiControlsPanel apiBase="/api/ai-controls" mode="pro" />

      {/* Live Chat + Any-Language Voice Context & Availability Updates */}
      <ContextChatPanel apiBase="/api/context" mode="pro" preset={preset} />

      {/* Identity & Location */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity &amp; Clinic / Studio Location</CardTitle>
          <CardDescription>Used in replies and automatic GPS pin delivery.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Display Name" value={displayName} onChange={setDisplayName} />
            <NativeSelect
              label="Profession Track"
              value={preset}
              onChange={(e) => setPreset(e.target.value as ProCategory)}
              options={[
                { value: "doctor", label: "Doctor / Medical Clinic" },
                { value: "cameraman", label: "Cameraman / Photographer / Media" },
                { value: "creator", label: "Public Figure / Content Creator" },
                { value: "custom", label: "Custom Service Provider" },
              ]}
            />
          </div>
          <Input label="Headline" value={headline} onChange={setHeadline} />
          <TextArea label="Bio (Derja / French / Arabic / English)" rows={3} value={bio} onChange={setBio} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="City (Tunisia)" value={locationCity} onChange={setLocationCity} />
            <Input label="Clinic / Studio Address" value={address} onChange={setAddress} />
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-[#09090B]">
            <input
              type="checkbox"
              checked={autoReply}
              onChange={(e) => setAutoReply(e.target.checked)}
              className="size-4 accent-[#1B8A5E]"
            />
            Auto-reply enabled (AI answers incoming DMs in my style unless paused per thread)
          </label>
        </CardContent>
      </Card>

      {/* Voice Samples & Rules */}
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Real DM Style Samples &amp; Rules</CardTitle>
            <CardDescription>
              Paste 2–4 messages you actually wrote in Derja or French so replies mirror your exact phrasing.
            </CardDescription>
          </div>
          <Button
            size="xs"
            color="secondary"
            iconLeading={Plus}
            onClick={() => setStyleSamples((prev) => [...prev, { situation: "", reply: "" }])}
          >
            Add Sample
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TextArea label="Voice & Dialect Rules" rows={2} value={styleRules} onChange={setStyleRules} />
          <div className="flex flex-col gap-3">
            {styleSamples.map((sample, idx) => (
              <div key={idx} className="flex flex-col gap-2.5 border border-[#E4E4E7] bg-[#FAFAF9] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] uppercase text-[#71717A]">
                    Style Sample #{idx + 1}
                  </span>
                  <Button
                    size="xs"
                    color="tertiary"
                    aria-label={`Remove sample ${idx + 1}`}
                    iconLeading={Trash01}
                    onClick={() => setStyleSamples((prev) => prev.filter((_, i) => i !== idx))}
                  />
                </div>
                <Input
                  label="Situation"
                  placeholder="e.g. Brand DM asking for a sponsored Reel rate"
                  value={sample.situation}
                  onChange={(val) =>
                    setStyleSamples((prev) =>
                      prev.map((s, i) => (i === idx ? { ...s, situation: val } : s)),
                    )
                  }
                />
                <TextArea
                  label="Reply in your voice"
                  rows={2}
                  value={sample.reply}
                  onChange={(val) =>
                    setStyleSamples((prev) =>
                      prev.map((s, i) => (i === idx ? { ...s, reply: val } : s)),
                    )
                  }
                />
              </div>
            ))}
          </div>
          <div className="border-t border-[#E4E4E7] pt-4">
            <TextArea
              label="Hard Boundaries & Safety Guardrails"
              hint={
                <span className="inline-flex items-center gap-1 text-[#15704C]">
                  <ShieldTick className="size-3.5" aria-hidden="true" />
                  Doctor tracks always enforce zero diagnosis/prescriptions and SAMU 190 emergency escalation in code.
                </span>
              }
              rows={3}
              value={boundariesNote}
              onChange={setBoundariesNote}
            />
          </div>
        </CardContent>
      </Card>

      {/* Opportunity Goals & +216 Urgent Alert Routing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Opportunity Radar &amp; Urgent +216 Alert Push</CardTitle>
          <CardDescription>
            Configure what deals Wassalha hunts for and where urgent/critical alerts are pushed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TextArea
            label="Opportunity Goals"
            rows={2}
            value={opportunityGoals}
            onChange={setOpportunityGoals}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Priority Keywords (comma-separated)"
              placeholder="sponsor, reel, ugc, drone, mariage, podcast"
              value={keywordsCsv}
              onChange={setKeywordsCsv}
            />
            <Input
              label="Minimum Deal Budget Floor (DT)"
              placeholder="800"
              value={minBudgetDt}
              onChange={setMinBudgetDt}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Urgent Alert WhatsApp (+216)"
              placeholder="+216 55 123 456"
              hint="Receives immediate WhatsApp push for critical & urgent alerts."
              value={alertPhone}
              onChange={setAlertPhone}
            />
            <Input
              label="Urgent Alert Email (optional)"
              placeholder="name@domain.tn"
              value={alertEmail}
              onChange={setAlertEmail}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
