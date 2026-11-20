import { beforeEach, describe, expect, it, vi } from "vitest";

const { sparkTextMock, sparkJsonMock } = vi.hoisted(() => ({
  sparkTextMock: vi.fn(),
  sparkJsonMock: vi.fn(),
}));

vi.mock("@/lib/ai/spark", () => ({
  sparkText: sparkTextMock,
  sparkJson: sparkJsonMock,
  aiText: sparkTextMock,
  aiJson: sparkJsonMock,
}));

import {
  buildAiControlPromptDirectives,
  DEFAULT_AI_CONTROLS,
  loadWorkspaceAiControls,
  maxReplyCharsForLength,
  normalizeWorkspaceAiControls,
  resolveControlledReplyLanguage,
  saveWorkspaceAiControls,
  summarizeAiControls,
  type WorkspaceAiControls,
} from "@/lib/context/ai-controls";
import { phraseSellerReply, validateSellerCandidateReply } from "@/lib/pipeline/phrasing";
import { bindBuyerLanguage, bindBuyerScript, bindSellerVoice, clearSellerVoice, effectiveReplyLanguage, effectiveReplyScript } from "@/lib/pipeline/seller-voice";
import { understandAndReply } from "@/lib/pipeline/understand";
import { getProPreset } from "@/lib/pro/presets";
import { buildProStyleSystemPrompt } from "@/lib/pro/style-prompt";
import { validateProCandidateReply } from "@/lib/pro/turn";
import type { ProProfileRow } from "@/lib/pro/types";

beforeEach(() => {
  sparkTextMock.mockReset();
  sparkJsonMock.mockReset();
});

describe("Workspace AI Controls — Normalization, Language Resolution & Directives", () => {
  it("normalizes untrusted input safely and always keeps primaryLanguage inside allowedLanguages", () => {
    const normalized = normalizeWorkspaceAiControls({
      replyLength: "long",
      replyStyle: "formal",
      emojiLevel: "none",
      languageMode: "auto",
      primaryLanguage: "fr",
      allowedLanguages: ["en"], // missing primary "fr"
      derjaScript: "arabic",
      calendarAutoBook: "confirmed",
    });

    expect(normalized.replyLength).toBe("long");
    expect(normalized.replyStyle).toBe("formal");
    expect(normalized.emojiLevel).toBe("none");
    expect(normalized.primaryLanguage).toBe("fr");
    expect(normalized.allowedLanguages).toEqual(["fr", "en"]);
    expect(normalized.derjaScript).toBe("arabic");
    expect(normalized.calendarAutoBook).toBe("confirmed");
  });

  it("resolves languages across fixed lock, allowed subset auto-match, and Derja script override", () => {
    const lockedFrench: WorkspaceAiControls = {
      ...DEFAULT_AI_CONTROLS,
      languageMode: "fixed",
      primaryLanguage: "fr",
    };
    expect(
      resolveControlledReplyLanguage({
        controls: lockedFrench,
        detectedLanguage: "derja",
        detectedScript: "arabic",
      }),
    ).toEqual({ language: "fr", script: "latin" });

    const derjaAndFrenchOnly: WorkspaceAiControls = {
      ...DEFAULT_AI_CONTROLS,
      languageMode: "auto",
      primaryLanguage: "derja",
      allowedLanguages: ["derja", "fr"],
      derjaScript: "arabic",
    };
    // English is disabled -> falls back to primary Derja in forced Arabic script
    expect(
      resolveControlledReplyLanguage({
        controls: derjaAndFrenchOnly,
        detectedLanguage: "en",
        detectedScript: "latin",
      }),
    ).toEqual({ language: "derja", script: "arabic" });

    // French is enabled -> mirrors French
    expect(
      resolveControlledReplyLanguage({
        controls: derjaAndFrenchOnly,
        detectedLanguage: "fr",
        detectedScript: "latin",
      }),
    ).toEqual({ language: "fr", script: "latin" });

    // Derja input written in Latin Arabizi -> still respects owner's forced Arabic script
    expect(
      resolveControlledReplyLanguage({
        controls: derjaAndFrenchOnly,
        detectedLanguage: "derja",
        detectedScript: "latin",
      }),
    ).toEqual({ language: "derja", script: "arabic" });
  });

  it("enforces seller-voice language lock and Derja script binding per conversation", () => {
    const convId = "conv-voice-lock";
    bindSellerVoice(convId, {
      language: "en",
      instructions: "",
      controls: {
        ...DEFAULT_AI_CONTROLS,
        languageMode: "fixed",
        primaryLanguage: "en",
      },
    });
    bindBuyerLanguage(convId, "derja");
    bindBuyerScript(convId, "arabic");

    expect(effectiveReplyLanguage(convId)).toBe("en");
    expect(effectiveReplyScript(convId)).toBe("latin");
    clearSellerVoice(convId);
  });

  it("scales validator max length dynamically for short, medium, and long replies", () => {
    expect(maxReplyCharsForLength("short", "ecommerce")).toBe(450);
    expect(maxReplyCharsForLength("medium", "ecommerce")).toBe(750);
    expect(maxReplyCharsForLength("long", "ecommerce")).toBe(1500);
    expect(maxReplyCharsForLength("long", "pro")).toBe(1600);

    const longBody = "Ahla bik! ".repeat(110).trim(); // ~1100 chars, zero prices
    const shortControls: WorkspaceAiControls = { ...DEFAULT_AI_CONTROLS, replyLength: "short" };
    const longControls: WorkspaceAiControls = { ...DEFAULT_AI_CONTROLS, replyLength: "long" };

    expect(
      validateSellerCandidateReply(longBody, {
        situation: "general_qa",
        buyerText: "chnowa 3andkom?",
        nextAction: "need_product",
        controls: shortControls,
        fallbackText: "fallback",
      }),
    ).toBeNull();

    expect(
      validateSellerCandidateReply(longBody, {
        situation: "general_qa",
        buyerText: "chnowa 3andkom?",
        nextAction: "need_product",
        controls: longControls,
        fallbackText: "fallback",
      }),
    ).toBe(longBody);

    const preset = getProPreset("doctor");
    const profile: ProProfileRow = {
      merchant_id: "m1",
      display_name: preset.defaultDisplayName,
      headline: preset.headline,
      profession_preset: "doctor",
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
      min_deal_budget_millimes: null,
      auto_reply_enabled: true,
      alert_whatsapp_phone: null,
      alert_email: null,
    };

    expect(
      validateProCandidateReply(longBody, {
        profile,
        service: null,
        rateDecision: {
          action: "quote_standard",
          quotedMillimes: null,
          listMillimes: null,
          floorMillimes: null,
          acceptedClientBudget: false,
          belowFloor: false,
        },
        intake: { complete: false, missingFields: ["clientName"] },
        slots: {},
        language: "derja",
        script: "latin",
        clientText: "ahla",
        isFanMessage: false,
        askedLocation: false,
        controls: longControls,
      }),
    ).toBe(longBody);
  });

  it("injects length, casual/formal style, and emoji directives into E-Commerce and Pro prompts", async () => {
    const controls: WorkspaceAiControls = {
      ...DEFAULT_AI_CONTROLS,
      replyLength: "long",
      replyStyle: "formal",
      emojiLevel: "none",
      languageMode: "fixed",
      primaryLanguage: "fr",
    };

    const directives = buildAiControlPromptDirectives(controls, "fr");
    expect(directives).toContain("MESSAGE LENGTH — LONG");
    expect(directives).toContain("FORMAL & PROFESSIONAL");
    expect(directives).toContain("formal 'vous'");
    expect(directives).toContain("Do NOT include any emojis");
    expect(summarizeAiControls(controls)).toContain("Long · Formal · No emojis · Always FR");

    sparkTextMock.mockResolvedValue("Bonjour, nous livrons partout en Tunisie sous 24 à 48 heures.");
    const phrased = await phraseSellerReply({
      situation: "delivery_policy",
      buyerText: "Livraison disponible?",
      nextAction: "need_product",
      controls,
      fallbackText: "fallback",
    });
    expect(phrased.source).toBe("spark");
    const sysPrompt = (sparkTextMock.mock.calls[0]![0] as { system: string }).system;
    expect(sysPrompt).toContain("MESSAGE LENGTH — LONG");
    expect(sysPrompt).toContain("FORMAL & PROFESSIONAL");
    expect(sysPrompt).toContain("Do NOT include any emojis");

    sparkJsonMock.mockResolvedValue({
      primaryIntent: "ask_delivery",
      change: null,
      samNounPhrase: null,
      productDescriptionEn: null,
      spatialHint: null,
      size: null,
      color: null,
      quantity: null,
      customerName: null,
      phone: null,
      governorate: null,
      delegation: null,
      landmarks: [],
      floor: null,
      driverNote: null,
      discountAskPercent: null,
      counterOfferMillimes: null,
      flags: { offTopic: false, insult: false, wantsHuman: false },
      matchedCatalogProductName: null,
      replyText: "Bonjour, nous livrons dans tous les gouvernorats.",
    });

    await understandAndReply({
      text: "Livraison?",
      language: "fr",
      script: "latin",
      controls,
    });
    const unifiedSys = (sparkJsonMock.mock.calls[0]![0] as { system: string }).system;
    expect(unifiedSys).toContain("MESSAGE LENGTH — LONG");
    expect(unifiedSys).toContain("FORMAL & PROFESSIONAL");

    const preset = getProPreset("creator");
    const proPrompt = buildProStyleSystemPrompt({
      profile: {
        merchant_id: "m1",
        display_name: preset.defaultDisplayName,
        headline: preset.headline,
        profession_preset: "creator",
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
        min_deal_budget_millimes: 800_000,
        auto_reply_enabled: true,
        alert_whatsapp_phone: null,
        alert_email: null,
      },
      language: "derja",
      script: "latin",
      allowedMillimes: [800_000],
      controls: { ...DEFAULT_AI_CONTROLS, replyLength: "short", replyStyle: "casual", emojiLevel: "expressive" },
    });
    expect(proPrompt).toContain("MESSAGE LENGTH — SHORT");
    expect(proPrompt).toContain("CASUAL & FRIENDLY");
    expect(proPrompt).toContain("2 to 3 warm, fitting emojis");
  });

  it("falls back cleanly to ai_cache when merchants.ai_controls column is not migrated yet", async () => {
    const cacheStore = new Map<string, unknown>();
    const supabaseStub = {
      from: vi.fn((table: string) => {
        if (table === "merchants") {
          return {
            select: vi.fn((cols: string) => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue(
                  cols.includes("ai_controls")
                    ? { data: null, error: { code: "42703", message: 'column merchants.ai_controls does not exist' } }
                    : { data: { reply_language: "derja" }, error: null },
                ),
              })),
            })),
            update: vi.fn((patch: Record<string, unknown>) => ({
              eq: vi.fn().mockResolvedValue(
                "ai_controls" in patch
                  ? { error: { code: "42703", message: 'column merchants.ai_controls does not exist' } }
                  : { error: null },
              ),
            })),
          };
        }
        if (table === "ai_cache") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((_col: string, key: string) => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: cacheStore.has(key) ? { value: cacheStore.get(key) } : null,
                  error: null,
                }),
              })),
            })),
            upsert: vi.fn((row: { key: string; value: unknown }) => {
              cacheStore.set(row.key, row.value);
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {};
      }),
    };

    const saved = await saveWorkspaceAiControls(supabaseStub as never, "m-fallback", {
      replyLength: "short",
      replyStyle: "casual",
      languageMode: "fixed",
      primaryLanguage: "fr",
    });
    expect(saved.replyLength).toBe("short");
    expect(saved.primaryLanguage).toBe("fr");

    const loaded = await loadWorkspaceAiControls(supabaseStub as never, "m-fallback");
    expect(loaded.replyLength).toBe("short");
    expect(loaded.replyStyle).toBe("casual");
    expect(loaded.languageMode).toBe("fixed");
    expect(loaded.primaryLanguage).toBe("fr");
  });
});
