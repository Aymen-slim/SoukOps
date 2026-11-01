import { NextResponse } from "next/server";
import { z } from "zod";
import {
  resolveWhatsAppConfig,
  sendWhatsAppTestMessage,
  testWhatsAppConnection,
  type WhatsAppConfig,
} from "@/lib/channels/whatsapp";
import { requireMerchant } from "@/lib/dashboard/guard";
import { getServerEnv } from "@/lib/env";

/**
 * Settings > Link WhatsApp backend. The access token is write-only: POST
 * accepts it, GET never returns it (only `tokenSet`). Config resolution is
 * merchants columns (migration 0002) with env fallback — see whatsapp.ts.
 */

export async function GET() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const config = await resolveWhatsAppConfig(gate.supabase, gate.merchant.id);
  const base = getServerEnv().APP_BASE_URL.replace(/\/$/, "");
  return NextResponse.json({
    configured: Boolean(config),
    source: config?.source ?? null,
    phoneNumberId: config?.phoneNumberId ?? null,
    tokenSet: Boolean(config?.accessToken),
    verifyToken: config?.verifyToken ?? null,
    webhookUrl: `${base}/api/whatsapp/webhook`,
  });
}

const saveSchema = z.object({
  phoneNumberId: z.string().trim().min(5).max(40),
  wabaId: z.string().trim().max(40).nullable().optional(),
  accessToken: z.string().trim().min(10).max(2000).optional(),
  verifyToken: z.string().trim().min(4).max(200),
});

const testSchema = z.object({
  phoneNumberId: z.string().trim().min(5).max(40).optional(),
  accessToken: z.string().trim().min(10).max(2000).optional(),
  testRecipient: z.string().trim().max(20).optional(),
});

export async function POST(request: Request) {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const body = (await request.json().catch(() => null)) as { action?: string } | null;

  if (body?.action === "test") {
    const parsed = testSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "paramètres invalides" }, { status: 400 });
    const saved = await resolveWhatsAppConfig(gate.supabase, gate.merchant.id);
    const config: WhatsAppConfig | null =
      parsed.data.phoneNumberId && parsed.data.accessToken
        ? {
            phoneNumberId: parsed.data.phoneNumberId,
            accessToken: parsed.data.accessToken,
            wabaId: saved?.wabaId ?? null,
            verifyToken: saved?.verifyToken ?? null,
            source: "database",
          }
        : saved;
    if (!config) {
      return NextResponse.json({ error: "Renseignez le Phone Number ID et le token, puis testez." }, { status: 400 });
    }
    try {
      const info = await testWhatsAppConnection(config);
      let testSent = false;
      const recipient = parsed.data.testRecipient?.replace(/\D/g, "") ?? "";
      if (recipient) {
        await sendWhatsAppTestMessage(config, recipient);
        testSent = true;
      }
      return NextResponse.json({ ok: true, ...info, testSent });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "test impossible" },
        { status: 502 },
      );
    }
  }

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "réglages WhatsApp invalides" }, { status: 400 });
  const update: Record<string, unknown> = {
    whatsapp_phone_number_id: parsed.data.phoneNumberId,
    whatsapp_waba_id: parsed.data.wabaId || null,
    whatsapp_verify_token: parsed.data.verifyToken,
    whatsapp_connected_at: new Date().toISOString(),
  };
  if (parsed.data.accessToken) update.whatsapp_access_token = parsed.data.accessToken;
  const { error } = await gate.supabase.from("merchants").update(update).eq("id", gate.merchant.id);
  if (error) {
    return NextResponse.json(
      {
        error: `Sauvegarde impossible (${error.message}). Appliquez d'abord supabase/migrations/0002_whatsapp.sql dans Supabase, ou renseignez les variables WHATSAPP_* dans .env.local.`,
      },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
