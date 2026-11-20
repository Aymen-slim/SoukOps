import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAiRoute, resolveAiRoutes } from "@/lib/ai/router";
import { ACTIVE_MARKET, getMarketConfig, isLanguageEnabled } from "@/lib/domain/locale";
import { resetEnvCache } from "@/lib/env";

const OLD_ENV = { ...process.env };

function setEnv(overrides: Record<string, string | undefined>) {
  for (const key of [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "MODEL_API_KEY",
    "BASETEN_API_KEY",
    "FAST_LLM_PROVIDER",
    "REASONING_LLM_PROVIDER",
    "STYLE_LLM_PROVIDER",
    "LLM_PROVIDER",
    "VISION_SEGMENT_MODE",
  ]) {
    delete process.env[key];
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) process.env[k] = v;
  }
  resetEnvCache();
}

afterEach(() => {
  process.env = { ...OLD_ENV };
  resetEnvCache();
  vi.restoreAllMocks();
});

describe("Tunisia-first locale spine", () => {
  it("defaults to Tunisia with Derja, French, Arabic, and English enabled", () => {
    expect(ACTIVE_MARKET.code).toBe("tn");
    expect(ACTIVE_MARKET.currencyCode).toBe("TND");
    expect(ACTIVE_MARKET.phoneCountryPrefix).toBe("+216");
    expect(ACTIVE_MARKET.emergencyNumber).toBe("190");
    expect(getMarketConfig("unknown").code).toBe("tn");
    expect(isLanguageEnabled("derja")).toBe(true);
    expect(isLanguageEnabled("fr")).toBe(true);
    expect(isLanguageEnabled("es")).toBe(false);
  });
});

describe("Task-routed AI orchestrator", () => {
  it("routes fast_multimodal to Gemini 3.8 Flash and reasoning to Gemini 4 Argon when configured", () => {
    setEnv({
      GEMINI_API_KEY: "test-gemini",
      OPENAI_API_KEY: "test-openai",
      ANTHROPIC_API_KEY: "test-anthropic",
      MODEL_API_KEY: "test-meta",
    });
    const fast = resolveAiRoute("fast_multimodal");
    const reasoning = resolveAiRoute("reasoning");
    expect(fast).toEqual({ provider: "gemini", model: "gemini-3.8-flash", reasoningEffort: "low" });
    expect(reasoning).toEqual({ provider: "gemini", model: "gemini-4-argon", reasoningEffort: "high" });
  });

  it("prefers Gemini as #1 across all style_writer languages with Anthropic as fallback for French/English", () => {
    setEnv({
      GEMINI_API_KEY: "test-gemini",
      ANTHROPIC_API_KEY: "test-anthropic",
    });
    expect(resolveAiRoute("style_writer", { languageHint: "derja" }).provider).toBe("gemini");
    expect(resolveAiRoute("style_writer", { languageHint: "ar" }).provider).toBe("gemini");
    const frRoutes = resolveAiRoutes("style_writer", { languageHint: "fr" });
    expect(frRoutes[0]).toMatchObject({
      provider: "gemini",
      model: "gemini-3.8-flash",
      reasoningEffort: "medium",
    });
    expect(frRoutes[1]).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
    });
    expect(resolveAiRoute("style_writer", { languageHint: "en" }).provider).toBe("gemini");
  });

  it("honors explicit provider overrides and maintains fallback chain order", () => {
    setEnv({
      GEMINI_API_KEY: "test-gemini",
      OPENAI_API_KEY: "test-openai",
      MODEL_API_KEY: "test-meta",
      FAST_LLM_PROVIDER: "meta",
    });
    const routes = resolveAiRoutes("fast_multimodal");
    expect(routes[0]).toMatchObject({ provider: "meta", model: "muse-spark-1.3" });
    expect(routes.map((r) => r.provider)).toEqual(["meta", "gemini", "openai"]);
  });

  it("falls back to gemini cleanly when no keys are configured", () => {
    setEnv({});
    expect(resolveAiRoute("fast_multimodal")).toMatchObject({ provider: "gemini", model: "gemini-3.8-flash" });
  });
});
