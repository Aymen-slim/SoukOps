"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Globe01, Stars01 } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Alert } from "@/components/foundations/alert/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import {
  ALL_BUYER_LANGUAGES,
  DEFAULT_AI_CONTROLS,
  summarizeAiControls,
  type CalendarAutoBookMode,
  type DerjaScriptPref,
  type EmojiLevel,
  type LanguageMode,
  type ReplyLength,
  type ReplyStyle,
  type WorkspaceAiControls,
  type WorkspaceAiControlsPatch,
} from "@/lib/context/ai-controls";
import type { BuyerLanguage } from "@/lib/domain/language";

const LENGTH_OPTIONS: Array<{ value: ReplyLength; label: string; hint: string }> = [
  { value: "short", label: "Short", hint: "1–2 punchy sentences" },
  { value: "medium", label: "Medium", hint: "2–3 balanced sentences" },
  { value: "long", label: "Long", hint: "4–6 detailed sentences" },
];

const STYLE_OPTIONS: Array<{ value: ReplyStyle; label: string; hint: string }> = [
  { value: "casual", label: "Casual & Friendly", hint: "Warm everyday texting, relaxed" },
  { value: "balanced", label: "Warm & Balanced", hint: "Natural, human & helpful" },
  { value: "formal", label: "Formal & Pro", hint: "Polite 'vous', respectful, no slang" },
];

const EMOJI_OPTIONS: Array<{ value: EmojiLevel; label: string }> = [
  { value: "none", label: "None" },
  { value: "light", label: "Light (0–1)" },
  { value: "expressive", label: "Expressive (2–3)" },
];

const LANGUAGE_META: Record<BuyerLanguage, { label: string; short: string }> = {
  derja: { label: "Tunisian Derja", short: "Derja" },
  fr: { label: "French", short: "French" },
  ar: { label: "Arabic", short: "Arabic" },
  en: { label: "English", short: "English" },
};

const SCRIPT_OPTIONS: Array<{ value: DerjaScriptPref; label: string; sample: string }> = [
  { value: "auto", label: "Auto", sample: "Match client" },
  { value: "latin", label: "Arabizi", sample: "3la rasi" },
  { value: "arabic", label: "Arabic script", sample: "على راسي" },
];

const AUTOBOOK_OPTIONS: Array<{ value: CalendarAutoBookMode; label: string; hint: string }> = [
  { value: "tentative", label: "Tentative", hint: "Auto-add, you confirm" },
  { value: "confirmed", label: "Auto-confirm", hint: "Confirm directly" },
  { value: "manual", label: "Manual only", hint: "AI checks busy only" },
];

export function AiControlsPanel({
  apiBase,
  mode,
  compact = false,
  onControlsChange,
}: {
  apiBase: string;
  mode: "ecommerce" | "pro";
  compact?: boolean;
  onControlsChange?: (controls: WorkspaceAiControls) => void;
}) {
  const [controls, setControls] = useState<WorkspaceAiControls>(DEFAULT_AI_CONTROLS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(apiBase);
      const body = (await res.json().catch(() => null)) as { controls?: WorkspaceAiControls; error?: string } | null;
      if (!res.ok || body?.error) {
        setError(body?.error ?? "Couldn't load AI controls.");
        return;
      }
      if (body?.controls) {
        setControls(body.controls);
        onControlsChange?.(body.controls);
      }
    } catch {
      setError("Couldn't load AI controls.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, onControlsChange]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function applyPatch(patch: WorkspaceAiControlsPatch) {
    const prev = controls;
    // Optimistic local state
    const nextPrimary = patch.primaryLanguage ?? prev.primaryLanguage;
    const rawAllowed = patch.allowedLanguages ?? prev.allowedLanguages;
    const allowedSet = new Set<BuyerLanguage>(rawAllowed);
    allowedSet.add(nextPrimary);
    const optimistic: WorkspaceAiControls = {
      ...prev,
      ...patch,
      primaryLanguage: nextPrimary,
      allowedLanguages: ALL_BUYER_LANGUAGES.filter((l) => allowedSet.has(l)),
    };

    setControls(optimistic);
    onControlsChange?.(optimistic);
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = (await res.json().catch(() => null)) as { controls?: WorkspaceAiControls; error?: string } | null;
      if (!res.ok || !body?.controls) {
        setControls(prev);
        onControlsChange?.(prev);
        setError(body?.error ?? "Couldn't save AI controls.");
        return;
      }
      setControls(body.controls);
      onControlsChange?.(body.controls);
      setSavedAt(Date.now());
    } catch {
      setControls(prev);
      onControlsChange?.(prev);
      setError("Couldn't save AI controls.");
    } finally {
      setSaving(false);
    }
  }

  function toggleAllowedLanguage(lang: BuyerLanguage) {
    if (lang === controls.primaryLanguage) return; // Primary is always enabled
    const has = controls.allowedLanguages.includes(lang);
    const next = has
      ? controls.allowedLanguages.filter((l) => l !== lang)
      : [...controls.allowedLanguages, lang];
    if (next.length === 0) return;
    void applyPatch({ allowedLanguages: next });
  }

  const showDerjaScript =
    controls.primaryLanguage === "derja" ||
    (controls.languageMode === "auto" && controls.allowedLanguages.includes("derja"));

  const inner = (
    <div className="flex flex-col gap-4">
      {/* Live Active Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-secondary bg-tertiary/45 px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-primary">
          <Stars01 className="size-3.5 text-brand-secondary" aria-hidden="true" />
          <span className="font-mono text-[11px]">{summarizeAiControls(controls)}</span>
        </span>
        <span className="font-mono text-[10.5px] text-tertiary">
          {loading ? "Loading…" : saving ? "Saving…" : savedAt ? "✓ Saved · applies next reply" : "0 AI calls on change"}
        </span>
      </div>

      {error ? <Alert color="error">{error}</Alert> : null}

      {/* 1. Message Length */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide text-primary uppercase">Message Length</span>
          <span className="text-[11px] text-tertiary">Controls Gemini reply pacing &amp; length</span>
        </div>
        <div
          role="radiogroup"
          aria-label="Message length"
          className="grid grid-cols-3 gap-2"
        >
          {LENGTH_OPTIONS.map((opt) => {
            const active = controls.replyLength === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={loading}
                onClick={() => void applyPatch({ replyLength: opt.value })}
                className={`cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  active
                    ? "border-[#1B8A5E] bg-[#F2FBF7] text-[#09090B]"
                    : "border-secondary bg-white text-secondary hover:bg-secondary/40"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-primary">{opt.label}</span>
                  {active ? <Check className="size-3.5 text-[#1B8A5E]" aria-hidden="true" /> : null}
                </div>
                {!compact ? <p className="mt-0.5 text-[11px] text-tertiary">{opt.hint}</p> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Casual Style & Emojis */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide text-primary uppercase">Casual Style &amp; Vibe</span>
          <span className="text-[11px] text-tertiary">Register across Derja, FR, AR &amp; EN</span>
        </div>
        <div
          role="radiogroup"
          aria-label="Conversational style"
          className={`grid gap-2 ${compact ? "grid-cols-1" : "sm:grid-cols-3"}`}
        >
          {STYLE_OPTIONS.map((opt) => {
            const active = controls.replyStyle === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={loading}
                onClick={() => void applyPatch({ replyStyle: opt.value })}
                className={`cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  active
                    ? "border-[#1B8A5E] bg-[#F2FBF7] text-[#09090B]"
                    : "border-secondary bg-white text-secondary hover:bg-secondary/40"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-primary">{opt.label}</span>
                  {active ? <Check className="size-3.5 text-[#1B8A5E]" aria-hidden="true" /> : null}
                </div>
                <p className="mt-0.5 text-[11px] text-tertiary">{opt.hint}</p>
              </button>
            );
          })}
        </div>

        {/* Emoji Intensity */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-secondary bg-[#FAFAF9] px-3 py-2">
          <span className="text-xs font-medium text-primary">Emojis</span>
          <div role="radiogroup" aria-label="Emoji level" className="inline-flex gap-1">
            {EMOJI_OPTIONS.map((opt) => {
              const active = controls.emojiLevel === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={loading}
                  onClick={() => void applyPatch({ emojiLevel: opt.value })}
                  className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-[#1D1E1A] text-white"
                      : "bg-white text-secondary ring-1 ring-secondary hover:text-primary"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Language Controls */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-secondary bg-[#FAFAF9] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
            <Globe01 className="size-3.5 text-brand-secondary" aria-hidden="true" />
            Languages
          </span>
          <div role="radiogroup" aria-label="Language mode" className="inline-flex rounded-lg border border-secondary bg-white p-0.5">
            {(
              [
                { value: "auto", label: "Auto-match client" },
                { value: "fixed", label: "Always primary" },
              ] as Array<{ value: LanguageMode; label: string }>
            ).map((opt) => {
              const active = controls.languageMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={loading}
                  onClick={() => void applyPatch({ languageMode: opt.value })}
                  className={`cursor-pointer rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                    active ? "bg-[#1D1E1A] text-white" : "text-tertiary hover:text-primary"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary / Fallback Language */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-tertiary">
            {controls.languageMode === "fixed"
              ? "Reply language (locked for all clients)"
              : "Primary / fallback language (when unclear or outside allowed list)"}
          </span>
          <div role="radiogroup" aria-label="Primary language" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {ALL_BUYER_LANGUAGES.map((lang) => {
              const active = controls.primaryLanguage === lang;
              return (
                <button
                  key={lang}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={loading}
                  onClick={() => void applyPatch({ primaryLanguage: lang })}
                  className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-[#1B8A5E] bg-[#F2FBF7] text-[#15704C]"
                      : "border-secondary bg-white text-secondary hover:bg-secondary/30"
                  }`}
                >
                  {LANGUAGE_META[lang].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Allowed Languages (in Auto-match mode) */}
        {controls.languageMode === "auto" ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-tertiary">
              Allowed languages to auto-mirror (primary stays pinned)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {ALL_BUYER_LANGUAGES.map((lang) => {
                const enabled = controls.allowedLanguages.includes(lang);
                const isPrimary = controls.primaryLanguage === lang;
                return (
                  <button
                    key={lang}
                    type="button"
                    aria-pressed={enabled}
                    disabled={loading || isPrimary}
                    onClick={() => toggleAllowedLanguage(lang)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      enabled
                        ? "border-[#1B8A5E]/50 bg-[#F2FBF7] text-[#15704C]"
                        : "border-secondary bg-white text-tertiary hover:text-primary"
                    } ${isPrimary ? "cursor-default" : "cursor-pointer"}`}
                  >
                    {enabled ? <Check className="size-3" aria-hidden="true" /> : null}
                    {LANGUAGE_META[lang].short}
                    {isPrimary ? <span className="font-mono text-[9.5px] uppercase opacity-75">Primary</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Tunisian Derja Script Preference */}
        {showDerjaScript ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-secondary/80 pt-2.5">
            <span className="text-[11.5px] font-medium text-primary">Tunisian Derja script</span>
            <div role="radiogroup" aria-label="Derja script" className="inline-flex flex-wrap gap-1">
              {SCRIPT_OPTIONS.map((opt) => {
                const active = controls.derjaScript === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={loading}
                    onClick={() => void applyPatch({ derjaScript: opt.value })}
                    className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                      active
                        ? "bg-[#1D1E1A] text-white"
                        : "bg-white text-secondary ring-1 ring-secondary hover:text-primary"
                    }`}
                  >
                    {opt.label}{!compact ? ` (${opt.sample})` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* 4. DM Calendar Auto-Booking Mode (Pro & E-Commerce) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide text-primary uppercase">
            DM Calendar Booking
          </span>
          <span className="text-[11px] text-tertiary">
            {mode === "pro" ? "When a client completes booking info" : "Calendar slot handling"}
          </span>
        </div>
        <div role="radiogroup" aria-label="Calendar auto-booking mode" className="grid grid-cols-3 gap-2">
          {AUTOBOOK_OPTIONS.map((opt) => {
            const active = controls.calendarAutoBook === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={loading}
                onClick={() => void applyPatch({ calendarAutoBook: opt.value })}
                className={`cursor-pointer rounded-xl border px-2.5 py-2 text-left transition-colors ${
                  active
                    ? "border-[#1B8A5E] bg-[#F2FBF7] text-[#09090B]"
                    : "border-secondary bg-white text-secondary hover:bg-secondary/40"
                }`}
              >
                <span className="text-xs font-semibold text-primary">{opt.label}</span>
                {!compact ? <p className="mt-0.5 text-[10.5px] text-tertiary">{opt.hint}</p> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (compact) return inner;

  return (
    <Card>
      <CardHeader className="border-b border-[#E4E4E7]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">AI Reply Control Panel</CardTitle>
            <CardDescription>
              Tune message length, casual vs formal style, emojis, and language rules in 1 click — applied live with 0 extra AI cost.
            </CardDescription>
          </div>
          <Badge color="brand" size="sm" className="font-mono text-[10px] uppercase">
            Live Controls
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4">{inner}</CardContent>
    </Card>
  );
}
