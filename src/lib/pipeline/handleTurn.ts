import { transcribe } from "@/lib/ai/asr";
import { simulatorAdapter } from "@/lib/channels/simulator";
import { normalizeTunisianPhone } from "@/lib/domain/derja";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "./events";
import { understand, type Understanding } from "./understand";

const DEBOUNCE_MS = 2500;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const running = new Set<string>();

/**
 * Schedules a turn for a conversation: 2.5s debounce so a burst (screenshot +
 * voice + text) is processed once, and single-flight so turns never overlap.
 */
export function scheduleTurn(conversationId: string): void {
  const existing = timers.get(conversationId);
  if (existing) clearTimeout(existing);
  timers.set(
    conversationId,
    setTimeout(() => {
      timers.delete(conversationId);
      void runTurn(conversationId).catch((err) => {
        console.error(`[handleTurn] ${conversationId}:`, err);
      });
    }, DEBOUNCE_MS),
  );
}

interface MessageRow {
  id: string;
  kind: string;
  body: string | null;
  media_path: string | null;
  created_at: string;
}

function mergeSlots(current: Record<string, unknown>, u: Understanding): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };
  const set = (key: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== "") next[key] = value;
  };
  set("productDescriptionEn", u.productDescriptionEn);
  set("samNounPhrase", u.samNounPhrase);
  set("spatialHint", u.spatialHint);
  set("size", u.size);
  set("color", u.color);
  set("quantity", u.quantity);
  set("customerName", u.customerName);
  set("governorate", u.governorate);
  set("delegation", u.delegation);
  set("floor", u.floor);
  set("driverNote", u.driverNote);
  if (u.phone) {
    const phone = normalizeTunisianPhone(u.phone);
    if (phone) next.phone = phone;
  }
  if (u.landmarks.length) next.landmarks = u.landmarks;
  if (u.counterOfferMillimes !== null) next.counterOfferMillimes = u.counterOfferMillimes;
  if (u.discountAskPercent !== null) next.discountAskPercent = u.discountAskPercent;
  next.primaryIntent = u.primaryIntent;
  return next;
}

/** Day 2 interim reply: fixed Derja template echoing what was understood. Negotiation arrives Day 4. */
function buildAck(slots: Record<string, unknown>, hadImage: boolean, hadAudio: boolean): string {
  const understood: string[] = [];
  if (typeof slots.productDescriptionEn === "string") understood.push(slots.productDescriptionEn);
  if (typeof slots.color === "string" && slots.productDescriptionEn !== slots.color) understood.push(slots.color as string);
  if (typeof slots.size === "string") understood.push(`taille ${slots.size as string}`);
  if (typeof slots.quantity === "number") understood.push(`x${slots.quantity as number}`);
  if (typeof slots.governorate === "string") understood.push(slots.governorate as string);

  const parts = ["Ahlen!"];
  if (hadAudio) parts.push("Sma3t el vocal mte3ek.");
  if (hadImage) parts.push("Wesletni el taswira.");
  if (understood.length) parts.push(`Fhemt: ${understood.join(", ")}.`);
  parts.push("Kam mel ma3loumet w nkammlou el commande.");
  return parts.join(" ");
}

export async function runTurn(conversationId: string): Promise<void> {
  if (running.has(conversationId)) return; // single-flight; the scheduler re-fires on new messages
  running.add(conversationId);
  const supabase = createAdminClient();
  try {
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, merchant_id, slots, ai_paused, updated_at")
      .eq("id", conversationId)
      .single();
    if (convError || !conversation) throw new Error(`conversation not found: ${convError?.message}`);

    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("id, kind, body, media_path, created_at")
      .eq("conversation_id", conversationId)
      .eq("direction", "in")
      .gt("created_at", conversation.updated_at)
      .order("created_at", { ascending: true });
    if (msgError) throw new Error(`messages fetch failed: ${msgError.message}`);
    const burst = (messages ?? []) as MessageRow[];
    if (burst.length === 0) return;

    const turnStartedAt = new Date().toISOString();
    await logEvent(conversationId, "turn.start", { burstSize: burst.length });

    if (conversation.ai_paused) {
      await logEvent(conversationId, "turn.skipped", { reason: "ai_paused (seller has taken over)" });
      await supabase.from("conversations").update({ updated_at: turnStartedAt }).eq("id", conversationId);
      return;
    }

    // Keywords for ASR biasing: catalog names/categories for this merchant.
    const { data: products } = await supabase
      .from("products")
      .select("name, category_phrase")
      .eq("merchant_id", conversation.merchant_id)
      .limit(50);
    const keywords = [...new Set((products ?? []).flatMap((p) => [p.name, p.category_phrase]))];

    const textParts: string[] = [];
    let imageCount = 0;
    let hadAudio = false;
    for (const message of burst) {
      if (message.kind === "audio" && message.media_path) {
        hadAudio = true;
        const { data: file, error: dlError } = await supabase.storage
          .from("buyer-media")
          .download(message.media_path);
        if (dlError || !file) throw new Error(`audio download failed: ${dlError?.message}`);
        const wav = Buffer.from(await file.arrayBuffer());
        const transcript = await transcribe({ wav, keywords, conversationId });
        textParts.push(transcript);
        await logEvent(conversationId, "asr.transcript", { transcript });
      } else if (message.kind === "image") {
        imageCount++;
        if (message.body) textParts.push(message.body); // image caption counts as buyer text
      } else if (message.body) {
        textParts.push(message.body);
      }
    }
    if (imageCount > 0) {
      await logEvent(conversationId, "vision.pending", { imageCount, note: "SAM matching arrives Day 3" });
    }

    const combinedText = textParts.join("\n").trim();
    if (!combinedText && imageCount === 0) {
      await supabase.from("conversations").update({ updated_at: turnStartedAt }).eq("id", conversationId);
      return;
    }

    const result = await understand({
      text: combinedText || "(image only, no text)",
      imageCount,
      conversationId,
    });
    await logEvent(conversationId, "understand", { understanding: result });

    const currentSlots = (conversation.slots ?? {}) as Record<string, unknown>;
    const slots = mergeSlots(currentSlots, result);

    // Handover triggers (Day 2 subset; full policy Day 4).
    const handoverReason = result.flags.insult
      ? "insult"
      : result.flags.wantsHuman
        ? "human_request"
        : result.primaryIntent === "human_request"
          ? "human_request"
          : null;

    if (handoverReason) {
      await supabase.from("handover_logs").insert({ conversation_id: conversationId, reason: handoverReason });
      await supabase
        .from("conversations")
        .update({ slots, ai_paused: true, updated_at: turnStartedAt })
        .eq("id", conversationId);
      await logEvent(conversationId, "handover", { reason: handoverReason });
      await simulatorAdapter.sendText(
        conversationId,
        "Samahni, bch n5alli el vendeur ykamal m3ak directement.",
      );
      return;
    }

    await supabase
      .from("conversations")
      .update({ slots, updated_at: turnStartedAt })
      .eq("id", conversationId);

    const ack = buildAck(slots, imageCount > 0, hadAudio);
    await simulatorAdapter.sendText(conversationId, ack);
    await logEvent(conversationId, "reply.sent", { reply: ack, template: "day2-ack" });
  } finally {
    running.delete(conversationId);
  }
}
