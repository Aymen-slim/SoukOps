import { NextResponse } from "next/server";
import { z } from "zod";
import {
  completeEmbeddedSignup,
  resolveWhatsAppConfig,
  sendWhatsAppTestMessage,
  testWhatsAppConnection,
  type WhatsAppConfig,
} from "@/lib/channels/whatsapp";
import { rejectSandbox, requireMerchant } from "@/lib/dashboard/guard";
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
  const env = getServerEnv();
  return NextResponse.json({
    configured: Boolean(config),
    source: config?.source ?? null,
    phoneNumberId: config?.phoneNumberId ?? null,
    tokenSet: Boolean(config?.accessToken),
    verifyToken: config?.verifyToken ?? null,
    webhookUrl: `${base}/api/whatsapp/webhook`,
    embedded: {
      configured: Boolean(env.META_APP_ID && env.WHATSAPP_EMBEDDED_CONFIG_ID),
      appId: env.META_APP_ID ?? null,
      configId: env.WHATSAPP_EMBEDDED_CONFIG_ID ?? null,
    },
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
  const blocked = rejectSandbox(gate.merchant);
  if (blocked) return blocked;
  const body = (await request.json().catch(() => null)) as { action?: string } | null;

  if (body?.action === "connect") {
    // One-click Embedded Signup: browser sends the FB login code + the ids
    // from the session-info message; we exchange, subscribe, persist.
    const parsed = z
      .object({
        code: z.string().min(10).max(4000),
        wabaId: z.string().trim().min(5).max(40),
        phoneNumberId: z.string().trim().min(5).max(40),
      })
      .safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid Facebook response" }, { status: 400 });
    const verifyToken =
      (await resolveWhatsAppConfig(gate.supabase, gate.merchant.id))?.verifyToken ??
      `wassalha-${gate.merchant.id.slice(0, 8)}`;
    try {
      const { config, info } = await completeEmbeddedSignup({ ...parsed.data, verifyToken });
      const { error } = await gate.supabase
        .from("merchants")
        .update({
          whatsapp_phone_number_id: config.phoneNumberId,
          whatsapp_waba_id: config.wabaId,
          whatsapp_access_token: config.accessToken,
          whatsapp_verify_token: config.verifyToken,
          whatsapp_connected_at: new Date().toISOString(),
        })
        .eq("id", gate.merchant.id);
      if (error) {
        return NextResponse.json(
          {
            error: `Meta login OK but save failed (${error.message}). Apply supabase/migrations/0002_whatsapp.sql in Supabase.`,
          },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true, ...info });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "connection failed" }, { status: 502 });
    }
  }

  if (body?.action === "test") {
    const parsed = testSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid parameters" }, { status: 400 });
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
      return NextResponse.json({ error: "Enter the Phone Number ID and token, then test." }, { status: 400 });
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
        { error: err instanceof Error ? err.message : "test failed" },
        { status: 502 },
      );
    }
  }

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid WhatsApp settings" }, { status: 400 });
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
        error: `Save failed (${error.message}). First apply supabase/migrations/0002_whatsapp.sql in Supabase, or set the WHATSAPP_* variables in .env.local.`,
      },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
