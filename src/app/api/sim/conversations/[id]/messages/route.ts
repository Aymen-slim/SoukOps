import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, ctx: RouteContext<"/api/sim/conversations/[id]/messages">) {
  const { id } = await ctx.params;
  const supabase = createAdminClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, slots, ai_paused")
    .eq("id", id)
    .maybeSingle();
  if (!conversation) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, direction, kind, body, media_path, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Signed URLs for media so the simulator can render images/audio.
  // Outbound catalog photos use "product-media:<path>" (original, model kept)
  // or "crops:<path>" (garment cutout). Everything else lives in buyer-media.
  const signed = await Promise.all(
    (messages ?? []).map(async (m) => {
      if (!m.media_path) return m;
      const isCrop = m.media_path.startsWith("crops:");
      const isCatalog = m.media_path.startsWith("product-media:");
      const bucket = isCrop ? "crops" : isCatalog ? "product-media" : "buyer-media";
      const path = isCrop
        ? m.media_path.slice("crops:".length)
        : isCatalog
          ? m.media_path.slice("product-media:".length)
          : m.media_path;
      const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
      return { ...m, mediaUrl: data?.signedUrl ?? null };
    }),
  );

  return NextResponse.json({ conversation, messages: signed });
}
