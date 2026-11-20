import { defineConfig } from "@playwright/test";

/**
 * Day 7 replay mode: the dev server runs with AI_MODE=replay, so every AI
 * call is served from .ai-cassettes/ and no provider key is needed.
 * Legacy Meta/PE switches are pinned here so recorded Meta cassettes stay valid
 * even when production keys (Gemini/ElevenLabs/OpenAI/Anthropic) exist in .env.local.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: process.env.APP_BASE_URL ?? "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AI_MODE: "replay",
      FAST_LLM_PROVIDER: "meta",
      REASONING_LLM_PROVIDER: "meta",
      STYLE_LLM_PROVIDER: "meta",
      LLM_PROVIDER: "meta",
      ASR_PROVIDER: "transcribe",
      EMBED_PROVIDER: "pe",
      IMAGE_PROVIDER: "meta",
      VISION_SEGMENT_MODE: "always",
    },
  },
});
