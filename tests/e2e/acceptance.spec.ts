import { expect, test } from "@playwright/test";

test("home page loads with Day 1 status", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /wassalha/i })).toBeVisible();
});

// Day 2: simulator shell + text round trip. The 5 acceptance tests
// (docs/SPEC.md) run in replay mode from Day 7.
test("simulator sends a buyer text message", async ({ page }) => {
  await page.goto("/simulator");
  await expect(page.getByText("Boutique démo", { exact: true })).toBeVisible();
  const input = page.getByPlaceholder("Message...");
  await input.fill("Merhba, b9addech el hoodie el noir?");
  await page.getByRole("button", { name: "➤" }).click();
  await expect(page.getByText("b9addech el hoodie")).toBeVisible({ timeout: 15_000 });
});
