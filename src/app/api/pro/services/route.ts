import { NextResponse } from "next/server";
import { z } from "zod";
import { embedConfigured, embedTexts } from "@/lib/ai/embeddings";
import { parseUuid } from "@/lib/dashboard/guard";
import { formatMillimesForChat } from "@/lib/domain/pricing";
import { requireProMerchant } from "@/lib/pro/guard";
import { getProPreset } from "@/lib/pro/presets";
import { PRO_CATEGORIES } from "@/lib/pro/types";

const serviceCreateSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    category: z.string().trim().min(1).max(60).default("general"),
    description: z.string().trim().max(1500).default(""),
    deliverables: z.array(z.string().trim().min(1).max(160)).max(15).default([]),
    duration_label: z.string().trim().max(80).default(""),
    price_millimes: z.number().int().min(0).max(500_000_000).nullable().optional(),
    price_display: z.string().trim().max(40).optional(),
    floor_millimes: z.number().int().min(0).max(500_000_000).nullable().optional(),
    pricing_mode: z.enum(["fixed", "starting_at", "custom_quote"]).default("fixed"),
    intake_questions: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
    prep_or_details_template: z.string().trim().max(1500).default(""),
    booking_url: z.string().url().max(400).nullable().optional(),
    active: z.boolean().default(true),
  })
  .refine(
    (v) =>
      v.floor_millimes == null ||
      v.price_millimes == null ||
      v.floor_millimes <= v.price_millimes,
    { message: "Floor price cannot exceed the standard price." },
  );

const loadPresetSchema = z.object({
  action: z.literal("load_preset"),
  preset: z.enum(PRO_CATEGORIES),
  replaceExisting: z.boolean().default(false),
});

const servicePatchSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(2).max(160).optional(),
    category: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(1500).optional(),
    deliverables: z.array(z.string().trim().min(1).max(160)).max(15).optional(),
    duration_label: z.string().trim().max(80).optional(),
    price_millimes: z.number().int().min(0).max(500_000_000).nullable().optional(),
    price_display: z.string().trim().max(40).optional(),
    floor_millimes: z.number().int().min(0).max(500_000_000).nullable().optional(),
    pricing_mode: z.enum(["fixed", "starting_at", "custom_quote"]).optional(),
    intake_questions: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
    prep_or_details_template: z.string().trim().max(1500).optional(),
    booking_url: z.string().url().max(400).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.floor_millimes == null ||
      v.price_millimes == null ||
      v.floor_millimes <= v.price_millimes,
    { message: "Floor price cannot exceed the standard price." },
  );

async function computeServiceEmbedding(text: string): Promise<number[] | null> {
  if (!embedConfigured() || text.trim().length < 3) return null;
  try {
    const [vec] = await embedTexts([text.slice(0, 600)]);
    return vec ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;

  const { data, error } = await gate.supabase
    .from("pro_services")
    .select(
      "id, merchant_id, title, category, description, deliverables, duration_label, price_millimes, price_display, floor_millimes, pricing_mode, intake_questions, prep_or_details_template, booking_url, active, created_at, updated_at",
    )
    .eq("merchant_id", gate.merchant.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ services: data ?? [] });
}

export async function POST(request: Request) {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const rawBody = await request.json().catch(() => null);

  // Support loading a starter Tunisia preset pack in one click
  const presetCheck = loadPresetSchema.safeParse(rawBody);
  if (presetCheck.success) {
    const pack = getProPreset(presetCheck.data.preset);
    if (presetCheck.data.replaceExisting) {
      await supabase.from("pro_services").delete().eq("merchant_id", merchant.id);
    }
    const rows = pack.services.map((s) => ({
      merchant_id: merchant.id,
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
    const { data, error } = await supabase
      .from("pro_services")
      .insert(rows)
      .select("*");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ services: data ?? [], loadedPreset: pack.id }, { status: 201 });
  }

  const parsed = serviceCreateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid service payload" },
      { status: 400 },
    );
  }
  const v = parsed.data;
  const priceDisplay =
    v.price_display?.trim() ||
    (v.price_millimes != null ? formatMillimesForChat(v.price_millimes) : "Sur devis");

  const embedding = await computeServiceEmbedding(
    `${v.title}. ${v.category}. ${v.description}. ${v.deliverables.join(", ")}`,
  );

  const insertPayload: Record<string, unknown> = {
    merchant_id: merchant.id,
    title: v.title,
    category: v.category,
    description: v.description,
    deliverables: v.deliverables,
    duration_label: v.duration_label,
    price_millimes: v.price_millimes ?? null,
    price_display: priceDisplay,
    floor_millimes: v.floor_millimes ?? null,
    pricing_mode: v.pricing_mode,
    intake_questions: v.intake_questions,
    prep_or_details_template: v.prep_or_details_template,
    booking_url: v.booking_url ?? null,
    active: v.active,
  };
  if (embedding) insertPayload.embedding = embedding;

  const { data, error } = await supabase
    .from("pro_services")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ service: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const parsed = servicePatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid service update payload" },
      { status: 400 },
    );
  }

  const { id, ...fields } = parsed.data;
  const patch: Record<string, unknown> = {
    ...fields,
    updated_at: new Date().toISOString(),
  };
  if (fields.price_millimes !== undefined && fields.price_display === undefined) {
    patch.price_display =
      fields.price_millimes != null ? formatMillimesForChat(fields.price_millimes) : "Sur devis";
  }

  if (fields.title !== undefined || fields.description !== undefined) {
    const embedding = await computeServiceEmbedding(
      `${fields.title ?? ""} ${fields.category ?? ""} ${fields.description ?? ""}`,
    );
    if (embedding) patch.embedding = embedding;
  }

  const { data, error } = await supabase
    .from("pro_services")
    .update(patch)
    .eq("id", id)
    .eq("merchant_id", merchant.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }
  return NextResponse.json({ service: data });
}

export async function DELETE(request: Request) {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!parseUuid(id)) {
    return NextResponse.json({ error: "Valid service id query parameter required" }, { status: 400 });
  }

  const { error } = await gate.supabase
    .from("pro_services")
    .delete()
    .eq("id", id)
    .eq("merchant_id", gate.merchant.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id });
}
