import { after, NextResponse } from "next/server";
import {
  downloadWhatsAppMedia,
  parseWebhookPayload,
  resolveWhatsAppConfig,
  verifyWebhookSignature,
  type InboundWhatsAppMessage,
} from "@/lib/channels/whatsapp";
import { oggOpusToWav16k } from "@/lib/channels/oggToWav";
import { getDemoMerchant } from "@/lib/dashboard/merchant";
import { getServerEnv } from "@/lib/env";
import { burstDelayMs, runTurn } from "@/lib/pipeline/handleTurn";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** Meta subscription handshake: GET ?hub.mode=subscribe&hub.verify_token=… */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const supabase = createAdminClient();
  const merchant = await getDemoMerchant(supabase);
  const config = merchant ? await resolveWhatsAppConfig(supabase, merchant.id) : null;
  const expected = config?.verifyToken ?? getServerEnv().WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

async function findOrCreateConversation(
  supabase: Admin,
  merchantId: string,
  message: InboundWhatsAppMessage,
): Promise<string> {
  const phone = `+${message.waId}`;
  let { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("wa_id", message.waId)
    .maybeSingle();
  if (!customer) {
    const byPhone = await supabase
      .from("customers")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("phone", phone)
      .maybeSingle();
    customer = byPhone.data;
  }
  if (!customer) {
    const { data: created, error } = await supabase
      .from("customers")
      .insert({ merchant_id: merchantId, name: message.profileName, phone, wa_id: message.waId })
      .select("id")
      .single();
    if (error || !created) throw new Error(`customer insert failed: ${error?.message}`);
    customer = created;
  } else if (message.profileName) {
    await supabase.from("customers").update({ wa_id: message.waId }).eq("id", customer.id as string);
  }

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("customer_id", customer.id as string)
    .eq("channel", "whatsapp")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ merchant_id: merchantId, customer_id: customer.id, channel: "whatsapp" })
    .select("id")
    .single();
  if (error || !created) throw new Error(`conversation insert failed: ${error?.message}`);
  return created.id as string;
}

async function storeInbound(supabase: Admin, merchantId: string, message: InboundWhatsAppMessage): Promise<{ conversationId: string; kind: "text" | "image" | "audio" | "button" } | null> {
  const conversationId = await findOrCreateConversation(supabase, merchantId, message);

  let kind: "text" | "image" | "audio" | "button" = message.kind === "location" ? "text" : message.kind;
  let mediaPath: string | null = null;
  if ((message.kind === "image" || message.kind === "audio") && message.mediaId) {
    const config = await resolveWhatsAppConfig(supabase, merchantId);
    if (config) {
      try {
        const media = await downloadWhatsAppMedia(config, message.mediaId);
        let bytes: Buffer = media.buffer;
        let ext = message.kind === "image" ? (media.mime.includes("png") ? "png" : "jpg") : "ogg";
        if (message.kind === "audio") {
          bytes = await oggOpusToWav16k(media.buffer);
          ext = "wav";
        }
        mediaPath = `${conversationId}/${message.externalId}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("buyer-media")
          .upload(mediaPath, bytes, {
            contentType: message.kind === "audio" ? "audio/wav" : media.mime,
            upsert: true,
          });
        if (uploadError) throw new Error(uploadError.message);
      } catch (err) {
        console.error(`[whatsapp] media ${message.externalId} failed:`, err instanceof Error ? err.message : err);
        mediaPath = null;
        if (message.kind === "audio") kind = "text"; // body explains below
      }
    }
  }

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    external_id: message.externalId,
    direction: "in",
    kind: kind === "button" ? "text" : kind,
    body:
      message.kind === "audio" && kind === "text"
        ? "(unreadable voice note — ask the customer to try again)"
        : message.body,
    media_path: mediaPath,
  });
  if (error) {
    // Unique external_id: Meta retried a delivery we already stored.
    if (error.code === "23505") return null;
    throw new Error(`message insert failed: ${error.message}`);
  }
  return { conversationId, kind };
}

/**
 * Inbound WhatsApp messages. Always 200 once the signature checks out —
 * Meta retries non-200s, and the unique `external_id` makes retries harmless.
 * Buyer text stays untrusted: it only becomes a `messages` row; `runTurn`'s
 * policy engine decides every write, exactly like the simulator channel.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const env = getServerEnv();
  if (!verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256"), env.WHATSAPP_APP_SECRET)) {
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
  for (const message of parseWebhookPayload(payload)) {
    try {
      const row = await storeInbound(supabase, merchant.id, message);
      if (row) stored.push(row);
    } catch (err) {
      console.error(`[whatsapp] inbound ${message.externalId} failed:`, err instanceof Error ? err.message : err);
    }
  }

  const byConversation = new Map<string, "text" | "image" | "audio" | "button">();
  for (const row of stored) byConversation.set(row.conversationId, row.kind);
  for (const [conversationId, kind] of byConversation) {
    after(async () => {
      await new Promise((resolve) => setTimeout(resolve, burstDelayMs(kind)));
      await runTurn(conversationId).catch((err) => {
        console.error(`[handleTurn] whatsapp ${conversationId}:`, err);
      });
    });
  }
  return NextResponse.json({ received: true, stored: stored.length });
}
