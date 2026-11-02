import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { insertOut } from "./simulator";
import type { ChannelAdapter, ChannelButton } from "./types";
import { buildTokenExchangeUrl } from "./whatsapp";

/**
 * Messenger + Instagram channels: same one-click pattern as WhatsApp.
 * The seller logs in with Facebook (same Meta app), picks his Page, and we
 * store the Page access token on the merchant row (migration 0003, secret
 * key only, never returned to the browser) with env fallback. Outbound
 * mirrors every send into `messages`, then posts to the Graph API.
 * Graph failures are logged, never thrown.
 */

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export type FacebookPlatform = "messenger" | "instagram";

export interface MessengerConfig {
  pageId: string;
  pageName: string | null;
  accessToken: string;
  source: "database" | "env";
}

export interface InstagramConfig {
  igUserId: string;
  username: string | null;
  pageId: string | null;
  accessToken: string;
  source: "database" | "env";
}

type Admin = ReturnType<typeof createAdminClient>;

export async function resolveMessengerConfig(supabase: Admin, merchantId: string): Promise<MessengerConfig | null> {
  const { data, error } = await supabase
    .from("merchants")
    .select("messenger_page_id, messenger_page_name, messenger_page_token")
    .eq("id", merchantId)
    .maybeSingle();
  if (!error && data?.messenger_page_id && data?.messenger_page_token) {
    return {
      pageId: data.messenger_page_id as string,
      pageName: (data.messenger_page_name as string | null) ?? null,
      accessToken: data.messenger_page_token as string,
      source: "database",
    };
  }
  const env = getServerEnv();
  if (env.MESSENGER_PAGE_ID && env.MESSENGER_PAGE_ACCESS_TOKEN) {
    return { pageId: env.MESSENGER_PAGE_ID, pageName: null, accessToken: env.MESSENGER_PAGE_ACCESS_TOKEN, source: "env" };
  }
  return null;
}

export async function resolveInstagramConfig(supabase: Admin, merchantId: string): Promise<InstagramConfig | null> {
  const { data, error } = await supabase
    .from("merchants")
    .select("instagram_business_id, instagram_username, instagram_page_id, instagram_page_token")
    .eq("id", merchantId)
    .maybeSingle();
  if (!error && data?.instagram_business_id && data?.instagram_page_token) {
    return {
      igUserId: data.instagram_business_id as string,
      username: (data.instagram_username as string | null) ?? null,
      pageId: (data.instagram_page_id as string | null) ?? null,
      accessToken: data.instagram_page_token as string,
      source: "database",
    };
  }
  const env = getServerEnv();
  if (env.INSTAGRAM_BUSINESS_ID && env.INSTAGRAM_ACCESS_TOKEN) {
    return { igUserId: env.INSTAGRAM_BUSINESS_ID, username: null, pageId: null, accessToken: env.INSTAGRAM_ACCESS_TOKEN, source: "env" };
  }
  return null;
}

/** Webhook handshake token for the Page/Instagram objects: dedicated env,
 * else the merchant's WhatsApp verify token, else the WhatsApp env value. */
export async function resolveFacebookVerifyToken(supabase: Admin, merchantId: string): Promise<string | null> {
  const env = getServerEnv();
  if (env.FACEBOOK_VERIFY_TOKEN) return env.FACEBOOK_VERIFY_TOKEN;
  const { data } = await supabase
    .from("merchants")
    .select("whatsapp_verify_token")
    .eq("id", merchantId)
    .maybeSingle()
    .then((r) => r, () => ({ data: null }));
  return (data?.whatsapp_verify_token as string | null) ?? env.WHATSAPP_VERIFY_TOKEN ?? null;
}

// ------------------------------------------------------------------- OAuth

export const FACEBOOK_PLATFORM_SCOPES: Record<FacebookPlatform, string> = {
  messenger: "pages_messaging,pages_show_list,pages_manage_metadata,pages_read_engagement",
  instagram: "instagram_basic,instagram_manage_messages,pages_show_list,pages_manage_metadata,pages_read_engagement",
};

/** Server-side OAuth dialog URL. No FB JS SDK (it refuses http pages);
 * the browser just navigates to facebook.com and Meta redirects back to
 * our callback. `http://localhost` redirect URIs are allowed by Meta. */
export function buildOAuthDialogUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
  scope?: string;
  configId?: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    state: input.state,
    response_type: "code",
  });
  if (input.configId) {
    params.set("config_id", input.configId);
    params.set("override_default_response_type", "true");
  } else if (input.scope) {
    params.set("scope", input.scope);
  }
  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

export interface FacebookPageOption {
  pageId: string;
  pageName: string;
  instagram: { id: string; username: string | null } | null;
}

const pagesResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      access_token: z.string(),
      instagram_business_account: z.object({ id: z.string(), username: z.string().optional() }).optional(),
    }),
  ),
});

export interface PendingFacebookPages {
  pages: Array<FacebookPageOption & { accessToken: string }>;
}

/** Exchanges the FB login code and lists the seller's Pages (+ linked IG).
 * Page tokens stay server-side: the caller caches them in `ai_cache` and
 * only page names/usernames ever reach the browser. */
export async function exchangeCodeForPages(code: string): Promise<PendingFacebookPages> {
  const env = getServerEnv();
  const appId = env.META_APP_ID;
  const appSecret = env.META_APP_SECRET ?? env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Facebook login not configured: META_APP_ID / META_APP_SECRET missing in .env.local.");
  }
  const redirectUri = `${env.APP_BASE_URL.replace(/\/$/, "")}/api/meta/oauth/callback`;
  const tokenRes = await fetch(buildTokenExchangeUrl(appId, appSecret, code, redirectUri));
  const tokenBody = (await tokenRes.json().catch(() => null)) as { access_token?: string; error?: { message?: string } } | null;
  if (!tokenRes.ok || !tokenBody?.access_token) {
    throw new Error(`Facebook code exchange failed: ${tokenBody?.error?.message ?? tokenRes.status}`);
  }
  const pagesRes = await fetch(
    `${GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=50`,
    { headers: { Authorization: `Bearer ${tokenBody.access_token}` } },
  );
  const pagesBody = await pagesRes.json().catch(() => null);
  if (!pagesRes.ok) {
    const message = (pagesBody as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(`Could not list Facebook Pages: ${message ?? pagesRes.status}`);
  }
  const parsed = pagesResponseSchema.parse(pagesBody);
  return {
    pages: parsed.data.map((page) => ({
      pageId: page.id,
      pageName: page.name,
      accessToken: page.access_token,
      instagram: page.instagram_business_account
        ? { id: page.instagram_business_account.id, username: page.instagram_business_account.username ?? null }
        : null,
    })),
  };
}

/** Subscribes this app to the Page's messaging webhook (Messenger). For
 * Instagram, webhook fields are subscribed on the app's Instagram object;
 * the Page subscription with `messages` covers Messenger events. */
export async function subscribePageWebhook(pageId: string, pageToken: string): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}/${pageId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pageToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subscribed_fields: ["messages", "messaging_postbacks"] }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`Page webhook subscription failed: ${body?.error?.message ?? res.status}`);
  }
}

// ------------------------------------------------------------- webhook bits

export interface InboundFacebookMessage {
  externalId: string;
  platformUserId: string;
  pageId: string;
  platform: FacebookPlatform;
  kind: "text" | "button" | "image" | "audio";
  body: string | null;
  attachmentUrl: string | null;
}

const messagingEventSchema = z
  .object({
    sender: z.object({ id: z.string() }),
    message: z
      .object({
        mid: z.string(),
        is_echo: z.boolean().optional(),
        text: z.string().optional(),
        quick_reply: z.object({ payload: z.string().optional() }).optional(),
        attachments: z
          .array(z.object({ type: z.string(), payload: z.object({ url: z.string().optional() }).optional() }))
          .optional(),
      })
      .optional(),
    postback: z.object({ mid: z.string().optional(), title: z.string().optional(), payload: z.string().optional() }).optional(),
  })
  .passthrough();

/** Extracts buyer messages from a Page (`messenger`) or Instagram webhook
 * payload. Echoes, delivery/read receipts and junk are skipped. */
export function parseFacebookWebhook(payload: unknown): InboundFacebookMessage[] {
  const root = payload as { object?: string; entry?: Array<{ id?: string; messaging?: unknown[] }> } | null;
  const platform: FacebookPlatform | null =
    root?.object === "page" ? "messenger" : root?.object === "instagram" ? "instagram" : null;
  if (!platform || !root?.entry) return [];
  const out: InboundFacebookMessage[] = [];
  for (const entry of root.entry) {
    const pageId = entry.id ?? "";
    for (const raw of entry.messaging ?? []) {
      const parsed = messagingEventSchema.safeParse(raw);
      if (!parsed.success) continue;
      const event = parsed.data;
      const base = { platformUserId: event.sender.id, pageId, platform, attachmentUrl: null };
      if (event.message && !event.message.is_echo) {
        const attachment = event.message.attachments?.[0];
        if (event.message.text) {
          out.push({
            ...base,
            externalId: event.message.mid,
            kind: event.message.quick_reply ? "button" : "text",
            body: event.message.text,
          });
        } else if (attachment?.type === "image" && attachment.payload?.url) {
          out.push({ ...base, externalId: event.message.mid, kind: "image", body: null, attachmentUrl: attachment.payload.url });
        } else if ((attachment?.type === "audio" || attachment?.type === "voice") && attachment.payload?.url) {
          out.push({ ...base, externalId: event.message.mid, kind: "audio", body: null, attachmentUrl: attachment.payload.url });
        }
      } else if (event.postback?.title) {
        out.push({
          ...base,
          externalId: event.postback.mid ?? `postback:${event.sender.id}:${event.postback.payload ?? event.postback.title}`,
          kind: "button",
          body: event.postback.title,
        });
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ sending

export function buildQuickReplies(buttons: ChannelButton[]) {
  return buttons.slice(0, 3).map((b, i) => ({
    content_type: "text",
    title: b.title.length <= 20 ? b.title : `${b.title.slice(0, 19)}…`,
    payload: b.id || `btn_${i}`,
  }));
}

async function graphPost(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`Graph send ${res.status}: ${data?.error?.message ?? "unknown"}`);
  }
}

async function recipientFor(
  supabase: Admin,
  conversationId: string,
  platform: FacebookPlatform,
): Promise<{ to: string; token: string; igUserId?: string; pageId?: string } | null> {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("merchant_id, customer_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation?.customer_id) return null;
  const merchantId = conversation.merchant_id as string;
  const column = platform === "messenger" ? "messenger_psid" : "instagram_scoped_id";
  const { data: customer } = await supabase
    .from("customers")
    .select("messenger_psid, instagram_scoped_id")
    .eq("id", conversation.customer_id as string)
    .maybeSingle();
  const to = (customer?.[column] as string | null | undefined) ?? null;
  if (!to) return null;
  if (platform === "messenger") {
    const config = await resolveMessengerConfig(supabase, merchantId);
    return config ? { to, token: config.accessToken, pageId: config.pageId } : null;
  }
  const config = await resolveInstagramConfig(supabase, merchantId);
  return config ? { to, token: config.accessToken, igUserId: config.igUserId } : null;
}

async function signedMediaUrl(supabase: Admin, mediaPath: string): Promise<string | null> {
  const prefixed = mediaPath.match(/^([a-z-]+):(.+)$/);
  const bucket = prefixed ? prefixed[1] : "buyer-media";
  const path = prefixed ? prefixed[2] : mediaPath;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

function makeFacebookAdapter(platform: FacebookPlatform): ChannelAdapter {
  async function send(conversationId: string, build: (to: string) => unknown, needsIgPath: boolean): Promise<void> {
    try {
      const supabase = createAdminClient();
      const recipient = await recipientFor(supabase, conversationId, platform);
      if (!recipient) return;
      const url =
        platform === "instagram" && needsIgPath
          ? `${GRAPH_BASE}/${recipient.igUserId}/messages?access_token=${recipient.token}`
          : `${GRAPH_BASE}/me/messages?access_token=${recipient.token}`;
      await graphPost(url, build(recipient.to));
    } catch (err) {
      console.error(`[${platform}] send failed for ${conversationId}:`, err instanceof Error ? err.message : err);
    }
  }

  return {
    async sendText(conversationId, text) {
      await insertOut(conversationId, "text", text);
      await send(conversationId, (to) => ({ recipient: { id: to }, message: { text } }), true);
    },
    async sendImage(conversationId, mediaPath, caption) {
      await insertOut(conversationId, "image", caption ?? "", mediaPath);
      const supabase = createAdminClient();
      const link = await signedMediaUrl(supabase, mediaPath).catch(() => null);
      if (!link) return;
      if (caption) await send(conversationId, (to) => ({ recipient: { id: to }, message: { text: caption } }), true);
      await send(
        conversationId,
        (to) => ({ recipient: { id: to }, message: { attachment: { type: "image", payload: { url: link, is_reusable: false } } } }),
        true,
      );
    },
    async sendButtons(conversationId, text, buttons) {
      await insertOut(conversationId, "buttons", JSON.stringify({ text, buttons }));
      await send(
        conversationId,
        (to) => ({ recipient: { id: to }, message: { text, quick_replies: buildQuickReplies(buttons) } }),
        true,
      );
    },
    async sendLocationRequest(conversationId, text) {
      await insertOut(conversationId, "location_request", text);
      await send(conversationId, (to) => ({ recipient: { id: to }, message: { text } }), true);
    },
    async sendPinLink(conversationId, url, text) {
      await insertOut(conversationId, "pin_link", JSON.stringify({ text, url }));
      await send(conversationId, (to) => ({ recipient: { id: to }, message: { text: `${text}\n${url}` } }), true);
    },
  };
}

export const messengerAdapter: ChannelAdapter = makeFacebookAdapter("messenger");
export const instagramAdapter: ChannelAdapter = makeFacebookAdapter("instagram");
