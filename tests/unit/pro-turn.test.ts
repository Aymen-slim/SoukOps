import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  sparkJsonMock,
  sparkTextMock,
  sendTextMock,
  sendPinLinkMock,
  createAdminClientMock,
} = vi.hoisted(() => ({
  sparkJsonMock: vi.fn(),
  sparkTextMock: vi.fn(),
  sendTextMock: vi.fn(),
  sendPinLinkMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/ai/spark", () => ({
  sparkJson: sparkJsonMock,
  sparkText: sparkTextMock,
  aiJson: sparkJsonMock,
  aiText: sparkTextMock,
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
  createAdminClient: createAdminClientMock,
  hasAdminConfig: () => false,
}));

import { runTurn } from "@/lib/pipeline/handleTurn";
import { getProPreset, PRO_PRESETS } from "@/lib/pro/presets";
import {
  buildMedicalEmergencyReply,
  buildProStyleSystemPrompt,
  collectAllowedProMillimes,
  detectMedicalDiagnosisOrPrescriptionAsk,
  detectMedicalRedFlag,
  normalizeProReplyAmounts,
  passesMedicalSafetyFirewall,
  passesProRateFirewall,
  resolveProServiceOfferMillimes,
} from "@/lib/pro/style-prompt";
import {
  applyProDeterministicFallbacks,
  buildProTemplateReply,
  evaluateProIntake,
  extractProClientName,
  matchProServiceDeterministic,
  parseProBudgetMillimes,
  phraseProReply,
  runProTurn,
  type ProConversationRow,
  type ProMessageRow,
} from "@/lib/pro/turn";
import { PRO_CATEGORIES, type ProCategory, type ProProfileRow, type ProServiceRow } from "@/lib/pro/types";

interface MockDbState {
  workspaceMode: "ecommerce" | "pro";
  proCategory: ProCategory;
  merchantName: string;
  conversation: ProConversationRow;
  messages: ProMessageRow[];
  profile: ProProfileRow | null;
  services: ProServiceRow[];
  alertsInserted: Array<Record<string, unknown>>;
  inquiriesInserted: Array<Record<string, unknown>>;
  inquiriesUpdated: Array<Record<string, unknown>>;
  opportunitiesInserted: Array<Record<string, unknown>>;
  opportunityMatchesInserted: Array<Record<string, unknown>>;
  conversationUpdates: Array<Record<string, unknown>>;
}

function buildSeededProfile(category: ProCategory, merchantId = "m-pro-1"): ProProfileRow {
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
    alert_whatsapp_phone: "+21622333444",
    alert_email: null,
  };
}

function buildSeededServices(category: ProCategory, merchantId = "m-pro-1"): ProServiceRow[] {
  const preset = getProPreset(category);
  return preset.services.map((s, idx) => ({
    id: `svc-${category}-${idx + 1}`,
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

function createMockSupabase(state: MockDbState) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "conversations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: state.conversation, error: null }),
              maybeSingle: vi.fn().mockResolvedValue({ data: state.conversation, error: null }),
            })),
          })),
          update: vi.fn((patch: Record<string, unknown>) => {
            state.conversationUpdates.push(patch);
            if (patch.slots && typeof patch.slots === "object") {
              state.conversation.slots = patch.slots as Record<string, unknown>;
            }
            if (typeof patch.ai_paused === "boolean") {
              state.conversation.ai_paused = patch.ai_paused;
            }
            return {
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
        };
      }
      if (table === "merchants") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: state.conversation.merchant_id,
                  name: state.merchantName,
                  workspace_mode: state.workspaceMode,
                  pro_category: state.proCategory,
                  reply_language: "derja",
                  ai_instructions: "",
                },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === "messages") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gt: vi.fn(() => ({
                  order: vi.fn().mockResolvedValue({ data: state.messages, error: null }),
                })),
              })),
            })),
          })),
        };
      }
      if (table === "pro_profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: state.profile, error: null }),
            })),
          })),
        };
      }
      if (table === "pro_services") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({ data: state.services, error: null }),
              })),
            })),
          })),
        };
      }
      if (table === "pro_alerts") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            state.alertsInserted.push(payload);
            return Promise.resolve({ data: { id: "alert-1" }, error: null });
          }),
        };
      }
      if (table === "service_inquiries") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data:
                    state.inquiriesInserted.length > 0
                      ? { id: "inq-1" }
                      : null,
                  error: null,
                }),
              })),
            })),
          })),
          insert: vi.fn((payload: Record<string, unknown>) => {
            state.inquiriesInserted.push(payload);
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: "inq-1" }, error: null }),
              })),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            state.inquiriesUpdated.push(payload);
            return {
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
        };
      }
      if (table === "opportunities") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            state.opportunitiesInserted.push(payload);
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: "opp-dm-1" }, error: null }),
              })),
            };
          }),
        };
      }
      if (table === "opportunity_matches") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            state.opportunityMatchesInserted.push(payload);
            return Promise.resolve({ data: { id: "match-1" }, error: null });
          }),
        };
      }
      if (table === "customers") {
        return {
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      };
    }),
  };
}

beforeEach(() => {
  sparkJsonMock.mockReset();
  sparkTextMock.mockReset();
  sendTextMock.mockReset().mockResolvedValue(undefined);
  sendPinLinkMock.mockReset().mockResolvedValue(undefined);
  createAdminClientMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Phase 3 — Medical Safety & Rate Firewalls (style-prompt.ts)", () => {
  it("detects life-threatening emergency symptoms across Derja (Arabizi & Arabic), French, and English", () => {
    expect(detectMedicalRedFlag("Docteur 3andi wja3 fel sder w manajamch netnaffes")).toEqual({
      isEmergency: true,
      triggers: expect.arrayContaining(["chest_pain", "breathing_difficulty"]),
    });
    expect(detectMedicalRedFlag("عندي وجيعة في الصدر وضيق تنفس قوي")).toEqual({
      isEmergency: true,
      triggers: expect.arrayContaining(["chest_pain", "breathing_difficulty"]),
    });
    expect(detectMedicalRedFlag("Mon père a une douleur thoracique et perte de connaissance")).toEqual({
      isEmergency: true,
      triggers: expect.arrayContaining(["chest_pain", "loss_of_consciousness_or_stroke"]),
    });
    expect(detectMedicalRedFlag("Salam docteur, b9addech el consultation fel cabinet?").isEmergency).toBe(
      false,
    );
  });

  it("rejects model replies that prescribe medication or dosages on Doctor preset", () => {
    expect(passesMedicalSafetyFirewall("Prenez 500 mg d'amoxicilline matin et soir.")).toBe(false);
    expect(passesMedicalSafetyFirewall("Je vous prescris du cortisone 20mg.")).toBe(false);
    expect(
      passesMedicalSafetyFirewall(
        "Ahla bik! El consultation fel cabinet b 80DT. A3tini esmek, numrok (+216), w el nhar elli ysa3dek.",
      ),
    ).toBe(true);
  });

  it("clamps below-floor budgets and gifted requests at the service floor price in integer millimes", () => {
    const creatorReelService = buildSeededServices("creator")[0]!; // 1,200 DT list, 950 DT floor
    const belowFloor = resolveProServiceOfferMillimes({
      service: creatorReelService,
      minDealBudgetMillimes: 800_000,
      proposedBudgetMillimes: 500_000, // 500 DT < 950 DT floor
      asksDiscountOrGifted: true,
    });
    expect(belowFloor.action).toBe("clamp_to_floor");
    expect(belowFloor.quotedMillimes).toBe(950_000);
    expect(belowFloor.belowFloor).toBe(true);

    const allowed = collectAllowedProMillimes(belowFloor);
    expect(allowed).toContain(950_000);
    expect(allowed).toContain(1_200_000);
    expect(allowed).not.toContain(500_000);

    // Reply quoting 500DT fails the Pro Rate Firewall
    expect(
      passesProRateFirewall("D'accord pour 500DT le Reel sponsorisé !", allowed, belowFloor.floorMillimes),
    ).toBe(false);
    // Reply quoting the 950DT floor passes
    expect(
      passesProRateFirewall(
        "Pour un Reel sponsorisé dédié, mon tarif minimum est de 950DT (tarif standard 1200DT).",
        allowed,
        belowFloor.floorMillimes,
      ),
    ).toBe(true);
  });

  it("composes a deterministic style prompt with samples, rules, boundaries, and zero timestamps/UUIDs", () => {
    const profile = buildSeededProfile("cameraman");
    const service = buildSeededServices("cameraman")[0]!;
    const promptA = buildProStyleSystemPrompt({
      profile,
      language: "derja",
      script: "latin",
      allowedMillimes: [750_000, 650_000],
      activeService: service,
    });
    const promptB = buildProStyleSystemPrompt({
      profile,
      language: "derja",
      script: "latin",
      allowedMillimes: [750_000, 650_000],
      activeService: service,
    });
    expect(promptA).toBe(promptB);
    expect(promptA).toContain("Youssef Khelifi Studio");
    expect(promptA).toContain("750DT, 650DT");
    expect(promptA).not.toContain(service.id);
  });
});

describe("Phase 3 — Doctor Red-Flag Escalation & Non-Diagnosis Guardrail", () => {
  it("immediately escalates emergency chest pain / breathing trouble with SAMU 190, pauses AI, and creates a critical alert", async () => {
    const state: MockDbState = {
      workspaceMode: "pro",
      proCategory: "doctor",
      merchantName: "Dr. Amine Ben Amor",
      conversation: {
        id: "conv-doc-1",
        merchant_id: "m-doc-1",
        customer_id: "cust-1",
        slots: {},
        negotiation: null,
        ai_paused: false,
        updated_at: "2026-11-19T08:00:00.000Z",
      },
      messages: [
        {
          id: "msg-1",
          kind: "text",
          body: "Docteur brabi 3andi wja3 9wi fel sder w 9at3et nfas tawa!",
          media_path: null,
          created_at: "2026-11-19T08:01:00.000Z",
        },
      ],
      profile: buildSeededProfile("doctor", "m-doc-1"),
      services: buildSeededServices("doctor", "m-doc-1"),
      alertsInserted: [],
      inquiriesInserted: [],
      inquiriesUpdated: [],
      opportunitiesInserted: [],
      opportunityMatchesInserted: [],
      conversationUpdates: [],
    };

    const supabase = createMockSupabase(state);
    createAdminClientMock.mockReturnValue(supabase);

    // Run through handleTurn's main runTurn dispatcher to verify workspace_mode === "pro" dispatch
    await runTurn("conv-doc-1");

    // 1. Model is never even trusted/called on pre-model red-flag intercept
    expect(sparkJsonMock).not.toHaveBeenCalled();
    expect(sparkTextMock).not.toHaveBeenCalled();

    // 2. Patient immediately receives SAMU 190 emergency guidance
    expect(sendTextMock).toHaveBeenCalledTimes(1);
    const sentReply = sendTextMock.mock.calls[0]![1] as string;
    expect(sentReply).toContain("190");
    expect(sentReply).toMatch(/SAMU/i);

    // 3. Critical medical_red_flag alert inserted and AI paused
    expect(state.alertsInserted).toHaveLength(1);
    expect(state.alertsInserted[0]).toMatchObject({
      severity: "critical",
      category: "medical_red_flag",
      status: "unread",
    });
    expect(state.conversation.ai_paused).toBe(true);
  });

  it("refuses to diagnose or prescribe medication over DM and redirects to booking a consultation", async () => {
    const state: MockDbState = {
      workspaceMode: "pro",
      proCategory: "doctor",
      merchantName: "Dr. Amine Ben Amor",
      conversation: {
        id: "conv-doc-rx",
        merchant_id: "m-doc-1",
        customer_id: "cust-2",
        slots: {},
        negotiation: null,
        ai_paused: false,
        updated_at: "2026-11-19T08:00:00.000Z",
      },
      messages: [
        {
          id: "msg-rx",
          kind: "text",
          body: "Docteur 3andi k7a, a3tini dwa walla antibiotique fi message brabi",
          media_path: null,
          created_at: "2026-11-19T08:02:00.000Z",
        },
      ],
      profile: buildSeededProfile("doctor", "m-doc-1"),
      services: buildSeededServices("doctor", "m-doc-1"),
      alertsInserted: [],
      inquiriesInserted: [],
      inquiriesUpdated: [],
      opportunitiesInserted: [],
      opportunityMatchesInserted: [],
      conversationUpdates: [],
    };

    sparkJsonMock.mockRejectedValue(new Error("offline - use deterministic fallback"));
    const supabase = createMockSupabase(state);

    await runProTurn("conv-doc-rx", {
      supabase: supabase as never,
      conversation: state.conversation,
      messages: state.messages,
      proCategory: "doctor",
    });

    expect(detectMedicalDiagnosisOrPrescriptionAsk(state.messages[0]!.body!)).toBe(true);
    expect(sendTextMock).toHaveBeenCalledTimes(1);
    const reply = sendTextMock.mock.calls[0]![1] as string;
    expect(reply).toContain("80DT");
    expect(reply).toMatch(/Consultation au Cabinet/i);
    expect(passesMedicalSafetyFirewall(reply)).toBe(true);
  });
});

describe("Phase 3 — Cameraman Intake & Structured Package + Pin Delivery", () => {
  it("collects missing intake slots on turn 1, then delivers full package details + studio GPS pin on turn 2", async () => {
    const services = buildSeededServices("cameraman", "m-cam-1");
    const state: MockDbState = {
      workspaceMode: "pro",
      proCategory: "cameraman",
      merchantName: "Youssef Khelifi Studio",
      conversation: {
        id: "conv-cam-1",
        merchant_id: "m-cam-1",
        customer_id: "cust-cam-1",
        slots: {},
        negotiation: null,
        ai_paused: false,
        updated_at: "2026-11-19T09:00:00.000Z",
      },
      messages: [
        {
          id: "msg-cam-1",
          kind: "text",
          body: "Ahla khoya, b9addech pack tournage Brand Reels 4K?",
          media_path: null,
          created_at: "2026-11-19T09:01:00.000Z",
        },
      ],
      profile: buildSeededProfile("cameraman", "m-cam-1"),
      services,
      alertsInserted: [],
      inquiriesInserted: [],
      inquiriesUpdated: [],
      opportunitiesInserted: [],
      opportunityMatchesInserted: [],
      conversationUpdates: [],
    };

    sparkJsonMock.mockRejectedValue(new Error("use deterministic extraction"));
    sparkTextMock.mockRejectedValue(new Error("use deterministic template"));
    const supabase = createMockSupabase(state);

    // Turn 1: Client asks about Brand Reels price -> quotes 750DT and asks for date, venue & +216 phone
    await runProTurn("conv-cam-1", {
      supabase: supabase as never,
      conversation: state.conversation,
      messages: state.messages,
      proCategory: "cameraman",
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    const turn1Reply = sendTextMock.mock.calls[0]![1] as string;
    expect(turn1Reply).toContain("Pack Brand Reels");
    expect(turn1Reply).toContain("750DT");
    expect(state.inquiriesInserted).toHaveLength(1);
    expect(state.inquiriesInserted[0]?.status).toBe("discussing");
    expect(sendPinLinkMock).not.toHaveBeenCalled();

    // Turn 2: Client provides date ("15 juin"), city ("fi La Marsa"), and phone ("55 123 456")
    sendTextMock.mockClear();
    state.messages = [
      {
        id: "msg-cam-2",
        kind: "text",
        body: "Esmi Karim, el tournage le 15 juin fi La Marsa, num 55 123 456",
        media_path: null,
        created_at: "2026-11-19T09:02:00.000Z",
      },
    ];

    await runProTurn("conv-cam-1", {
      supabase: supabase as never,
      conversation: state.conversation,
      messages: state.messages,
      proCategory: "cameraman",
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    const turn2Reply = sendTextMock.mock.calls[0]![1] as string;
    expect(turn2Reply).toContain("750DT");
    expect(turn2Reply).toContain("15 juin");
    expect(turn2Reply).toContain("+21655123456");
    expect(turn2Reply).toContain("3 Reels verticaux 4K");

    // Inquiry updated to details_sent and studio GPS pin sent
    expect(state.inquiriesUpdated).toHaveLength(1);
    expect(state.inquiriesUpdated[0]?.status).toBe("details_sent");
    expect(sendPinLinkMock).toHaveBeenCalledTimes(1);
    expect(sendPinLinkMock.mock.calls[0]![1]).toContain("36.8615,10.1623");
  });
});

describe("Phase 3 — Creator Brand-Deal Rate Protection in Derja & French", () => {
  it("clamps below-floor Derja brand counter-offers at 950DT floor and rejects hallucinated discounts", async () => {
    const services = buildSeededServices("creator", "m-cre-1");
    const state: MockDbState = {
      workspaceMode: "pro",
      proCategory: "creator",
      merchantName: "Ines Mansour",
      conversation: {
        id: "conv-cre-derja",
        merchant_id: "m-cre-1",
        customer_id: "cust-cre-1",
        slots: {},
        negotiation: null,
        ai_paused: false,
        updated_at: "2026-11-19T10:00:00.000Z",
      },
      messages: [
        {
          id: "msg-cre-1",
          kind: "text",
          body: "Ahla Ines! N7ebbou collaboration Reel sponsorisé l marque mte3na, amma el budget mte3na 500 DT bark, na9eslna chwaya!",
          media_path: null,
          created_at: "2026-11-19T10:01:00.000Z",
        },
      ],
      profile: buildSeededProfile("creator", "m-cre-1"),
      services,
      alertsInserted: [],
      inquiriesInserted: [],
      inquiriesUpdated: [],
      opportunitiesInserted: [],
      opportunityMatchesInserted: [],
      conversationUpdates: [],
    };

    sparkJsonMock.mockRejectedValue(new Error("use deterministic extraction"));
    // Simulate a rogue LLM trying to accept the below-floor 500DT offer:
    sparkTextMock.mockResolvedValue("Mrigel! Nkhdem m3akom el Reel sponsorisé b 500DT!");
    const supabase = createMockSupabase(state);

    await runProTurn("conv-cre-derja", {
      supabase: supabase as never,
      conversation: state.conversation,
      messages: state.messages,
      proCategory: "creator",
    });

    // Pro Rate Firewall blocks 500DT and falls back to the 950DT floor template!
    expect(sendTextMock).toHaveBeenCalledTimes(1);
    const derjaReply = sendTextMock.mock.calls[0]![1] as string;
    expect(derjaReply).toContain("950DT");
    expect(derjaReply).not.toContain("500DT");
    expect(state.conversation.slots?.agreedRateMillimes).toBe(950_000);
  });

  it("protects rate floor in French when an agency asks for a gifted / 600 DT sponsored Reel and logs a DM opportunity", async () => {
    const services = buildSeededServices("creator", "m-cre-2");
    const state: MockDbState = {
      workspaceMode: "pro",
      proCategory: "creator",
      merchantName: "Ines Mansour",
      conversation: {
        id: "conv-cre-fr",
        merchant_id: "m-cre-2",
        customer_id: "cust-cre-2",
        slots: {},
        negotiation: null,
        ai_paused: false,
        updated_at: "2026-11-19T11:00:00.000Z",
      },
      messages: [
        {
          id: "msg-cre-fr",
          kind: "text",
          body: "Bonjour Ines, nous lançons une campagne sponsorisée pour notre marque à Tunis avec un budget de 600 DT ou en échange de visibilité (gifted). Qu'en pensez-vous ?",
          media_path: null,
          created_at: "2026-11-19T11:01:00.000Z",
        },
      ],
      profile: buildSeededProfile("creator", "m-cre-2"),
      services,
      alertsInserted: [],
      inquiriesInserted: [],
      inquiriesUpdated: [],
      opportunitiesInserted: [],
      opportunityMatchesInserted: [],
      conversationUpdates: [],
    };

    sparkJsonMock.mockRejectedValue(new Error("use deterministic extraction"));
    // Simulate a well-behaved style_writer response in French stating the 950DT floor
    sparkTextMock.mockResolvedValue(
      "Bonjour ! Merci pour votre proposition. Pour un Reel sponsorisé dédié + 3 Stories, mon tarif standard est de 1200DT et mon minimum plancher est de 950DT (je ne fais pas de gifted). Pouvez-vous me partager la date souhaitée et votre contact (+216) ?",
    );
    const supabase = createMockSupabase(state);

    await runProTurn("conv-cre-fr", {
      supabase: supabase as never,
      conversation: state.conversation,
      messages: state.messages,
      proCategory: "creator",
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    const frReply = sendTextMock.mock.calls[0]![1] as string;
    expect(frReply).toContain("950DT");
    expect(frReply).not.toContain("600DT");
    expect(state.conversation.slots?.buyerLanguage).toBe("fr");
    expect(state.opportunitiesInserted).toHaveLength(1);
    expect(state.opportunityMatchesInserted).toHaveLength(1);
  });

  it("Evaluates deterministic helper functions for service matching, intake, and emergency replies", async () => {
    const docServices = buildSeededServices("doctor");
    const match = matchProServiceDeterministic("Bonjour je voudrais une téléconsultation", docServices);
    expect(match?.service.category).toBe("teleconsultation");

    const intakeIncomplete = evaluateProIntake("doctor", { clientName: "Sarra" }, true);
    expect(intakeIncomplete.complete).toBe(false);
    expect(intakeIncomplete.missingFields).toEqual(["clientPhone", "requestedDate"]);

    const intakeComplete = evaluateProIntake(
      "doctor",
      { clientName: "Sarra", clientPhone: "+21622111222", requestedDate: "demain matin" },
      true,
    );
    expect(intakeComplete.complete).toBe(true);

    const arEmergency = buildMedicalEmergencyReply("derja", "arabic", "Dr. Amine");
    expect(arEmergency).toContain("190");
    expect(arEmergency).toContain("SAMU");

    const fallback = applyProDeterministicFallbacks(
      "Ahla, esmi Yassine 98 765 432 n7eb shooting produit le 20 juillet fi Tunis b 450 DT",
      {
        intent: "other",
        matchedServiceIndex: null,
        clientName: null,
        clientPhone: null,
        requestedDate: null,
        locationOrVenue: null,
        scopeSummary: null,
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
      },
      buildSeededServices("cameraman"),
      "cameraman",
    );
    expect(fallback.clientPhone).toBe("+21698765432");
    expect(fallback.requestedDate).toBe("20 juillet");
    expect(fallback.locationOrVenue).toBe("Tunis");
    expect(fallback.proposedBudgetMillimes).toBe(450_000);

    // Also test phraseProReply directly when fan message has no prices
    await expect(
      phraseProReply({
        profile: buildSeededProfile("creator"),
        service: null,
        rateDecision: {
          action: "quote_standard",
          quotedMillimes: null,
          listMillimes: null,
          floorMillimes: null,
          acceptedClientBudget: false,
          belowFloor: false,
        },
        intake: { complete: false, missingFields: [] },
        slots: {},
        language: "derja",
        script: "latin",
        clientText: "N7ebbek barcha Ines bravo!",
        isFanMessage: true,
        askedLocation: false,
      }),
    ).resolves.toBeDefined();
  });

  it("verifies all 4 presets' service templates and thousands-separated LLM replies pass the Pro Rate Firewall", async () => {
    for (const category of PRO_CATEGORIES) {
      const profile = buildSeededProfile(category);
      const services = buildSeededServices(category);
      for (const svc of services) {
        const decision = resolveProServiceOfferMillimes({
          service: svc,
          minDealBudgetMillimes: profile.min_deal_budget_millimes,
          proposedBudgetMillimes: null,
          asksDiscountOrGifted: false,
        });
        const allowed = collectAllowedProMillimes(decision);
        const template = buildProTemplateReply({
          profile,
          service: svc,
          rateDecision: decision,
          intake: { complete: true, missingFields: [] },
          slots: {
            clientName: "Sarra Ben Ali",
            clientPhone: "+21622333444",
            requestedDate: "15 juin",
            locationOrVenue: "Tunis",
            scopeSummary: svc.title,
          },
          language: "fr",
          script: "latin",
          clientText: "Je veux réserver",
          isFanMessage: false,
          askedLocation: false,
        });
        expect(passesProRateFirewall(template, allowed, decision.floorMillimes)).toBe(true);
      }
    }

    // Verify thousands-separator normalization ("1,200 DT" -> "1200DT") when 1_200_000 is allowed
    const normalized = normalizeProReplyAmounts(
      "Mon tarif pour le pack Reel est de 1,200 DT (plancher 950DT).",
      [1_200_000, 950_000],
    );
    expect(normalized).toContain("1200DT");
    expect(passesProRateFirewall(normalized, [1_200_000, 950_000], 950_000)).toBe(true);

    // Verify Arabic-script name and Derja budget parsers
    expect(extractProClientName("مرحبا، اسمي سارة بن علي نحب موعد غدوة")).toBe("سارة بن علي");
    expect(extractProClientName("Bonjour, je suis Amine Khelil pour un tournage")).toBe("Amine Khelil");
    expect(parseProBudgetMillimes("budget 1,200 DT")).toBe(1_200_000);
    expect(parseProBudgetMillimes("malyoun w nos")).toBe(1_500_000);
    expect(Object.keys(PRO_PRESETS)).toHaveLength(4);
  });
});
