import { after, NextResponse } from "next/server";
import { z } from "zod";
import { burstDelayMs, runTurn } from "@/lib/pipeline/handleTurn";
import { simulatorGuard } from "@/lib/security/simulatorGuard";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  kind: z.enum(["text", "image", "audio", "button"]),
  body: z.string().max(4000).optional(),
  /** Base64 media payload for image/audio messages. */
  mediaBase64: z.string().optional(),
  mediaExt: z.enum(["jpg", "jpeg", "png", "webp", "wav"]).optional(),
});

/**
 * Inbound message entry point: validate, store media, insert the message,
 * reply 202 immediately, and process the burst after the response.
 */
export async function POST(request: Request) {
  const blocked = simulatorGuard(request, "messages", 120);
  if (blocked) return blocked;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const input = parsed.data;

  if ((input.kind === "image" || input.kind === "audio") && !input.mediaBase64) {
    return NextResponse.json({ error: "mediaBase64 required for image/audio" }, { status: 400 });
  }
  if (input.kind === "text" && !input.body?.trim()) {
    return NextResponse.json({ error: "body required for text" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", input.conversationId)
    .maybeSingle();
  if (!conversation) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  let mediaPath: string | null = null;
  if (input.mediaBase64) {
    const ext = input.mediaExt ?? (input.kind === "audio" ? "wav" : "jpg");
    mediaPath = `${input.conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const bytes = Buffer.from(input.mediaBase64, "base64");
    const contentType = input.kind === "audio" ? "audio/wav" : `image/${ext === "jpg" ? "jpeg" : ext}`;
    const { error: uploadError } = await supabase.storage
      .from("buyer-media")
      .upload(mediaPath, bytes, { contentType, upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: `media upload failed: ${uploadError.message}` }, { status: 500 });
    }
  }

  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      direction: "in",
      kind: input.kind === "button" ? "text" : input.kind,
      body: input.body ?? null,
      media_path: mediaPath,
    })
    .select("id")
    .single();
  if (insertError || !message) {
    return NextResponse.json({ error: `message insert failed: ${insertError?.message}` }, { status: 500 });
  }

  // The wait stays inside after() so the invocation lives long enough to run
  // the turn. Text starts in a few hundred milliseconds. Media waits a bit
  // longer so a photo and a voice note still share one turn.
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, burstDelayMs(input.kind)));
    await runTurn(input.conversationId).catch((err) => {
      console.error(`[handleTurn] ${input.conversationId}:`, err);
    });
  });

  return NextResponse.json({ messageId: message.id }, { status: 202 });
}
