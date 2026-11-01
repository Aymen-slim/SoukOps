import { createAdminClient } from "@/lib/supabase/admin";
import { instagramAdapter, messengerAdapter } from "./facebook";
import { simulatorAdapter } from "./simulator";
import type { ChannelAdapter } from "./types";
import { whatsappAdapter } from "./whatsapp";

/**
 * Channel router: the pipeline always talks to this adapter; each send is
 * routed by the conversation's `channel` column (`simulator` default,
 * `whatsapp` for Cloud API conversations). This is the single swap point
 * the SPEC's ChannelAdapter contract promised.
 */
async function adapterFor(conversationId: string): Promise<ChannelAdapter> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("conversations").select("channel").eq("id", conversationId).maybeSingle();
  if (data?.channel === "whatsapp") return whatsappAdapter;
  if (data?.channel === "messenger") return messengerAdapter;
  if (data?.channel === "instagram") return instagramAdapter;
  return simulatorAdapter;
}

export const channelAdapter: ChannelAdapter = {
  async sendText(conversationId, text) {
    await (await adapterFor(conversationId)).sendText(conversationId, text);
  },
  async sendImage(conversationId, mediaPath, caption) {
    await (await adapterFor(conversationId)).sendImage(conversationId, mediaPath, caption);
  },
  async sendButtons(conversationId, text, buttons) {
    await (await adapterFor(conversationId)).sendButtons(conversationId, text, buttons);
  },
  async sendLocationRequest(conversationId, text) {
    await (await adapterFor(conversationId)).sendLocationRequest(conversationId, text);
  },
  async sendPinLink(conversationId, url, text) {
    await (await adapterFor(conversationId)).sendPinLink(conversationId, url, text);
  },
};
