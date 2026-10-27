import { expect, test } from "@playwright/test";

// Day 1: app-shell smoke only. The 5 acceptance tests (docs/SPEC.md) run in
// replay mode from Day 7; each day adds its test here as its feature lands.
test("home page loads with Day 1 status", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /wassalha/i })).toBeVisible();
});
