import type { BuyerLanguage } from "@/lib/domain/language";
import { getServerEnv } from "@/lib/env";
import { basetenConfigured } from "./baseten";
import { metaConfigured } from "./meta";
import { anthropicConfigured } from "./providers/anthropic";
import { geminiConfigured } from "./providers/gemini";
import { openaiConfigured } from "./providers/openai";
import type { AiProvider } from "./trace";

export type AiTaskTier = "fast_multimodal" | "reasoning" | "style_writer";

export interface ResolvedModelRoute {
  provider: Extract<AiProvider, "gemini" | "openai" | "anthropic" | "meta" | "baseten">;
  model: string;
  reasoningEffort: "low" | "medium" | "high";
}

type LlmProviderName = ResolvedModelRoute["provider"];

function isConfigured(provider: LlmProviderName): boolean {
  switch (provider) {
    case "gemini":
      return geminiConfigured();
    case "openai":
      return openaiConfigured();
    case "anthropic":
      return anthropicConfigured();
    case "meta":
      return metaConfigured();
    case "baseten":
      return basetenConfigured();
  }
}

function modelFor(provider: LlmProviderName, tier: AiTaskTier): string {
  const env = getServerEnv();
  switch (provider) {
    case "gemini":
      return tier === "reasoning" ? env.GEMINI_REASONING_MODEL : env.GEMINI_FAST_MODEL;
    case "openai":
      return tier === "reasoning" ? env.OPENAI_REASONING_MODEL : env.OPENAI_FAST_MODEL;
    case "anthropic":
      return tier === "reasoning" ? env.ANTHROPIC_REASONING_MODEL : env.ANTHROPIC_STYLE_MODEL;
    case "meta":
      return env.META_SPARK_MODEL;
    case "baseten":
      return env.BASETEN_SPARK_OPEN_MODEL;
  }
}

function effortFor(tier: AiTaskTier): "low" | "medium" | "high" {
  if (tier === "reasoning") return "high";
  if (tier === "style_writer") return "medium";
  return "low";
}

function priorityOrder(tier: AiTaskTier, languageHint?: BuyerLanguage): LlmProviderName[] {
  if (tier === "style_writer") {
    // Google Gemini is the primary provider across all languages & dialects.
    // Formal French/English keeps Anthropic as the first fallback after Gemini.
    if (languageHint === "fr" || languageHint === "en") {
      return ["gemini", "anthropic", "openai", "meta", "baseten"];
    }
    return ["gemini", "openai", "anthropic", "meta", "baseten"];
  }
  if (tier === "reasoning") {
    return ["gemini", "openai", "anthropic", "meta", "baseten"];
  }
  return ["gemini", "openai", "anthropic", "meta", "baseten"];
}

/**
 * Returns the ordered list of configured LLM routes for a task tier.
 * Explicit env overrides (`FAST_LLM_PROVIDER`, `REASONING_LLM_PROVIDER`,
 * `STYLE_LLM_PROVIDER`, or legacy `LLM_PROVIDER`) take precedence at index 0.
 */
export function resolveAiRoutes(
  tier: AiTaskTier = "fast_multimodal",
  opts?: { languageHint?: BuyerLanguage },
): ResolvedModelRoute[] {
  const env = getServerEnv();
  const explicitRaw =
    tier === "reasoning"
      ? env.REASONING_LLM_PROVIDER
      : tier === "style_writer"
        ? env.STYLE_LLM_PROVIDER
        : env.FAST_LLM_PROVIDER;
  const explicit: LlmProviderName | null =
    explicitRaw !== "auto"
      ? explicitRaw
      : env.LLM_PROVIDER !== "auto"
        ? env.LLM_PROVIDER
        : null;

  const baseOrder = priorityOrder(tier, opts?.languageHint);
  const configured = baseOrder.filter(isConfigured);

  const ordered: LlmProviderName[] = [];
  if (explicit) ordered.push(explicit);
  for (const p of configured) {
    if (!ordered.includes(p)) ordered.push(p);
  }
  if (ordered.length === 0) {
    // Offline/replay/keyless fallback: default to Gemini unless an explicit provider was set.
    ordered.push(explicit ?? "gemini");
  }

  const reasoningEffort = effortFor(tier);
  return ordered.map((provider) => ({
    provider,
    model: modelFor(provider, tier),
    reasoningEffort,
  }));
}

export function resolveAiRoute(
  tier: AiTaskTier = "fast_multimodal",
  opts?: { languageHint?: BuyerLanguage },
): ResolvedModelRoute {
  return resolveAiRoutes(tier, opts)[0]!;
}
