import { createAdminClient } from "@/lib/supabase/admin";
import type { ChannelAdapter, ChannelButton } from "./types";

/**
 * Simulator channel: outbound messages are stored as `messages` rows and the
 * simulator UI polls for them (server routes read with the secret key, so no
 * anon RLS policies are needed). Day 7 may swap transport to Realtime
 * broadcast behind this same adapter interface.
 */
/** Shared outbound row insert: every channel mirrors its sends into
 * `messages` so the dashboard inbox and simulator history stay complete. */
export async function insertOut(
  conversationId: string,
  kind: string,
  body: string,
  mediaPath?: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    direction: "out",
    kind,
    body,
    media_path: mediaPath ?? null,
  });
  if (error) throw new Error(`simulator send failed: ${error.message}`);
}

export const simulatorAdapter: ChannelAdapter = {
  async sendText(conversationId, text) {
    await insertOut(conversationId, "text", text);
  },
  async sendImage(conversationId, mediaPath, caption) {
    await insertOut(conversationId, "image", caption ?? "", mediaPath);
  },
  async sendButtons(conversationId, text, buttons: ChannelButton[]) {
    await insertOut(conversationId, "buttons", JSON.stringify({ text, buttons }));
  },
  async sendLocationRequest(conversationId, text) {
    await insertOut(conversationId, "location_request", text);
  },
  async sendPinLink(conversationId, url, text) {
    await insertOut(conversationId, "pin_link", JSON.stringify({ text, url }));
  },
};
