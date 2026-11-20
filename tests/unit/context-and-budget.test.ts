import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  sparkJsonMock,
  sparkTextMock,
  embedTextsMock,
  sendTextMock,
  sendPinLinkMock,
} = vi.hoisted(() => ({
  sparkJsonMock: vi.fn(),
  sparkTextMock: vi.fn(),
  embedTextsMock: vi.fn(),
  sendTextMock: vi.fn(),
  sendPinLinkMock: vi.fn(),
}));

vi.mock("@/lib/ai/spark", () => ({
  sparkJson: sparkJsonMock,
  sparkText: sparkTextMock,
  aiJson: sparkJsonMock,
  aiText: sparkTextMock,
}));

vi.mock("@/lib/ai/embeddings", () => ({
  embedConfigured: () => true,
  embedTexts: embedTextsMock,
  embedImages: vi.fn().mockResolvedValue([]),
  cosineSimilarity: () => 0,
}));

vi.mock("@/lib/channels", () => ({
  channelAdapter: {
    sendText: sendTextMock,
    sendPinLink: sendPinLinkMock,
    sendImage: vi.fn(),
    sendButtons: vi.fn(),
    sendLocationRequest: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
  hasAdminConfig: () => false,
}));

import {
  formatEcommerceKnowledgeBlock,
  formatProKnowledgeBlock,
  inferContextCategory,
  matchCatalogProductDirect,
} from "@/lib/context/workspace-context";
import { buildDeterministicProBriefing } from "@/lib/pro/briefing";
import { getProPreset } from "@/lib/pro/presets";
import { runProTurn, type ProConversationRow, type ProMessageRow } from "@/lib/pro/turn";
import type { ProCategory, ProProfileRow, ProServiceRow } from "@/lib/pro/types";

function seededProfile(category: ProCategory, merchantId = "m-1"): ProProfileRow {
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
    alert_whatsapp_phone: null,
    alert_email: null,
  };
}

function seededServices(category: ProCategory, merchantId = "m-1"): ProServiceRow[] {
  const preset = getProPreset(category);
  return preset.services.map((s, idx) => ({
    id: `svc-${idx + 1}`,
    merchant_id: merchantId,
    title: s.title,
    category: s.category,
    description: s.description,
    deliverables: s.deliverables,
    duration_label: s.duration_label,
    price_millimes: s.price_millimes,
    price_display: s.price_display,
    floor_millimes: s.floor_millimes,
    pricing_mode: s.pricing_mode,
    intake_questions: s.intake_questions,
    prep_or_details_template: s.prep_or_details_template,
    booking_url: s.booking_url ?? null,
    active: true,
  }));
}

function mockProSupabase(opts: {
  profile: ProProfileRow;
  services: ProServiceRow[];
  contextNotes?: Array<{ id: string; category: string; content: string; active: boolean }>;
  conversation: ProConversationRow;
}) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    storage: { from: vi.fn(() => ({ download: vi.fn() })) },
    from: vi.fn((table: string) => {
      if (table === "pro_profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: opts.profile, error: null }),
            })),
          })),
        };
      }
      if (table === "pro_services") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({ data: opts.services, error: null }),
              })),
            })),
          })),
        };
      }
      if (table === "workspace_context_entries") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: (opts.contextNotes ?? []).map((n) => ({
                  ...n,
                  merchant_id: opts.conversation.merchant_id,
                  created_at: "2026-11-20T10:00:00.000Z",
                  updated_at: "2026-11-20T10:00:00.000Z",
                })),
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === "conversations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              single: vi.fn().mockResolvedValue({ data: opts.conversation, error: null }),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })),
        };
      }
      if (table === "messages") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              lt: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
              })),
            })),
          })),
        };
      }
      if (table === "merchants") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { name: opts.profile.display_name, pro_category: opts.profile.profession_preset },
                error: null,
              }),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })),
            })),
            eq: vi.fn(() => ({
              order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
            order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "row-1" }, error: null }) })),
        })),
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })),
      };
    }),
  };
}

beforeEach(() => {
  sparkJsonMock.mockReset();
  sparkTextMock.mockReset();
  embedTextsMock.mockReset();
  sendTextMock.mockReset().mockResolvedValue(undefined);
  sendPinLinkMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Workspace AI Context & Deterministic Knowledge Formatting", () => {
  it("infers context note categories deterministically with 0 LLM calls", () => {
    expect(inferContextCategory("Closed every Sunday and open 9h-18h Mon-Sat")).toBe("hours");
    expect(inferContextCategory("Delivery is 24h in Tunis and exchange within 7 days")).toBe("policy");
    expect(inferContextCategory("Fully booked June 15 to 17")).toBe("availability");
    expect(inferContextCategory("Free delivery promo this weekend")).toBe("promo");
    expect(inferContextCategory("Free parking right behind Immeuble Le Lac")).toBe("location");
    expect(inferContextCategory("Portfolio link: https://example.com/reel")).toBe("faq");
  });

  it("formats E-Commerce knowledge without timestamps, UUIDs, or secret floor prices", () => {
    const block = formatEcommerceKnowledgeBlock({
      shopName: "Medina Wear",
      businessType: "clothing",
      businessDescription: "Tunisian streetwear hoodies and tees",
      freeDeliveryThresholdMillimes: 150_000,
      hasPaymentLink: true,
      products: [
        {
          name: "Sweat Jaune",
          category: "hoodie",
          description: "Heavy cotton 380gsm",
          priceMillimes: 110_000,
          stock: 6,
          variantsSummary: "available: M, L, XL",
        },
      ],
      fees: [
        { governorate: "Tunis", delegation: null, fee_millimes: 7_000 },
        { governorate: "Sousse", delegation: null, fee_millimes: 8_000 },
      ],
      notes: [{ category: "hours", content: "Showroom open Mon-Sat 10h-20h" }],
    });
    expect(block).toContain("Shop Name: Medina Wear");
    expect(block).toContain("Sweat Jaune");
    expect(block).toContain("110DT");
    expect(block).toContain("Tunis: 7DT");
    expect(block).toContain("Free delivery on orders from 150DT");
    expect(block).toContain("Showroom open Mon-Sat 10h-20h");
    expect(block).not.toMatch(/floor/i);
  });

  it("matches catalog products directly by name or model hint with 0 embedding calls", () => {
    const index = [
      { id: "p1", name: "Sweat Jaune Oversize", category: "hoodie", priceMillimes: 110_000, stock: 5, description: "" },
      { id: "p2", name: "Robe Lin Beige", category: "dress", priceMillimes: 145_000, stock: 2, description: "" },
    ];
    expect(matchCatalogProductDirect("b9addech Sweat Jaune Oversize?", index)?.id).toBe("p1");
    expect(matchCatalogProductDirect("n7eb el robe el beige", index, "Robe Lin Beige")?.id).toBe("p2");
    expect(matchCatalogProductDirect("something completely unrelated", index)).toBeNull();
  });

  it("formats Pro knowledge with ALL active services and live owner notes without leaking secret floors", () => {
    const profile = seededProfile("doctor");
    const services = seededServices("doctor");
    const block = formatProKnowledgeBlock({
      profile,
      services,
      notes: [{ category: "policy", content: "CNAM card accepted at reception." }],
    });
    expect(block).toContain("Consultation au Cabinet");
    expect(block).toContain("Téléconsultation");
    expect(block).toContain("Bilan Préventif");
    expect(block).toContain("CNAM card accepted at reception.");
    expect(block).not.toContain("floor_millimes");
  });
});

describe("Input-Driven Model Call Budget (1 smart Gemini call for chat, 0 when not needed)", () => {
  it("handles a normal Pro client question in 1 unified Gemini call (0 embedding calls, 0 second style call) and injects live context notes", async () => {
    const profile = seededProfile("doctor", "m-doc-ctx");
    const services = seededServices("doctor", "m-doc-ctx");
    const conversation: ProConversationRow = {
      id: "conv-doc-ctx",
      merchant_id: "m-doc-ctx",
      customer_id: "c-1",
      slots: {},
      negotiation: null,
      ai_paused: false,
      updated_at: "2026-11-20T09:00:00.000Z",
    };
    const messages: ProMessageRow[] = [
      {
        id: "m1",
        kind: "text",
        body: "Ahla docteur, ta9blou carte CNAM w famma parking?",
        media_path: null,
        created_at: "2026-11-20T09:01:00.000Z",
      },
    ];

    sparkJsonMock.mockResolvedValue({
      intent: "service_inquiry",
      matchedServiceIndex: 0,
      clientName: null,
      clientPhone: null,
      requestedDate: null,
      locationOrVenue: null,
      scopeSummary: "Consultation au Cabinet",
      deliverablesRequested: null,
      proposedBudgetMillimes: null,
      asksDiscountOrGifted: false,
      flags: {
        isMedicalEmergency: false,
        asksMedicalDiagnosisOrPrescription: false,
        insultOrAngry: false,
        wantsHuman: false,
        isHighValueOpportunity: false,
      },
      replyText:
        "Ahla bik! Ay na9blou carte CNAM w famma parking gratuit wra Immeuble Médical Le Lac. El consultation fel cabinet b 80DT — t7eb ta7jez maw3ed?",
    });

    const supabase = mockProSupabase({
      profile,
      services,
      contextNotes: [
        { id: "n1", category: "policy", content: "CNAM card accepted. Free parking behind Immeuble Médical Le Lac.", active: true },
      ],
      conversation,
    });

    await runProTurn("conv-doc-ctx", {
      supabase: supabase as never,
      conversation,
      messages,
      proCategory: "doctor",
    });

    // Strictly 1 Gemini call (unified), 0 separate style_writer call, 0 embedding calls!
    expect(sparkJsonMock).toHaveBeenCalledTimes(1);
    expect(sparkTextMock).not.toHaveBeenCalled();
    expect(embedTextsMock).not.toHaveBeenCalled();

    // Prompt contained the live owner context note
    const callArg = sparkJsonMock.mock.calls[0]![0] as { system?: string };
    expect(callArg.system).toContain("CNAM card accepted");
    expect(callArg.system).toContain("Free parking behind Immeuble Médical Le Lac");

    // Human contextual reply sent directly
    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock.mock.calls[0]![1]).toContain("CNAM");
    expect(sendTextMock.mock.calls[0]![1]).toContain("parking");
  });

  it("uses 0 AI calls for deterministic Doctor prescription asks and human takeover requests", async () => {
    const profile = seededProfile("doctor", "m-doc-0");
    const services = seededServices("doctor", "m-doc-0");
    const conversation: ProConversationRow = {
      id: "conv-doc-0",
      merchant_id: "m-doc-0",
      customer_id: "c-2",
      slots: {},
      negotiation: null,
      ai_paused: false,
      updated_at: "2026-11-20T09:00:00.000Z",
    };

    const supabase = mockProSupabase({ profile, services, conversation });
    await runProTurn("conv-doc-0", {
      supabase: supabase as never,
      conversation,
      messages: [
        {
          id: "m-rx",
          kind: "text",
          body: "Docteur a3tini dwa antibiotique fi message",
          media_path: null,
          created_at: "2026-11-20T09:01:00.000Z",
        },
      ],
      proCategory: "doctor",
    });

    expect(sparkJsonMock).not.toHaveBeenCalled();
    expect(sparkTextMock).not.toHaveBeenCalled();
    expect(embedTextsMock).not.toHaveBeenCalled();
    expect(sendTextMock).toHaveBeenCalledTimes(1);
  });

  it("builds deterministic Pro briefing on GET polling with 0 LLM calls", async () => {
    const profile = seededProfile("creator", "m-brief-0");
    const services = seededServices("creator", "m-brief-0");
    const conversation: ProConversationRow = {
      id: "conv-b",
      merchant_id: "m-brief-0",
      customer_id: null,
      slots: {},
      negotiation: null,
      ai_paused: false,
      updated_at: "2026-11-20T09:00:00.000Z",
    };
    const supabase = mockProSupabase({ profile, services, conversation });
    const briefing = await buildDeterministicProBriefing(supabase as never, "m-brief-0");

    expect(briefing.source).toBe("deterministic");
    expect(briefing.headline.length).toBeGreaterThan(10);
    expect(sparkJsonMock).not.toHaveBeenCalled();
    expect(sparkTextMock).not.toHaveBeenCalled();
  });
});
