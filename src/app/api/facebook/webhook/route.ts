import { after, NextResponse } from "next/server";
import {
  parseFacebookWebhook,
  resolveFacebookVerifyToken,
  type FacebookPlatform,
  type InboundFacebookMessage,
} from "@/lib/channels/facebook";
import { verifyWebhookSignature } from "@/lib/channels/whatsapp";
import { getDemoMerchant } from "@/lib/dashboard/merchant";
import { getServerEnv } from "@/lib/env";
import { burstDelayMs, runTurn } from "@/lib/pipeline/handleTurn";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** One callback URL serves both Meta objects: Page (Messenger) and
 * Instagram. Subscribe both objects to this URL in the Meta app. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const supabase = createAdminClient();
  const merchant = await getDemoMerchant(supabase);
  const expected = merchant ? await resolveFacebookVerifyToken(supabase, merchant.id) : getServerEnv().FACEBOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

async function findOrCreateConversation(
  supabase: Admin,
  merchantId: string,
  platform: FacebookPlatform,
  platformUserId: string,
): Promise<string> {
  const column = platform === "messenger" ? "messenger_psid" : "instagram_scoped_id";
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq(column, platformUserId)
    .maybeSingle();
  let customerId = customer?.id as string | undefined;
  if (!customerId) {
    const { data: created, error } = await supabase
      .from("customers")
      .insert({ merchant_id: merchantId, [column]: platformUserId })
      .select("id")
      .single();
    if (error || !created) throw new Error(`customer insert failed: ${error?.message}`);
    customerId = created.id as string;
  }
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("customer_id", customerId)
    .eq("channel", platform)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ merchant_id: merchantId, customer_id: customerId, channel: platform })
    .select("id")
    .single();
  if (error || !created) throw new Error(`conversation insert failed: ${error?.message}`);
  return created.id as string;
}

async function storeInbound(
  supabase: Admin,
  merchantId: string,
  message: InboundFacebookMessage,
): Promise<{ conversationId: string; kind: "text" | "image" | "audio" | "button" } | null> {
  const conversationId = await findOrCreateConversation(supabase, merchantId, message.platform, message.platformUserId);

  let kind: "text" | "image" | "audio" | "button" = message.kind;
  let body = message.body;
  let mediaPath: string | null = null;
  if (message.kind === "image" && message.attachmentUrl) {
    try {
      const res = await fetch(message.attachmentUrl);
      if (!res.ok) throw new Error(`attachment download ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      const ext = (res.headers.get("content-type") ?? "").includes("png") ? "png" : "jpg";
      mediaPath = `${conversationId}/${message.externalId}.${ext}`;
      const { error } = await supabase.storage.from("buyer-media").upload(mediaPath, bytes, {
        contentType: ext === "png" ? "image/png" : "image/jpeg",
        upsert: true,
      });
      if (error) throw new Error(error.message);
    } catch (err) {
      console.error(`[facebook] image ${message.externalId} failed:`, err instanceof Error ? err.message : err);
      mediaPath = null;
      kind = "text";
      body = "(unreadable photo — ask the customer to send it again)";
    }
  }
  if (message.kind === "audio") {
    // Messenger/IG voice clips are not WAV; ASR cannot read them yet.
    kind = "text";
    body = "(voice note received — ask the customer to type or send a photo)";
  }

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    external_id: message.externalId,
    direction: "in",
    kind: kind === "button" ? "text" : kind,
    body,
    media_path: mediaPath,
  });
  if (error) {
    if (error.code === "23505") return null; // Meta retry, already stored
    throw new Error(`message insert failed: ${error.message}`);
  }
  return { conversationId, kind };
}

export async function POST(request: Request) {
  const raw = await request.text();
  const env = getServerEnv();
  const appSecret = env.META_APP_SECRET ?? env.WHATSAPP_APP_SECRET;
  if (!verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const merchant = await getDemoMerchant(supabase);
  if (!merchant) return NextResponse.json({ received: true, stored: 0 });

  const stored: Array<{ conversationId: string; kind: "text" | "image" | "audio" | "button" }> = [];
  for (const message of parseFacebookWebhook(payload)) {
    try {
      const row = await storeInbound(supabase, merchant.id, message);
      if (row) stored.push(row);
    } catch (err) {
      console.error(`[facebook] inbound ${message.externalId} failed:`, err instanceof Error ? err.message : err);
    }
  }

  const byConversation = new Map<string, "text" | "image" | "audio" | "button">();
  for (const row of stored) byConversation.set(row.conversationId, row.kind);
  for (const [conversationId, kind] of byConversation) {
    after(async () => {
      await new Promise((resolve) => setTimeout(resolve, burstDelayMs(kind)));
      await runTurn(conversationId).catch((err) => {
        console.error(`[handleTurn] facebook ${conversationId}:`, err);
      });
    });
  }
  return NextResponse.json({ received: true, stored: stored.length });
}
