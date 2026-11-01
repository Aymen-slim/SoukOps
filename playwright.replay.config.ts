import { defineConfig } from "@playwright/test";

/**
 * Day 7 replay mode: the dev server runs with AI_MODE=replay, so every AI
 * call is served from .ai-cassettes/ and no provider key is needed.
 * Record first with `npm run test:e2e:record` (live providers), then this
 * suite must pass offline. Stop any running `npm run dev` first — the
 * replay server owns port 3000 so AI_MODE cannot leak from a live server.
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
    env: { AI_MODE: "replay" },
  },
});
