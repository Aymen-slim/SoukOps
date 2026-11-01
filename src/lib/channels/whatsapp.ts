import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { insertOut } from "./simulator";
import type { ChannelAdapter, ChannelButton } from "./types";

/**
 * WhatsApp Cloud API channel (stretch). The seller links his own number in
 * Settings > Link WhatsApp: credentials live on the merchant row (migration
 * 0002, secret key only, never sent back to the browser) with env fallback.
 * Outbound mirrors every send into `messages` (dashboard stays complete),
 * then posts to the Graph API. Graph failures are logged, never thrown —
 * a dead token must not kill the turn pipeline.
 */

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export interface WhatsAppConfig {
  phoneNumberId: string;
  wabaId: string | null;
  accessToken: string;
  verifyToken: string | null;
  source: "database" | "env";
}

type Admin = ReturnType<typeof createAdminClient>;

export function envWhatsAppConfig(): WhatsAppConfig | null {
  const env = getServerEnv();
  if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) return null;
  return {
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    wabaId: env.WHATSAPP_WABA_ID ?? null,
    accessToken: env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? null,
    source: "env",
  };
}

/** DB-saved config (Settings wizard) wins; env is the fallback. A missing
 * migration 0002 makes the select fail and we fall back silently. */
export async function resolveWhatsAppConfig(supabase: Admin, merchantId: string): Promise<WhatsAppConfig | null> {
  const { data, error } = await supabase
    .from("merchants")
    .select("whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token, whatsapp_verify_token")
    .eq("id", merchantId)
    .maybeSingle();
  if (!error && data?.whatsapp_phone_number_id && data?.whatsapp_access_token) {
    return {
      phoneNumberId: data.whatsapp_phone_number_id as string,
      wabaId: (data.whatsapp_waba_id as string | null) ?? null,
      accessToken: data.whatsapp_access_token as string,
      verifyToken: (data.whatsapp_verify_token as string | null) ?? null,
      source: "database",
    };
  }
  return envWhatsAppConfig();
}

// ---------------------------------------------------------------- pure bits

export interface InboundWhatsAppMessage {
  externalId: string;
  waId: string;
  profileName: string | null;
  kind: "text" | "button" | "location" | "image" | "audio";
  body: string | null;
  mediaId: string | null;
}

const webhookMessageSchema = z
  .object({
    from: z.string(),
    id: z.string(),
    type: z.string(),
    text: z.object({ body: z.string() }).partial().optional(),
    button: z.object({ text: z.string() }).partial().optional(),
    interactive: z
      .object({
        button_reply: z.object({ id: z.string().optional(), title: z.string().optional() }).optional(),
        list_reply: z.object({ id: z.string().optional(), title: z.string().optional() }).optional(),
      })
      .optional(),
    location: z.object({ latitude: z.number(), longitude: z.number(), name: z.string().optional() }).optional(),
    image: z.object({ id: z.string(), caption: z.string().optional() }).optional(),
    audio: z.object({ id: z.string() }).optional(),
    voice: z.object({ id: z.string() }).optional(),
  })
  .passthrough();

/** Extracts buyer messages from a Cloud API webhook payload. Statuses and
 * other change types yield nothing. Unknown shapes are skipped, not thrown. */
export function parseWebhookPayload(payload: unknown): InboundWhatsAppMessage[] {
  const out: InboundWhatsAppMessage[] = [];
  const root = payload as { entry?: Array<{ changes?: Array<{ value?: unknown }> }> } | null;
  for (const entry of root?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value as {
        messages?: unknown[];
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
      } | null;
      if (!value?.messages?.length) continue;
      const names = new Map(
        (value.contacts ?? []).map((c) => [c.wa_id ?? "", c.profile?.name ?? null] as const),
      );
      for (const raw of value.messages) {
        const parsed = webhookMessageSchema.safeParse(raw);
        if (!parsed.success) continue;
        const m = parsed.data;
        const base = { externalId: m.id, waId: m.from, profileName: names.get(m.from) ?? null, mediaId: null };
        if (m.type === "text" && m.text?.body) {
          out.push({ ...base, kind: "text", body: m.text.body });
        } else if (m.type === "button" && m.button?.text) {
          out.push({ ...base, kind: "button", body: m.button.text });
        } else if (m.type === "interactive") {
          const title = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;
          if (title) out.push({ ...base, kind: "button", body: title });
        } else if (m.type === "location" && m.location) {
          out.push({
            ...base,
            kind: "location",
            body: `location:${m.location.latitude},${m.location.longitude}${m.location.name ? ` (${m.location.name})` : ""}`,
          });
        } else if (m.type === "image" && m.image?.id) {
          out.push({ ...base, kind: "image", body: m.image.caption ?? null, mediaId: m.image.id });
        } else if ((m.type === "audio" && m.audio?.id) || (m.type === "voice" && m.voice?.id)) {
          out.push({ ...base, kind: "audio", body: null, mediaId: (m.audio?.id ?? m.voice?.id) as string });
        }
      }
    }
  }
  return out;
}

/** `X-Hub-Signature-256: sha256=<hmac>` check. No app secret -> accepted
 * (verify-token handshake still gates the endpoint at subscription time). */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string | undefined): boolean {
  if (!appSecret) return true;
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const given = signatureHeader.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export function truncateButtonTitle(title: string): string {
  return title.length <= 20 ? title : `${title.slice(0, 19)}…`;
}

export function buildTextPayload(to: string, text: string) {
  return { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: text } };
}

export function buildButtonsPayload(to: string, text: string, buttons: ChannelButton[]) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "reply_button",
      body: { text },
      action: {
        buttons: buttons.slice(0, 3).map((b, i) => ({
          type: "reply",
          reply: { id: b.id || `btn_${i}`, title: truncateButtonTitle(b.title) },
        })),
      },
    },
  };
}

export function buildImagePayload(to: string, link: string, caption?: string) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "image",
    image: { link, ...(caption ? { caption } : {}) },
  };
}

export function buildLocationRequestPayload(to: string, text: string) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: { type: "location_request_message", body: { text }, action: { name: "send_location" } },
  };
}

// ------------------------------------------------------------- Graph client

async function graph(config: WhatsAppConfig, path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) throw new Error(`WhatsApp Graph ${res.status}: ${body?.error?.message ?? "unknown error"}`);
  return body;
}

// ------------------------------------------------------- Embedded Signup

/** Session-info message the Embedded Signup popup posts back to the opener. */
export function parseEmbeddedSignupMessage(data: unknown): { wabaId: string; phoneNumberId: string } | null {
  const msg = data as { type?: string; event?: string; data?: { waba_id?: unknown; phone_number_id?: unknown } } | null;
  if (!msg || msg.type !== "WA_EMBEDDED_SIGNUP" || msg.event !== "FINISH") return null;
  const wabaId = typeof msg.data?.waba_id === "string" ? msg.data.waba_id : null;
  const phoneNumberId = typeof msg.data?.phone_number_id === "string" ? msg.data.phone_number_id : null;
  return wabaId && phoneNumberId ? { wabaId, phoneNumberId } : null;
}

export function buildTokenExchangeUrl(appId: string, appSecret: string, code: string): string {
  const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
  return `${GRAPH_BASE}/oauth/access_token?${params.toString()}`;
}

export interface EmbeddedSignupResult {
  config: WhatsAppConfig;
  info: WhatsAppConnectionInfo;
}

/**
 * One-click link, server half: exchange the Facebook Login code for a
 * business access token, subscribe this app to the seller's WABA webhook,
 * and prove the token by reading the phone number. The caller persists the
 * returned config; the token never goes back to the browser.
 */
export async function completeEmbeddedSignup(input: {
  code: string;
  wabaId: string;
  phoneNumberId: string;
  verifyToken: string;
}): Promise<EmbeddedSignupResult> {
  const env = getServerEnv();
  const appId = env.META_APP_ID;
  const appSecret = env.META_APP_SECRET ?? env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Embedded Signup not configured: META_APP_ID / META_APP_SECRET missing in .env.local.");
  }
  const res = await fetch(buildTokenExchangeUrl(appId, appSecret, input.code));
  const body = (await res.json().catch(() => null)) as { access_token?: string; error?: { message?: string } } | null;
  if (!res.ok || !body?.access_token) {
    throw new Error(`Facebook code exchange failed: ${body?.error?.message ?? res.status}`);
  }
  const config: WhatsAppConfig = {
    phoneNumberId: input.phoneNumberId,
    wabaId: input.wabaId,
    accessToken: body.access_token,
    verifyToken: input.verifyToken,
    source: "database",
  };
  await graph(config, `/${input.wabaId}/subscribed_apps`, { method: "POST", body: JSON.stringify({}) });
  const info = await testWhatsAppConnection(config);
  return { config, info };
}

export interface WhatsAppConnectionInfo {
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
}

/** One-click proof the pasted credentials work (Settings wizard). */
export async function testWhatsAppConnection(config: WhatsAppConfig): Promise<WhatsAppConnectionInfo> {
  const data = (await graph(
    config,
    `/${config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
  )) as { display_phone_number?: string; verified_name?: string; quality_rating?: string } | null;
  return {
    displayPhoneNumber: data?.display_phone_number ?? null,
    verifiedName: data?.verified_name ?? null,
    qualityRating: data?.quality_rating ?? null,
  };
}

export async function sendWhatsAppTestMessage(config: WhatsAppConfig, toDigits: string): Promise<void> {
  await graph(config, `/${config.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify(buildTextPayload(toDigits, "Wassalha: your WhatsApp is connected ✅")),
  });
}

async function downloadMedia(config: WhatsAppConfig, mediaId: string): Promise<{ buffer: Buffer; mime: string }> {
  const meta = (await graph(config, `/${mediaId}`)) as { url?: string; mime_type?: string } | null;
  if (!meta?.url) throw new Error("WhatsApp media URL missing");
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${config.accessToken}` } });
  if (!res.ok) throw new Error(`WhatsApp media download failed: ${res.status}`);
  return { buffer: Buffer.from(await res.arrayBuffer()), mime: meta.mime_type ?? "application/octet-stream" };
}

// ------------------------------------------------------------------- adapter

async function recipientFor(supabase: Admin, conversationId: string): Promise<{ to: string; config: WhatsAppConfig } | null> {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("merchant_id, customer_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation?.customer_id) return null;
  const config = await resolveWhatsAppConfig(supabase, conversation.merchant_id as string);
  if (!config) return null;
  const { data: customer } = await supabase
    .from("customers")
    .select("wa_id, phone")
    .eq("id", conversation.customer_id as string)
    .maybeSingle();
  const raw = (customer?.wa_id as string | null) ?? (customer?.phone as string | null);
  const to = raw?.replace(/\D/g, "") ?? "";
  return to ? { to, config } : null;
}

async function sendGraph(supabase: Admin, conversationId: string, payloadFor: (to: string) => unknown): Promise<void> {
  try {
    const recipient = await recipientFor(supabase, conversationId);
    if (!recipient) return;
    await graph(recipient.config, `/${recipient.config.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify(payloadFor(recipient.to)),
    });
  } catch (err) {
    console.error(`[whatsapp] send failed for ${conversationId}:`, err instanceof Error ? err.message : err);
  }
}

async function signedMediaUrl(supabase: Admin, mediaPath: string): Promise<string | null> {
  const prefixed = mediaPath.match(/^([a-z-]+):(.+)$/);
  const bucket = prefixed ? prefixed[1] : "buyer-media";
  const path = prefixed ? prefixed[2] : mediaPath;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export const whatsappAdapter: ChannelAdapter = {
  async sendText(conversationId, text) {
    const supabase = createAdminClient();
    await insertOut(conversationId, "text", text);
    await sendGraph(supabase, conversationId, (to) => buildTextPayload(to, text));
  },
  async sendImage(conversationId, mediaPath, caption) {
    const supabase = createAdminClient();
    await insertOut(conversationId, "image", caption ?? "", mediaPath);
    const link = await signedMediaUrl(supabase, mediaPath).catch(() => null);
    if (!link) return;
    await sendGraph(supabase, conversationId, (to) => buildImagePayload(to, link, caption));
  },
  async sendButtons(conversationId, text, buttons) {
    const supabase = createAdminClient();
    await insertOut(conversationId, "buttons", JSON.stringify({ text, buttons }));
    await sendGraph(supabase, conversationId, (to) => buildButtonsPayload(to, text, buttons));
  },
  async sendLocationRequest(conversationId, text) {
    const supabase = createAdminClient();
    await insertOut(conversationId, "location_request", text);
    await sendGraph(supabase, conversationId, (to) => buildLocationRequestPayload(to, text));
  },
  async sendPinLink(conversationId, url, text) {
    const supabase = createAdminClient();
    await insertOut(conversationId, "pin_link", JSON.stringify({ text, url }));
    await sendGraph(supabase, conversationId, (to) => buildTextPayload(to, `${text}\n${url}`));
  },
};

export { downloadMedia as downloadWhatsAppMedia };
