import { expect, test } from "@playwright/test";

test.describe("Phase 6 — Dual-Track Public Site, /how-it-works, Pro Simulator & /pro/* Desk", () => {
  test("homepage switches between Shops and Creators & Pros and navigates to /how-it-works", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /wassalha/i })).toBeVisible();

    // Switch left rail to Creators & Pros
    await page.getByRole("button", { name: "Creators & Pros" }).click();
    await expect(
      page.getByRole("heading", { name: /Reply to every message/i }),
    ).toBeVisible();

    // Navigate to dedicated /how-it-works page
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "How it works" })
      .click();
    await expect(page).toHaveURL(/\/how-it-works/, { timeout: 25_000 });
    await expect(
      page.getByRole("heading", { name: /From Derja screenshot & voice note/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Toggle to Creator & Pro Mode on /how-it-works
    await page.getByRole("tab", { name: /Creator & Pro Mode/i }).click();
    await expect(
      page.getByRole("heading", { name: /From noisy DMs to scoped clients/i }),
    ).toBeVisible();
    await expect(page.getByText(/SAMU 190/i).first()).toBeVisible();
  });

  test("dual-track /demo?track=pro&preset=doctor escalates a medical emergency with SAMU 190 deterministically", async ({
    page,
  }) => {
    await page.goto("/demo?track=pro&preset=doctor");
    await expect(page.getByText("Dr. Amine Ben Amor", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Consultation au Cabinet")).toBeVisible();

    const input = page.getByPlaceholder("Message...");
    await expect(input).toBeEnabled({ timeout: 20_000 });
    await input.fill("Docteur brabi 3andi wja3 9wi fel sder w 9at3et nfas tawa!");
    await page.getByRole("button", { name: "Send" }).click();

    // Pre-model medical emergency guardrail replies immediately with SAMU 190 and pauses AI
    await expect(page.getByText(/SAMU 190/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("AI paused", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("pro.safety.medical_red_flag")).toBeVisible({ timeout: 20_000 });
  });

  test("Pro sandbox signup opens /pro Command Center and navigates across all Pro workspace pages", async ({
    page,
  }) => {
    await page.goto("/signup?mode=pro");
    await expect(page.getByRole("button", { name: "Try Pro demo" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Try Pro demo" }).click();

    await expect(page).toHaveURL(/\/pro/, { timeout: 25_000 });
    await expect(page.getByText(/What's New — Agent Briefing/i)).toBeVisible({ timeout: 20_000 });

    const subroutes: Array<{ path: string; heading: RegExp }> = [
      { path: "/pro/services", heading: /Services, Packages & Rate Floors/i },
      { path: "/pro/opportunities", heading: /Scored Deals, Bookings & Briefs/i },
      { path: "/pro/alerts", heading: /Urgent Action Queue/i },
      { path: "/pro/inquiries", heading: /Client Service Inquiries/i },
      { path: "/pro/inbox", heading: /Style-Cloned DM Conversations/i },
      { path: "/pro/persona", heading: /My Style, Boundaries & Alert Routing/i },
      { path: "/pro/channels", heading: /WhatsApp, Instagram & Messenger/i },
      { path: "/pro/settings", heading: /Creator & Pro Account/i },
    ];

    for (const route of subroutes) {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible({
        timeout: 20_000,
      });
    }
  });
});
