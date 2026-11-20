import { NextResponse } from "next/server";
import { z } from "zod";
import { getDemoMerchant, getShopBySlug } from "@/lib/dashboard/merchant";
import { getProPreset } from "@/lib/pro/presets";
import { seedProWorkspace } from "@/lib/pro/seed";
import { PRO_CATEGORIES, WORKSPACE_MODES, type ProCategory } from "@/lib/pro/types";
import { simulatorGuard } from "@/lib/security/simulatorGuard";
import { getPersona } from "@/lib/sim/personas";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  persona: z.enum(["new", "returning", "bad"]).default("new"),
  slug: z.string().trim().min(2).max(48).nullable().optional(),
  track: z.enum(WORKSPACE_MODES).default("ecommerce"),
  preset: z.enum(PRO_CATEGORIES).optional(),
});

async function getOrCreatePublicProDemoMerchant(
  supabase: ReturnType<typeof createAdminClient>,
  presetCategory: ProCategory,
): Promise<{ id: string; name: string; slug: string }> {
  const demoSlug = `pro-demo-${presetCategory}`;
  const existing = await getShopBySlug(supabase, demoSlug);
  if (existing) {
    await seedProWorkspace(supabase, existing.id, presetCategory, existing.name);
    return { id: existing.id, name: existing.name, slug: demoSlug };
  }

  const preset = getProPreset(presetCategory);
  const { data: created, error } = await supabase
    .from("merchants")
    .insert({
      name: preset.defaultDisplayName,
      slug: demoSlug,
      is_sandbox: true,
      workspace_mode: "pro",
      pro_category: presetCategory,
      reply_language: "derja",
      ai_instructions: "",
    })
    .select("id, name")
    .single();

  if (error || !created) {
    throw new Error(
      `Could not initialize Pro demo merchant (${error?.message ?? "unknown"}). Ensure migration 0007 is applied.`,
    );
  }
  const merchantId = String(created.id);
  await seedProWorkspace(supabase, merchantId, presetCategory, preset.defaultDisplayName);
  return { id: merchantId, name: String(created.name), slug: demoSlug };
}

/** Creates a simulator conversation for E-Commerce or Creator & Pro tracks. */
export async function POST(request: Request) {
  const blocked = simulatorGuard(request, "sim-conversations", 30);
  if (blocked) return blocked;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const supabase = createAdminClient();
  const slug = parsed.data.slug ?? null;
  const track = parsed.data.track;
  const presetCategory: ProCategory = parsed.data.preset ?? "creator";

  // Pro Track Simulation (Doctor / Cameraman / Creator / Custom)
  if (track === "pro" && !slug) {
    let proMerchant: { id: string; name: string; slug: string };
    try {
      proMerchant = await getOrCreatePublicProDemoMerchant(supabase, presetCategory);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Pro demo unavailable" },
        { status: 500 },
      );
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({ merchant_id: proMerchant.id, name: null, phone: null })
      .select("id")
      .single();
    if (customerError || !customer) {
      return NextResponse.json(
        { error: `customer create failed: ${customerError?.message}` },
        { status: 500 },
      );
    }

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .insert({ merchant_id: proMerchant.id, customer_id: customer.id, channel: "simulator" })
      .select("id")
      .single();
    if (convError || !conversation) {
      return NextResponse.json(
        { error: `conversation create failed: ${convError?.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      conversationId: conversation.id,
      persona: "new",
      customerName: null,
      phone: null,
      track: "pro",
      preset: presetCategory,
      displayName: proMerchant.name,
    });
  }

  const merchant = slug ? await getShopBySlug(supabase, slug) : await getDemoMerchant(supabase);
  if (!merchant) {
    return NextResponse.json(
      { error: "no merchant seeded (run npm run seed:catalog)" },
      { status: slug ? 404 : 500 },
    );
  }

  // A shop's own demo stores the buyer the seller types in chat, not a preset persona.
  if (slug) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({ merchant_id: merchant.id, name: null, phone: null })
      .select("id")
      .single();
    if (customerError || !customer) {
      return NextResponse.json(
        { error: `customer create failed: ${customerError?.message}` },
        { status: 500 },
      );
    }
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .insert({ merchant_id: merchant.id, customer_id: customer.id, channel: "simulator" })
      .select("id")
      .single();
    if (convError || !conversation) {
      return NextResponse.json(
        { error: `conversation create failed: ${convError?.message}` },
        { status: 500 },
      );
    }
    return NextResponse.json({
      conversationId: conversation.id,
      persona: "new",
      customerName: null,
      phone: null,
      track: merchant.workspace_mode,
      preset: merchant.pro_category,
    });
  }

  const persona = getPersona(parsed.data.persona);
  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("merchant_id", merchant.id)
    .eq("phone", persona.phone)
    .maybeSingle();

  let customerId = existingCustomer?.id as string | undefined;
  if (!customerId) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({ merchant_id: merchant.id, name: persona.customerName, phone: persona.phone })
      .select("id")
      .single();
    if (customerError || !customer) {
      return NextResponse.json(
        { error: `customer create failed: ${customerError?.message}` },
        { status: 500 },
      );
    }
    customerId = customer.id;
  }

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({ merchant_id: merchant.id, customer_id: customerId, channel: "simulator" })
    .select("id")
    .single();
  if (convError || !conversation) {
    return NextResponse.json(
      { error: `conversation create failed: ${convError?.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    conversationId: conversation.id,
    persona: persona.id,
    customerName: persona.customerName,
    phone: persona.phone,
    track: "ecommerce",
  });
}
