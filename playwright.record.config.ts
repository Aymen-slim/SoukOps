import { defineConfig } from "@playwright/test";

/**
 * Records cassettes for replay mode: live providers, AI_MODE=record.
 * Run once on the demo machine whenever the demo script or catalog changes,
 * then verify with `npm run test:e2e:replay`.
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
    env: { AI_MODE: "record" },
  },
});
