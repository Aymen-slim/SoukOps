import { describe, expect, it } from "vitest";
import { resolveWorkspaceRedirect, workspaceHomePath } from "@/lib/auth/workspace-routing";
import { mapMerchant } from "@/lib/dashboard/merchant";
import { getProPreset, PRO_PRESETS } from "@/lib/pro/presets";
import { PRO_CATEGORIES } from "@/lib/pro/types";

describe("Dual-track workspace routing & isolation", () => {
  it("redirects pro users away from /dashboard/* and ecommerce users away from /pro/*", () => {
    expect(resolveWorkspaceRedirect("/dashboard", "pro")).toBe("/pro");
    expect(resolveWorkspaceRedirect("/dashboard/orders", "pro")).toBe("/pro");
    expect(resolveWorkspaceRedirect("/pro", "pro")).toBeNull();
    expect(resolveWorkspaceRedirect("/pro/alerts", "pro")).toBeNull();

    expect(resolveWorkspaceRedirect("/pro", "ecommerce")).toBe("/dashboard");
    expect(resolveWorkspaceRedirect("/pro/opportunities", "ecommerce")).toBe("/dashboard");
    expect(resolveWorkspaceRedirect("/dashboard", "ecommerce")).toBeNull();
    expect(resolveWorkspaceRedirect("/dashboard/catalog", "ecommerce")).toBeNull();

    // Public routes and unset cookies never force redirects.
    expect(resolveWorkspaceRedirect("/demo", "pro")).toBeNull();
    expect(resolveWorkspaceRedirect("/dashboard", undefined)).toBeNull();
    expect(workspaceHomePath("pro")).toBe("/pro");
    expect(workspaceHomePath("ecommerce")).toBe("/dashboard");
  });

  it("maps merchant rows with backward-compatible ecommerce defaults", () => {
    const legacy = mapMerchant({ id: "m1", name: "Old Shop", courier_mode: "mock_api" });
    expect(legacy.workspace_mode).toBe("ecommerce");
    expect(legacy.pro_category).toBeNull();

    const doctor = mapMerchant({
      id: "m2",
      name: "Dr. Amine",
      workspace_mode: "pro",
      pro_category: "doctor",
    });
    expect(doctor.workspace_mode).toBe("pro");
    expect(doctor.pro_category).toBe("doctor");
  });
});

describe("Tunisia-first Creator & Professional presets", () => {
  it("ships valid services, floor prices, opportunities, alerts, and briefings for all 4 presets", () => {
    for (const category of PRO_CATEGORIES) {
      const pack = PRO_PRESETS[category];
      expect(pack.id).toBe(category);
      expect(pack.services.length).toBeGreaterThan(0);
      expect(pack.sampleOpportunities.length).toBeGreaterThan(0);
      expect(pack.welcomeBriefing.highlights.length).toBeGreaterThan(0);

      for (const service of pack.services) {
        if (service.price_millimes !== null && service.floor_millimes !== null) {
          expect(Number.isInteger(service.price_millimes)).toBe(true);
          expect(Number.isInteger(service.floor_millimes)).toBe(true);
          expect(service.floor_millimes).toBeLessThanOrEqual(service.price_millimes);
        }
      }
    }
  });

  it("enforces SAMU 190 emergency safety guardrail on Doctor preset and falls back to custom", () => {
    const doctor = getProPreset("doctor");
    expect(doctor.boundariesNote).toMatch(/190/);
    expect(doctor.boundariesNote).toMatch(/never diagnose/i);
    expect(getProPreset("unknown").id).toBe("custom");
  });
});
