import { NextResponse } from "next/server";
import { z } from "zod";
import {
  exchangeCodeForPages,
  resolveInstagramConfig,
  resolveMessengerConfig,
  subscribePageWebhook,
  type FacebookPageOption,
  type PendingFacebookPages,
} from "@/lib/channels/facebook";
import { rejectSandbox, requireMerchant } from "@/lib/dashboard/guard";
import { getServerEnv } from "@/lib/env";

/**
 * Settings > Link Messenger / Link Instagram backend. Flow: browser gets a
 * Facebook login code -> POST exchange trades it for the seller's Pages
 * (tokens cached server-side in ai_cache for 10 min, never sent to the
 * browser) -> POST connect saves the chosen Page's token on the merchant
 * row and subscribes the webhook.
 */

const PENDING_TTL_MS = 10 * 60 * 1000;

type Admin = ReturnType<typeof requireMerchant> extends Promise<infer R>
  ? R extends { supabase: infer S }
    ? S
    : never
  : never;

async function savePending(supabase: Admin, merchantId: string, pending: PendingFacebookPages): Promise<void> {
  await supabase.from("ai_cache").upsert({
    key: `fb_pending:${merchantId}`,
    namespace: "channels",
    value: { pages: pending.pages, savedAt: Date.now() },
  });
}

async function loadPending(supabase: Admin, merchantId: string): Promise<PendingFacebookPages | null> {
  const { data } = await supabase
    .from("ai_cache")
    .select("value, created_at")
    .eq("key", `fb_pending:${merchantId}`)
    .maybeSingle();
  if (!data?.value) return null;
  const value = data.value as { pages?: PendingFacebookPages["pages"]; savedAt?: number };
  if (!Array.isArray(value.pages) || !value.savedAt || Date.now() - value.savedAt > PENDING_TTL_MS) return null;
  return { pages: value.pages };
}

export async function GET() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const [messenger, instagram] = await Promise.all([
    resolveMessengerConfig(gate.supabase, gate.merchant.id),
    resolveInstagramConfig(gate.supabase, gate.merchant.id),
  ]);
  const env = getServerEnv();
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  return NextResponse.json({
    oauthConfigured: Boolean(env.META_APP_ID),
    appId: env.META_APP_ID ?? null,
    webhookUrl: `${base}/api/facebook/webhook`,
    messenger: messenger
      ? { connected: true, pageId: messenger.pageId, pageName: messenger.pageName, source: messenger.source }
      : { connected: false },
    instagram: instagram
      ? { connected: true, igUserId: instagram.igUserId, username: instagram.username, source: instagram.source }
      : { connected: false },
  });
}

export async function POST(request: Request) {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const blocked = rejectSandbox(gate.merchant);
  if (blocked) return blocked;
  const body = (await request.json().catch(() => null)) as { action?: string } | null;

  if (body?.action === "exchange") {
    const parsed = z.object({ code: z.string().min(10).max(4000) }).safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid Facebook response" }, { status: 400 });
    try {
      const pending = await exchangeCodeForPages(parsed.data.code);
      await savePending(gate.supabase, gate.merchant.id, pending);
      const pages: FacebookPageOption[] = pending.pages.map(({ pageId, pageName, instagram }) => ({
        pageId,
        pageName,
        instagram,
      }));
      return NextResponse.json({ ok: true, pages });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "exchange failed" }, { status: 502 });
    }
  }

  if (body?.action === "connect") {
    const parsed = z
      .object({ platform: z.enum(["messenger", "instagram"]), pageId: z.string().min(5).max(40) })
      .safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid parameters" }, { status: 400 });
    const pending = await loadPending(gate.supabase, gate.merchant.id);
    const page = pending?.pages.find((p) => p.pageId === parsed.data.pageId);
    if (!page) {
      return NextResponse.json({ error: "Facebook session expired. Click the link button again." }, { status: 409 });
    }
    try {
      if (parsed.data.platform === "messenger") {
        await subscribePageWebhook(page.pageId, page.accessToken);
        const { error } = await gate.supabase
          .from("merchants")
          .update({
            messenger_page_id: page.pageId,
            messenger_page_name: page.pageName,
            messenger_page_token: page.accessToken,
            messenger_connected_at: new Date().toISOString(),
          })
          .eq("id", gate.merchant.id);
        if (error) throw new Error(`save failed (${error.message}). Apply supabase/migrations/0003_social_channels.sql in Supabase.`);
        return NextResponse.json({ ok: true, platform: "messenger", pageName: page.pageName });
      }
      if (!page.instagram) {
        return NextResponse.json(
          { error: "No Instagram Business account is linked to this Page. Link one in Meta Business Settings, then retry." },
          { status: 422 },
        );
      }
      await subscribePageWebhook(page.pageId, page.accessToken);
      const { error } = await gate.supabase
        .from("merchants")
        .update({
          instagram_business_id: page.instagram.id,
          instagram_username: page.instagram.username,
          instagram_page_id: page.pageId,
          instagram_page_token: page.accessToken,
          instagram_connected_at: new Date().toISOString(),
        })
        .eq("id", gate.merchant.id);
      if (error) throw new Error(`save failed (${error.message}). Apply supabase/migrations/0003_social_channels.sql in Supabase.`);
      return NextResponse.json({ ok: true, platform: "instagram", username: page.instagram.username });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "connection failed" }, { status: 502 });
    }
  }

  if (body?.action === "disconnect") {
    const parsed = z.object({ platform: z.enum(["messenger", "instagram"]) }).safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid parameters" }, { status: 400 });
    const update =
      parsed.data.platform === "messenger"
        ? { messenger_page_id: null, messenger_page_name: null, messenger_page_token: null, messenger_connected_at: null }
        : { instagram_business_id: null, instagram_username: null, instagram_page_id: null, instagram_page_token: null, instagram_connected_at: null };
    const { error } = await gate.supabase.from("merchants").update(update).eq("id", gate.merchant.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
