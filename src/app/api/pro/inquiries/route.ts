import { NextResponse } from "next/server";
import { z } from "zod";
import { channelAdapter } from "@/lib/channels";
import { formatMillimesForChat } from "@/lib/domain/pricing";
import { logEvent } from "@/lib/pipeline/events";
import { requireProMerchant } from "@/lib/pro/guard";
import { buildProLocationPinUrl } from "@/lib/pro/style-prompt";

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["discussing", "details_sent", "needs_approval", "confirmed", "declined"]).optional(),
  sendDetailsToClient: z.boolean().optional(),
  customMessage: z.string().trim().min(1).max(2000).optional(),
});

export async function GET(request: Request) {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");

  let query = supabase
    .from("service_inquiries")
    .select(
      "id, merchant_id, conversation_id, customer_id, service_id, client_name, client_phone, requested_date, location_text, budget_millimes, scope_summary, extracted_details, status, ai_summary, created_at, updated_at",
    )
    .eq("merchant_id", merchant.id)
    .order("updated_at", { ascending: false })
    .limit(60);

  if (
    statusFilter &&
    ["discussing", "details_sent", "needs_approval", "confirmed", "declined"].includes(statusFilter)
  ) {
    query = query.eq("status", statusFilter);
  }

  const [{ data: inquiries, error }, { data: services }] = await Promise.all([
    query,
    supabase.from("pro_services").select("id, title, price_display").eq("merchant_id", merchant.id),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const svcMap = new Map(
    (services ?? []).map((s) => [String(s.id), { title: String(s.title), priceDisplay: String(s.price_display ?? "") }]),
  );

  const enriched = (inquiries ?? []).map((row) => {
    const svc = typeof row.service_id === "string" ? svcMap.get(row.service_id) : null;
    return {
      ...row,
      serviceTitle: svc?.title ?? null,
      servicePriceDisplay: svc?.priceDisplay ?? null,
    };
  });

  return NextResponse.json({ inquiries: enriched });
}

export async function PATCH(request: Request) {
  const gate = await requireProMerchant();
  if ("error" in gate) return gate.error;
  const { supabase, merchant } = gate;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid inquiry update payload" }, { status: 400 });
  }
  const { id, status, sendDetailsToClient, customMessage } = parsed.data;

  const { data: inquiry, error: fetchErr } = await supabase
    .from("service_inquiries")
    .select("id, conversation_id, service_id, budget_millimes, scope_summary, status")
    .eq("id", id)
    .eq("merchant_id", merchant.id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!inquiry) {
    return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
  }

  let detailsDispatched = false;
  let nextStatus = status ?? (inquiry.status as string);

  if (sendDetailsToClient && typeof inquiry.conversation_id === "string") {
    const [{ data: service }, { data: profile }] = await Promise.all([
      typeof inquiry.service_id === "string"
        ? supabase
            .from("pro_services")
            .select("title, price_millimes, deliverables, prep_or_details_template")
            .eq("id", inquiry.service_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("pro_profiles")
        .select("display_name, clinic_or_studio_address, location_city, lat, lng")
        .eq("merchant_id", merchant.id)
        .maybeSingle(),
    ]);

    const svc = service as {
      title?: string;
      price_millimes?: number | null;
      deliverables?: string[];
      prep_or_details_template?: string;
    } | null;

    const rateLabel =
      svc?.price_millimes != null
        ? formatMillimesForChat(svc.price_millimes)
        : typeof inquiry.budget_millimes === "number"
          ? formatMillimesForChat(inquiry.budget_millimes)
          : null;

    const messageText =
      customMessage ??
      [
        svc?.title ? `${svc.title}${rateLabel ? ` (${rateLabel})` : ""}` : String(inquiry.scope_summary ?? "Service details"),
        svc?.deliverables?.length ? `Inclus : ${svc.deliverables.join(" · ")}` : null,
        svc?.prep_or_details_template || null,
      ]
        .filter(Boolean)
        .join("\n");

    await channelAdapter.sendText(inquiry.conversation_id, messageText);

    if (profile) {
      const p = profile as {
        display_name?: string;
        clinic_or_studio_address?: string;
        location_city?: string;
        lat?: number | null;
        lng?: number | null;
      };
      const pinUrl = buildProLocationPinUrl({
        lat: typeof p.lat === "number" ? p.lat : null,
        lng: typeof p.lng === "number" ? p.lng : null,
        clinic_or_studio_address: p.clinic_or_studio_address ?? "",
        location_city: p.location_city ?? "Tunis",
      });
      if (pinUrl) {
        await channelAdapter.sendPinLink(
          inquiry.conversation_id,
          pinUrl,
          `📍 ${p.display_name ?? merchant.name}: ${p.clinic_or_studio_address || p.location_city || "Tunis"}`,
        );
      }
    }

    detailsDispatched = true;
    if (!status) nextStatus = "details_sent";
    await logEvent(inquiry.conversation_id, "pro.inquiry.details_sent", { inquiryId: id });
  }

  const { data: updated, error: updateErr } = await supabase
    .from("service_inquiries")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("merchant_id", merchant.id)
    .select("*")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    inquiry: updated,
    detailsDispatched,
  });
}
