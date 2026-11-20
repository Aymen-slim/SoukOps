import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addContextEntry,
  CONTEXT_CATEGORIES,
  deleteContextEntry,
  listContextEntries,
  updateContextEntry,
} from "@/lib/context/workspace-context";
import { parseUuid, requireMerchant } from "@/lib/dashboard/guard";

const createSchema = z.object({
  content: z.string().trim().min(2, "Write a short context note first.").max(1000),
  category: z.enum(CONTEXT_CATEGORIES).optional(),
});

const patchSchema = z
  .object({
    id: z.string().uuid(),
    content: z.string().trim().min(2).max(1000).optional(),
    category: z.enum(CONTEXT_CATEGORIES).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (v) => v.content !== undefined || v.category !== undefined || v.active !== undefined,
    { message: "Provide content, category, or active status to update." },
  );

export async function GET() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const entries = await listContextEntries(supabase, merchant.id);

  let autoSummary: {
    track: "ecommerce" | "pro";
    primaryLabel: string;
    secondaryLabel: string;
    activeNotes: number;
  };

  if (merchant.workspace_mode === "pro") {
    const [{ count: serviceCount }, { data: profile }] = await Promise.all([
      supabase
        .from("pro_services")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchant.id)
        .eq("active", true),
      supabase
        .from("pro_profiles")
        .select("style_samples")
        .eq("merchant_id", merchant.id)
        .maybeSingle(),
    ]);
    const sampleCount = Array.isArray((profile as { style_samples?: unknown } | null)?.style_samples)
      ? ((profile as { style_samples: unknown[] }).style_samples.length)
      : 0;
    autoSummary = {
      track: "pro",
      primaryLabel: `${serviceCount ?? 0} active service${(serviceCount ?? 0) === 1 ? "" : "s"}`,
      secondaryLabel: `${sampleCount} style sample${sampleCount === 1 ? "" : "s"}`,
      activeNotes: entries.filter((e) => e.active).length,
    };
  } else {
    const [{ count: productCount }, { count: feeCount }] = await Promise.all([
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchant.id)
        .eq("active", true),
      supabase
        .from("delivery_fees")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchant.id),
    ]);
    autoSummary = {
      track: "ecommerce",
      primaryLabel: `${productCount ?? 0} catalog product${(productCount ?? 0) === 1 ? "" : "s"}`,
      secondaryLabel: `${feeCount ?? 0} delivery zone${(feeCount ?? 0) === 1 ? "" : "s"}`,
      activeNotes: entries.filter((e) => e.active).length,
    };
  }

  return NextResponse.json({
    entries,
    workspaceMode: merchant.workspace_mode,
    proCategory: merchant.pro_category,
    autoSummary,
  });
}

export async function POST(request: Request) {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid context note." },
      { status: 400 },
    );
  }

  try {
    const entry = await addContextEntry(gate.supabase, gate.merchant.id, parsed.data);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save context note." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid context update." },
      { status: 400 },
    );
  }

  try {
    const entry = await updateContextEntry(gate.supabase, gate.merchant.id, parsed.data);
    if (!entry) return NextResponse.json({ error: "Context note not found." }, { status: 404 });
    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update context note." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!parseUuid(id)) {
    return NextResponse.json({ error: "Valid context note id required." }, { status: 400 });
  }

  try {
    await deleteContextEntry(gate.supabase, gate.merchant.id, id);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete context note." },
      { status: 500 },
    );
  }
}
