import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sparkJsonMock, embedConfiguredMock, embedTextsMock, resolveWhatsAppConfigMock } =
  vi.hoisted(() => ({
    sparkJsonMock: vi.fn(),
    embedConfiguredMock: vi.fn(() => false),
    embedTextsMock: vi.fn(),
    resolveWhatsAppConfigMock: vi.fn(),
  }));

vi.mock("@/lib/ai/spark", () => ({
  sparkJson: sparkJsonMock,
  aiJson: sparkJsonMock,
  sparkText: vi.fn(),
  aiText: vi.fn(),
}));

vi.mock("@/lib/ai/embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/embeddings")>();
  return {
    ...actual,
    embedConfigured: embedConfiguredMock,
    embedTexts: embedTextsMock,
  };
});

vi.mock("@/lib/channels/whatsapp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/channels/whatsapp")>();
  return {
    ...actual,
    resolveWhatsAppConfig: resolveWhatsAppConfigMock,
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
  hasAdminConfig: () => false,
}));

import { resetEnvCache } from "@/lib/env";
import { buildFallbackBriefing, generateProBriefing } from "@/lib/pro/briefing";
import {
  createProAlert,
  dispatchProAlertNotifications,
  formatAlertWhatsAppText,
  shouldPushExternalAlert,
} from "@/lib/pro/notify";
import {
  evaluateOpportunityFit,
  ingestAndScoreOpportunity,
  scanMerchantOpportunities,
  scoreOpportunityDeterministic,
  shouldAlertForOpportunity,
} from "@/lib/pro/opportunities";
import { getProPreset } from "@/lib/pro/presets";
import type { ProCategory, ProProfileRow } from "@/lib/pro/types";

const OLD_ENV = { ...process.env };

function makeProfile(category: ProCategory, merchantId = "m-pro-4"): ProProfileRow {
  const preset = getProPreset(category);
  return {
    merchant_id: merchantId,
    display_name: preset.defaultDisplayName,
    headline: preset.headline,
    profession_preset: preset.id,
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
    min_deal_budget_millimes: preset.minDealBudgetMillimes,
    auto_reply_enabled: true,
    alert_whatsapp_phone: "+21655111222",
    alert_email: "ines@creator.tn",
  };
}

interface MockProDb {
  profile: ProProfileRow;
  existingMatches: Array<Record<string, unknown>>;
  boardOpportunities: Array<Record<string, unknown>>;
  conversations: Array<Record<string, unknown>>;
  inboundMessages: Array<Record<string, unknown>>;
  outboundMessages: Array<Record<string, unknown>>;
  inquiries: Array<Record<string, unknown>>;
  alerts: Array<Record<string, unknown>>;
  insertedOpportunities: Array<Record<string, unknown>>;
  upsertedMatches: Array<Record<string, unknown>>;
  insertedAlerts: Array<Record<string, unknown>>;
  updatedAlerts: Array<Record<string, unknown>>;
  insertedBriefings: Array<Record<string, unknown>>;
}

function createMockSupabase(db: MockProDb) {
  let idSeq = 1;
  return {
    from: vi.fn((table: string) => {
      if (table === "pro_profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: db.profile, error: null }),
            })),
          })),
        };
      }
      if (table === "merchants") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: db.profile.merchant_id,
                  name: db.profile.display_name,
                  pro_category: db.profile.profession_preset,
                },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === "opportunities") {
        return {
          select: vi.fn(() => ({
            or: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: db.boardOpportunities, error: null }),
              })),
            })),
            in: vi.fn().mockResolvedValue({ data: db.boardOpportunities, error: null }),
          })),
          insert: vi.fn((payload: Record<string, unknown>) => {
            const id = `opp-${idSeq++}`;
            const row = { id, ...payload };
            db.insertedOpportunities.push(row);
            return {
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
              })),
            };
          }),
        };
      }
      if (table === "opportunity_matches") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({ data: db.existingMatches, error: null }),
                })),
              })),
              then: (resolve: (v: unknown) => void) =>
                resolve({ data: db.existingMatches, error: null }),
            })),
          })),
          upsert: vi.fn((payload: Record<string, unknown>) => {
            const id = `match-${idSeq++}`;
            db.upsertedMatches.push({ id, ...payload });
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id }, error: null }),
              })),
            };
          }),
        };
      }
      if (table === "pro_alerts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({ data: db.alerts, error: null }),
                })),
              })),
            })),
          })),
          insert: vi.fn((payload: Record<string, unknown>) => {
            const id = `alert-${idSeq++}`;
            db.insertedAlerts.push({ id, ...payload });
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id }, error: null }),
              })),
            };
          }),
          update: vi.fn((patch: Record<string, unknown>) => {
            db.updatedAlerts.push(patch);
            return {
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            };
          }),
        };
      }
      if (table === "conversations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: db.conversations, error: null }),
              })),
              limit: vi.fn().mockResolvedValue({ data: db.conversations, error: null }),
            })),
          })),
        };
      }
      if (table === "messages") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              eq: vi.fn((_col: string, dir: string) => ({
                order: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({
                    data: dir === "in" ? db.inboundMessages : db.outboundMessages,
                    error: null,
                  }),
                })),
                gte: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({
                    data: dir === "out" ? db.outboundMessages : db.inboundMessages,
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        };
      }
      if (table === "service_inquiries") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: db.inquiries, error: null }),
              })),
            })),
          })),
        };
      }
      if (table === "agent_briefings") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            const id = `brief-${idSeq++}`;
            const created_at = "2026-11-20T10:30:00.000Z";
            db.insertedBriefings.push({ id, created_at, ...payload });
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id, created_at }, error: null }),
              })),
            };
          }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
  };
}

beforeEach(() => {
  process.env = { ...OLD_ENV };
  delete process.env.RESEND_API_KEY;
  resetEnvCache();
  sparkJsonMock.mockReset();
  embedConfiguredMock.mockReturnValue(false);
  embedTextsMock.mockReset();
  resolveWhatsAppConfigMock.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  process.env = { ...OLD_ENV };
  resetEnvCache();
  vi.restoreAllMocks();
});

describe("Phase 4 — Opportunity Radar Scoring, Pitch Firewall & Ingest", () => {
  it("scores high-budget Tunisia briefs >= 75 and penalizes below-floor offers deterministically", () => {
    const profile = makeProfile("creator"); // floor 800 DT
    const nowMs = Date.parse("2026-11-20T10:00:00.000Z");

    const strong = scoreOpportunityDeterministic(
      {
        source: "board",
        title: "Campagne Sponsorisée App Fintech Tunisie — 2 Reels + Stories",
        brandOrClient: "PayTunisia",
        description: "Recherche créatrice à Tunis pour 2 Reels sponsorisés + Stories lien tracké, budget 2400DT.",
        budgetMillimes: 2_400_000,
        deadlineAt: "2026-11-21T06:00:00.000Z", // < 24h deadline
      },
      profile,
      { vectorSimilarity: 0.88, nowMs },
    );
    expect(strong.fitScore).toBeGreaterThanOrEqual(85);
    expect(strong.urgency).toBe("critical");
    expect(shouldAlertForOpportunity(strong)).toBe(true);
    expect(strong.draftPitch).toContain("2400DT");

    const lowball = scoreOpportunityDeterministic(
      {
        source: "dm",
        title: "Promo locale",
        brandOrClient: "Small Brand",
        description: "Budget 200DT seulement",
        budgetMillimes: 200_000,
      },
      profile,
      { nowMs },
    );
    expect(lowball.fitScore).toBeLessThan(65);
    // Draft pitch must never quote the below-floor 200DT; it holds the 800DT floor
    expect(lowball.draftPitch).not.toContain("200DT");
    expect(lowball.draftPitch).toContain("800DT");
  });

  it("uses reasoning tier via sparkJson and blocks a hallucinated below-floor pitch", async () => {
    const profile = makeProfile("creator");
    sparkJsonMock.mockResolvedValue({
      fitScore: 91,
      urgency: "high",
      category: "sponsorship",
      fitReasons: ["Great fintech match in Tunis", "Budget exceeds floor"],
      // Rogue pitch quoting 400DT (< 800DT floor)
      draftPitch: "Bonjour ! Je peux faire ce Reel sponsorisé pour seulement 400DT !",
    });

    const res = await evaluateOpportunityFit(
      {
        source: "board",
        title: "Campagne Lancement Fintech Tunis",
        brandOrClient: "PayTN",
        description: "Budget 2000DT pour 2 Reels en Derja",
        budgetMillimes: 2_000_000,
      },
      profile,
    );

    expect(sparkJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "reasoning", schemaName: "pro_opportunity_eval" }),
    );
    // Rate firewall rejected the 400DT pitch and substituted the safe deterministic pitch
    expect(res.source).toBe("deterministic");
    expect(res.evaluation.draftPitch).not.toContain("400DT");
    expect(res.evaluation.draftPitch).toContain("2000DT");
  });

  it("ingests a high-fit brief, never auto-applies (status=new), creates an urgent alert, and pushes WhatsApp +216 & Email", async () => {
    process.env.RESEND_API_KEY = "re_test_123";
    resetEnvCache();
    resolveWhatsAppConfigMock.mockResolvedValue({
      phoneNumberId: "100200300",
      wabaId: "waba-1",
      accessToken: "wa-token",
      verifyToken: null,
      source: "database",
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "ok",
    });

    const db: MockProDb = {
      profile: makeProfile("cameraman"),
      existingMatches: [],
      boardOpportunities: [],
      conversations: [],
      inboundMessages: [],
      outboundMessages: [],
      inquiries: [],
      alerts: [],
      insertedOpportunities: [],
      upsertedMatches: [],
      insertedAlerts: [],
      updatedAlerts: [],
      insertedBriefings: [],
    };
    sparkJsonMock.mockRejectedValue(new Error("use deterministic baseline"));

    const supabase = createMockSupabase(db);
    const result = await ingestAndScoreOpportunity(
      supabase as never,
      db.profile.merchant_id,
      {
        source: "board",
        title: "Tournage Vidéo 4K + Drone Boutique Hôtel Hammamet",
        brandOrClient: "Dar Jasmin",
        description: "Film vitrine 90s + 5 Reels + drone à Hammamet, budget 2600DT.",
        budgetMillimes: 2_600_000,
      },
      { profile: db.profile, fetchImpl: fetchMock as unknown as typeof fetch },
    );

    // Must never auto-apply
    expect(result.status).toBe("new");
    expect(db.upsertedMatches[0]?.status).toBe("new");
    expect(result.evaluation.fitScore).toBeGreaterThanOrEqual(75);
    expect(result.alertCreated).toBe(true);
    expect(db.insertedAlerts).toHaveLength(1);
    expect(db.insertedAlerts[0]?.severity).toBe("urgent");

    // Both WhatsApp Graph API and Resend Email API were called
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("graph.facebook.com");
    expect(String(fetchMock.mock.calls[1]![0])).toContain("api.resend.com");
    expect(db.updatedAlerts[0]?.notified_channels).toEqual(["in_app", "whatsapp", "email"]);
  });

  it("scans both unmatched board opportunities and inbound commercial DMs", async () => {
    const db: MockProDb = {
      profile: makeProfile("creator"),
      existingMatches: [{ opportunity_id: "opp-already-matched" }],
      boardOpportunities: [
        {
          id: "opp-already-matched",
          source: "board",
          title: "Already Matched",
          brand_or_client: "Old Brand",
          description: "Already scored",
          budget_millimes: 1_000_000,
        },
        {
          id: "opp-board-new",
          source: "board",
          title: "Campagne UGC Beauté Tunis",
          brand_or_client: "Jasmin Beauty",
          description: "Besoin 2 Reels sponsorisés + UGC à Tunis pour 1500DT.",
          budget_millimes: 1_500_000,
        },
      ],
      conversations: [
        {
          id: "conv-brand-dm",
          customer_id: "cust-1",
          slots: { clientName: "Agence Carthage" },
          updated_at: "2026-11-20T09:00:00.000Z",
        },
        {
          id: "conv-fan-dm",
          customer_id: "cust-2",
          slots: { clientName: "Fan" },
          updated_at: "2026-11-20T08:00:00.000Z",
        },
      ],
      inboundMessages: [
        {
          conversation_id: "conv-brand-dm",
          body: "Bonjour Ines, nous cherchons une collaboration sponsorisée pour une marque fintech à Tunis, budget 1800DT.",
          created_at: "2026-11-20T09:00:00.000Z",
        },
        {
          conversation_id: "conv-fan-dm",
          body: "Bravo pour la dernière vidéo!",
          created_at: "2026-11-20T08:00:00.000Z",
        },
      ],
      outboundMessages: [],
      inquiries: [],
      alerts: [],
      insertedOpportunities: [],
      upsertedMatches: [],
      insertedAlerts: [],
      updatedAlerts: [],
      insertedBriefings: [],
    };

    sparkJsonMock.mockRejectedValue(new Error("deterministic scan"));
    const supabase = createMockSupabase(db);
    const summary = await scanMerchantOpportunities(supabase as never, db.profile.merchant_id);

    expect(summary.scannedBoard).toBe(1);
    expect(summary.scannedDms).toBe(2);
    // 1 new board opportunity + 1 commercial DM (fan DM skipped)
    expect(summary.newMatches).toBe(2);
    expect(db.upsertedMatches).toHaveLength(2);
    expect(db.insertedOpportunities).toHaveLength(1);
    expect(db.insertedOpportunities[0]?.source).toBe("dm");
  });
});

describe("Phase 4 — Alert Notification Dispatcher & Daily Agent Briefings", () => {
  it("skips external push for info/important alerts and degrades gracefully on transport failures", async () => {
    expect(shouldPushExternalAlert("info")).toBe(false);
    expect(shouldPushExternalAlert("important")).toBe(false);
    expect(shouldPushExternalAlert("urgent")).toBe(true);
    expect(shouldPushExternalAlert("critical")).toBe(true);

    const profile = makeProfile("doctor");
    const db: MockProDb = {
      profile,
      existingMatches: [],
      boardOpportunities: [],
      conversations: [],
      inboundMessages: [],
      outboundMessages: [],
      inquiries: [],
      alerts: [],
      insertedOpportunities: [],
      upsertedMatches: [],
      insertedAlerts: [],
      updatedAlerts: [],
      insertedBriefings: [],
    };
    const supabase = createMockSupabase(db);

    const infoRes = await dispatchProAlertNotifications(
      supabase as never,
      profile.merchant_id,
      {
        severity: "important",
        category: "opportunity_match",
        title: "New podcast invite",
        summary: "Podcast invite in La Marsa",
        recommended_action: "Check Opportunities",
      },
      { profile },
    );
    expect(infoRes.notifiedChannels).toEqual(["in_app"]);

    // Critical alert when WhatsApp transport returns 500 -> never throws, captures error cleanly
    resolveWhatsAppConfigMock.mockResolvedValue({
      phoneNumberId: "100200300",
      wabaId: null,
      accessToken: "bad-token",
      verifyToken: null,
      source: "env",
    });
    const failingFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Meta upstream error",
    });

    const critRes = await createProAlert(supabase as never, {
      merchantId: profile.merchant_id,
      severity: "critical",
      category: "medical_red_flag",
      title: "Chest pain emergency",
      summary: "Patient directed to SAMU 190",
      recommendedAction: "Review immediately",
      profile,
      fetchImpl: failingFetch as unknown as typeof fetch,
    });
    expect(critRes.id).toBeTruthy();
    expect(critRes.notifiedChannels).toEqual(["in_app"]);
    expect(critRes.errors[0]).toContain("500");

    const formatted = formatAlertWhatsAppText(
      {
        severity: "critical",
        category: "medical_red_flag",
        title: "Chest pain emergency",
        summary: "Patient directed to SAMU 190",
        recommended_action: "Review immediately",
      },
      profile.display_name,
      "https://wassalha.tn",
    );
    expect(formatted).toContain("CRITICAL ALERT");
    expect(formatted).toContain("https://wassalha.tn/pro/alerts");
  });

  it("synthesizes a What's New Agent Briefing with verified DB stats via reasoning tier and fallback", async () => {
    const profile = makeProfile("doctor");
    const db: MockProDb = {
      profile,
      existingMatches: [
        { opportunity_id: "opp-1", fit_score: 92, urgency: "high", status: "new" },
      ],
      boardOpportunities: [
        {
          id: "opp-1",
          title: "Atelier Santé Préventive — TechPark El Ghazala",
          brand_or_client: "TechPark El Ghazala",
          budget_millimes: 1_200_000,
        },
      ],
      conversations: [{ id: "conv-1" }],
      inboundMessages: [],
      outboundMessages: [{ id: "m-1" }, { id: "m-2" }, { id: "m-3" }],
      inquiries: [
        {
          client_name: "Sami",
          scope_summary: "Consultation au Cabinet",
          status: "details_sent",
          budget_millimes: 80_000,
        },
      ],
      alerts: [
        {
          severity: "urgent",
          category: "opportunity_match",
          title: "1200DT corporate wellness talk closing soon",
          status: "unread",
        },
      ],
      insertedOpportunities: [],
      upsertedMatches: [],
      insertedAlerts: [],
      updatedAlerts: [],
      insertedBriefings: [],
    };
    const supabase = createMockSupabase(db);

    // 1. Reasoning tier success
    sparkJsonMock.mockResolvedValueOnce({
      headline: "1 urgent alert and a 92% match wellness talk (1200DT) await review.",
      highlights: [
        "3 patient DMs handled automatically in your voice",
        "1 active consultation inquiry with clinic details sent",
        "TechPark El Ghazala wellness talk scored 92% fit (1200DT)",
      ],
      actionItems: [
        "Review and approve the TechPark El Ghazala pitch in Opportunities",
        "Check your unread urgent alert",
      ],
    });

    const reasoningBrief = await generateProBriefing(supabase as never, profile.merchant_id);
    expect(reasoningBrief.source).toBe("reasoning");
    expect(reasoningBrief.stats).toMatchObject({
      dmsHandled: 3,
      activeInquiries: 1,
      opportunitiesSpotted: 1,
      unreadAlerts: 1,
      criticalAlerts: 1,
      topOpportunityScore: 92,
      topOpportunityBudgetMillimes: 1_200_000,
    });
    expect(db.insertedBriefings).toHaveLength(1);

    // 2. Deterministic fallback when reasoning provider throws
    sparkJsonMock.mockRejectedValueOnce(new Error("reasoning provider unavailable"));
    const fallbackBrief = await generateProBriefing(supabase as never, profile.merchant_id);
    expect(fallbackBrief.source).toBe("deterministic");
    expect(fallbackBrief.headline).toContain("1 urgent alert");
    expect(fallbackBrief.highlights.join(" ")).toContain("1200DT");
    expect(buildFallbackBriefing).toBeDefined();
  });
});
