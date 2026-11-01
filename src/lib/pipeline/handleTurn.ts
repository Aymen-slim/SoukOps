import { embedImages } from "@/lib/ai/embeddings";
import type { SamBox } from "@/lib/ai/sam";
import { channelAdapter } from "@/lib/channels";
import { normalizeTunisianPhone, parseMoneyMillimes } from "@/lib/domain/derja";
import { landmarkMatchesAny } from "@/lib/domain/landmarks";
import { nextNegotiationStep, parseNegotiationState } from "@/lib/domain/negotiation";
import { firewallChecked, formatMillimesForChat } from "@/lib/domain/pricing";
import { nextAction } from "@/lib/domain/slots";
import { transcribe } from "@/lib/ai/asr";
import { createAdminClient } from "@/lib/supabase/admin";
import { findConfirmedAddress, resolveAndSendPin, sendPinForCandidate } from "./address";
import { logEvent } from "./events";
import { createOrderFromAkked, handleBeddel, sendSummary } from "./order";
import { phraseNegotiationReply, phraseSellerReply } from "./phrasing";
import { parseDispatchReconfirm, parseDispatchReconfirmReply } from "@/lib/domain/reconfirm";
import { applyDispatchReconfirmReply } from "./reconfirm";
import { applyDeterministicFallbacks, fastPathUnderstanding, understand, type Understanding } from "./understand";
import {
  catalogPhotoPath,
  matchByDescription,
  matchProduct,
  parseChoice,
  resolvePointSelection,
  resolveScreenshot,
  uploadPng,
  type MatchResult,
} from "./vision";

/** Text turns start almost immediately. Media keeps a short window so a photo and a voice note still land in one turn. */
export function burstDelayMs(kind: "text" | "image" | "audio" | "button"): number {
  return kind === "text" || kind === "button" ? 280 : 900;
}

const DEBOUNCE_MS = 280;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const running = new Set<string>();
const pendingRerun = new Set<string>();

/**
 * Schedules a turn for a conversation. A short debounce still coalesces a
 * burst, and single-flight so turns never overlap.
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

function mergeSlots(current: Record<string, unknown>, u: Understanding, hadNewImage = false): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };
  if (hadNewImage) {
    // Reset image-specific hints when a new photo is sent, while keeping order slots (size, address, phone).
    delete next.spatialHint;
  }
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

/**
 * Deterministic Derja fallback reply that warmly confirms what was understood
 * (in Derja/French, never raw English embedding prompts) and asks for the
 * single next missing piece of information. No prices are stated here.
 */
export function buildAck(
  slots: Record<string, unknown>,
  hadImage: boolean,
  hadAudio: boolean,
): string {
  const noted: string[] = [];
  if (typeof slots.matchedProductName === "string" && slots.matchedProductName.trim()) {
    noted.push(slots.matchedProductName);
  }
  if (typeof slots.size === "string" && slots.size.trim()) noted.push(`taille ${slots.size as string}`);
  if (typeof slots.customerName === "string" && slots.customerName.trim()) noted.push(slots.customerName);
  if (typeof slots.quantity === "number" && (slots.quantity as number) > 1) noted.push(`x${slots.quantity as number}`);
  if (typeof slots.governorate === "string" && slots.governorate.trim()) noted.push(`fi ${slots.governorate as string}`);

  const parts: string[] = [];
  if (hadAudio) parts.push("Sma3t el vocal mte3ek.");
  if (hadImage) parts.push("Wesletni el taswira.");
  if (noted.length) parts.push(`Mrigel, sajaltlek ${noted.join(", ")}.`);

  const hasProduct =
    typeof slots.matchedProductId === "string" ||
    typeof slots.matchedProductName === "string" ||
    typeof slots.productDescriptionEn === "string" ||
    typeof slots.samNounPhrase === "string" ||
    hadImage;
  const intent = typeof slots.primaryIntent === "string" ? (slots.primaryIntent as string) : "other";

  let next: string;
  if (!hasProduct && intent === "greeting") {
    next = "Ahla w sahla! Ana m3ak. Ab3atli taswirt el produit elli t7eb alih, walla 9olli chnowa t7eb techri.";
  } else if (!hasProduct) {
    next = "Marhba bik! Chnowa el produit elli t7eb alih? Ab3atli taswirt el produit walla ousifhouli.";
  } else {
    next = nextQuestion({ ...slots, matchedProductId: slots.matchedProductId ?? "pending" });
  }
  parts.push(next);
  return parts.join(" ");
}

// ------------------------------------------------------------- Day 3 vision

interface PendingOption {
  label: string;
  productId?: string;
  name?: string;
  cropPath?: string | null;
  sourcePath?: string | null;
  box?: SamBox;
  cropMediaPath?: string;
}

interface PendingChoice {
  kind: "crop" | "product";
  imageMediaPath?: string | null;
  samNounPhrase?: string | null;
  options: PendingOption[];
}

function readPendingChoice(slots: Record<string, unknown>): PendingChoice | null {
  const raw = slots.pendingChoice as PendingChoice | undefined;
  if (!raw || (raw.kind !== "crop" && raw.kind !== "product") || !Array.isArray(raw.options)) return null;
  if (raw.options.length === 0) return null;
  return raw;
}

function buttonTitle(index: number, name?: string): string {
  return `${index + 1} Â· ${name ?? "Produit"}`.slice(0, 20);
}

/**
 * Direct answers to buyer questions. The conversation must respond to what
 * was just asked (price, stock) before asking for the next slot â€” a buyer
 * asking "b9addech?" must never get "win toskon?" back.
 */
export function buildPriceReply(
  name: string,
  priceMillimes: number,
  slots: Record<string, unknown>,
  stock?: number,
): string {
  const price = formatMillimesForChat(priceMillimes);
  const head =
    stock !== undefined && stock <= 0
      ? `El ${name} soumou ${price}, amma howa kemmel fel stock taw.`
      : `El ${name} soumou ${price}.`;
  return `${head} ${nextQuestion({ ...slots, matchedProductId: slots.matchedProductId ?? "known" })}`;
}

export function buildStockReply(name: string, stock: number, slots: Record<string, unknown>): string {
  if (stock > 0) {
    return `Ay, el ${name} mawjoud fel stock. ${nextQuestion({ ...slots, matchedProductId: slots.matchedProductId ?? "known" })}`;
  }
  const alternative = typeof slots.alternativeProductName === "string" ? slots.alternativeProductName : null;
  return alternative
    ? `Samahni, el ${name} kemmel fel stock. Amma el ${alternative} mawjoud, t7eb tchoufou?`
    : `Samahni, el ${name} kemmel fel stock taw.`;
}

export function matchedText(name: string, slots: Record<string, unknown>, priceMillimes?: number): string {
  // A price question in the same turn as the match gets its answer first.
  if (slots.primaryIntent === "ask_price" && priceMillimes !== undefined) {
    return buildPriceReply(name, priceMillimes, slots);
  }
  const pricePart = priceMillimes !== undefined ? ` (${formatMillimesForChat(priceMillimes)})` : "";
  const noted: string[] = [];
  if (typeof slots.size === "string" && slots.size.trim()) noted.push(`taille ${slots.size}`);
  if (typeof slots.quantity === "number" && (slots.quantity as number) > 1) noted.push(`x${slots.quantity as number}`);
  if (typeof slots.governorate === "string" && slots.governorate.trim()) noted.push(`fi ${slots.governorate}`);
  const notedPart = noted.length > 0 ? ` Sajaltlek ${noted.join(", ")} mrigel!` : "";

  const base = `Yesss, l9itou! Hedha el ${name}${pricePart}.${notedPart}`;
  return `${base} ${nextQuestion({ ...slots, matchedProductId: slots.matchedProductId ?? "matched" })}`;
}

/** The one question the seller asks next. Amounts never appear here. */
export function nextQuestion(slots: Record<string, unknown>): string {
  const action = nextAction(slots);
  if (action === "need_size") return "Behi! Chnowa el taille mte3ek? (S, M, L, XL)";
  if (action === "need_name") return "Chnowa esmek, 3aychek?";
  if (action === "need_phone") return "Aatini numero el tÃ©lÃ©phone mte3ek, w nkammlou el commande bel 3ayni.";
  if (action === "need_governorate") {
    return "Win toskon? Aatini el wilaya w a9reb repÃ¨re (pharmacie, cafÃ©, mosquÃ©e...) lel dar.";
  }
  if (action === "need_landmark") {
    return `Aatini bark a9reb repÃ¨re (pharmacie, cafÃ©, mosquÃ©e, Ã©cole...) ba7dha darek fi ${slots.governorate as string} bch nab3athlek el pin.`;
  }
  if (action === "need_product") return "Chnowa el produit elli t7eb alih? Ab3atli taswirt el produit walla ousifhouli.";
  return "T7eb nkammlou el commande? Ana mrigel.";
}

async function phraseMatchCaption(
  slots: Record<string, unknown>,
  name: string,
  priceMillimes: number | undefined,
  buyerText: string,
  conversationId: string,
): Promise<string> {
  const withMatch = {
    ...slots,
    matchedProductId: typeof slots.matchedProductId === "string" ? slots.matchedProductId : "matched",
    matchedProductName: name,
  };
  const phrased = await phraseSellerReply(
    {
      situation: slots.primaryIntent === "ask_price" ? "price_answer" : "matched",
      buyerText,
      productName: name,
      priceMillimes: priceMillimes ?? null,
      size: typeof slots.size === "string" ? slots.size : null,
      quantity: typeof slots.quantity === "number" ? slots.quantity : null,
      governorate: typeof slots.governorate === "string" ? slots.governorate : null,
      hasPhone: typeof slots.phone === "string",
      hasName: typeof slots.customerName === "string",
      nextAction: nextAction(withMatch),
      fallbackText: matchedText(name, withMatch, priceMillimes),
    },
    conversationId,
  );
  return phrased.text;
}

type SupabaseClient = ReturnType<typeof createAdminClient>;

async function downloadBuyerMedia(
  supabase: SupabaseClient,
  mediaPath: string,
): Promise<{ buffer: Buffer; mime: string }> {
  const { data: file, error } = await supabase.storage.from("buyer-media").download(mediaPath);
  if (error || !file) throw new Error(`media download failed: ${error?.message}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = mediaPath.split(".").pop()?.toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return { buffer, mime };
}

export async function runTurn(conversationId: string): Promise<void> {
  if (running.has(conversationId)) {
    pendingRerun.add(conversationId);
    return;
  }
  running.add(conversationId);
  const supabase = createAdminClient();
  try {
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, merchant_id, customer_id, slots, negotiation, ai_paused, updated_at")
      .eq("id", conversationId)
      .single();
    if (convError || !conversation) throw new Error(`conversation not found: ${convError?.message}`);
    const merchantId = conversation.merchant_id as string;

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

    let burstCursor = burst[burst.length - 1].created_at;
    await logEvent(conversationId, "turn.start", { burstSize: burst.length });

    // Akked / Beddel are deterministic buyer decisions on a pending summary:
    // intercepted before any model call, so prompt injection in the same
    // burst can never reach the order write. Only the policy engine writes.
    {
      const currentSlots = (conversation.slots ?? {}) as Record<string, unknown>;
      const rawText = burst
        .map((m) => m.body ?? "")
        .join(" ")
        .trim()
        .toLowerCase()
        .replace(/[.!ØŒ]+$/g, "");
      if (currentSlots.summaryPending === true && (rawText === "akked" || rawText === "beddel")) {
        if (rawText === "akked") {
          const result = await createOrderFromAkked(supabase, conversationId);
          if (!result.ok) {
            await channelAdapter.sendText(
              conversationId,
              "Mazzel na9es ma3loumet bch nakked el commande. Rja3 chouf el rÃ©cap w akked marra o5ra.",
            );
            await logEvent(conversationId, "order.akked_rejected", { reason: result.reason });
          }
        } else {
          await handleBeddel(supabase, conversationId);
        }
        await supabase.from("conversations").update({ updated_at: burstCursor }).eq("id", conversationId);
        return;
      }
    }

    // Pre-dispatch reconfirmation answer: deterministic intercept before any
    // model call, same trust boundary as Akked/Beddel above.
    {
      const currentSlots = (conversation.slots ?? {}) as Record<string, unknown>;
      const pending = parseDispatchReconfirm(currentSlots);
      if (pending?.status === "pending") {
        const rawText = burst.map((m) => m.body ?? "").join(" ").trim();
        const answer = parseDispatchReconfirmReply(rawText);
        if (answer) {
          await applyDispatchReconfirmReply(supabase, conversationId, currentSlots, answer);
          await supabase.from("conversations").update({ updated_at: burstCursor }).eq("id", conversationId);
          return;
        }
      }
    }

    if (conversation.ai_paused) {
      await logEvent(conversationId, "turn.skipped", { reason: "ai_paused (seller has taken over)" });
      await supabase.from("conversations").update({ updated_at: burstCursor }).eq("id", conversationId);
      return;
    }

    // Keywords for ASR biasing: catalog names/categories for this merchant.
    const { data: products } = await supabase
      .from("products")
      .select("name, category_phrase")
      .eq("merchant_id", merchantId)
      .limit(50);
    const keywords = [...new Set((products ?? []).flatMap((p) => [p.name, p.category_phrase]))];

    const textParts: string[] = [];
    const imageDataUrls: string[] = [];
    let firstImage: { buffer: Buffer; mime: string; mediaPath: string } | null = null;
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
        if (message.media_path) {
          const { buffer, mime } = await downloadBuyerMedia(supabase, message.media_path);
          if (!firstImage) firstImage = { buffer, mime, mediaPath: message.media_path };
          if (imageDataUrls.length < 2) {
            imageDataUrls.push(`data:${mime};base64,${buffer.toString("base64")}`);
          }
        }
      } else if (message.body) {
        textParts.push(message.body);
      }
    }

    const combinedText = textParts.join("\n").trim();
    if (!combinedText && imageCount === 0) {
      await supabase.from("conversations").update({ updated_at: burstCursor }).eq("id", conversationId);
      return;
    }

    const currentSlots = (conversation.slots ?? {}) as Record<string, unknown>;
    const pendingBeforeUnderstand = readPendingChoice(currentSlots);
    const pendingLmBeforeUnderstand = Array.isArray(currentSlots.pendingLandmarkChoice)
      ? currentSlots.pendingLandmarkChoice
      : null;
    const isButtonChoiceTap =
      imageCount === 0 &&
      /^\s*\d{1,2}(?:\s*Â·\s*.+)?\s*$/.test(combinedText) &&
      Boolean(pendingBeforeUnderstand || (pendingLmBeforeUnderstand && pendingLmBeforeUnderstand.length > 0));

    const expectingSize =
      typeof currentSlots.size !== "string" &&
      (Boolean(currentSlots.matchedProductId) || imageCount > 0 || Boolean(pendingBeforeUnderstand));

    const fast =
      imageCount === 0 && !hadAudio && !isButtonChoiceTap
        ? fastPathUnderstanding(combinedText, expectingSize)
        : null;

    const result = isButtonChoiceTap
      ? applyDeterministicFallbacks(
          combinedText,
          {
            primaryIntent: "order",
            samNounPhrase: null,
            productDescriptionEn: null,
            spatialHint: null,
            size: null,
            color: null,
            quantity: null,
            customerName: null,
            phone: null,
            governorate: null,
            delegation: null,
            landmarks: [],
            floor: null,
            driverNote: null,
            discountAskPercent: null,
            counterOfferMillimes: null,
            flags: { offTopic: false, insult: false, wantsHuman: false },
          },
          expectingSize,
        )
      : (fast ??
          (await understand({
            text: combinedText || "(image only, no text)",
            imageCount,
            images: imageDataUrls,
            expectingSize,
            conversationId,
          })));
    await logEvent(conversationId, "understand", { understanding: result });

    let slots = mergeSlots(currentSlots, result, imageCount > 0);

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
        .update({ slots, ai_paused: true, updated_at: burstCursor })
        .eq("id", conversationId);
      await logEvent(conversationId, "handover", { reason: handoverReason });
      await channelAdapter.sendText(
        conversationId,
        "Samahni, bch n5alli el vendeur ykamal m3ak directement.",
      );
      return;
    }

    /**
     * Absorbs any follow-up text messages the buyer sent while a slow vision
     * step was running (e.g. buyer sends photo, then types "taille L" 2s later).
     */
    const absorbLateTextMessages = async (): Promise<void> => {
      const { data: lateRows } = await supabase
        .from("messages")
        .select("id, kind, body, media_path, created_at")
        .eq("conversation_id", conversationId)
        .eq("direction", "in")
        .eq("kind", "text")
        .gt("created_at", burstCursor)
        .order("created_at", { ascending: true });
      const late = (lateRows ?? []) as MessageRow[];
      if (late.length === 0) return;
      const lateText = late
        .map((m) => m.body ?? "")
        .join("\n")
        .trim();
      burstCursor = late[late.length - 1].created_at;
      pendingRerun.delete(conversationId);
      if (!lateText) return;
      const lateUnderstanding = await understand({
        text: lateText,
        imageCount: 0,
        expectingSize: typeof slots.size !== "string",
        conversationId,
      });
      await logEvent(conversationId, "understand.late", { understanding: lateUnderstanding });
      slots = mergeSlots(slots, lateUnderstanding, false);
    };

    // ------------------------------------------- checkout (Day 4/5 policy)
    let negotiationState = parseNegotiationState(conversation.negotiation);

    /**
     * Advances the deterministic checkout once a product is matched:
     * negotiation ladder -> landmark pin -> summary. Question slots
     * (size/phone/...) are left to the reply templates; this only acts on
     * state transitions. Returns true when it sent the turn's reply.
     */
    const progressCheckout = async (): Promise<boolean> => {
      // Downstream steps (pin, summary, order) read slots from the DB:
      // persist this turn's merged slots first.
      await supabase
        .from("conversations")
        .update({ slots, updated_at: burstCursor })
        .eq("id", conversationId);

      // Buyer answering a landmark disambiguation.
      const pendingLm = slots.pendingLandmarkChoice as
        | Array<{ id: string; name: string; governorate: string | null; delegation: string | null; lat: number; lng: number; score: number }>
        | undefined;
      if (Array.isArray(pendingLm) && pendingLm.length > 0) {
        const index = parseChoice(combinedText, pendingLm.length);
        const chosen = index !== null ? pendingLm[index] : undefined;
        if (!chosen) {
          await channelAdapter.sendButtons(
            conversationId,
            "Ma fhemtch a5tartek. A9reb landmark howa anehou? A5tar b el ra9m:",
            pendingLm.map((c, i) => ({ id: `landmark-${i}`, title: buttonTitle(i, c.name) })),
          );
          return true;
        }
        delete slots.pendingLandmarkChoice;
        await sendPinForCandidate({
          supabase,
          conversationId,
          slots,
          centre: { lat: chosen.lat, lng: chosen.lng },
          landmarkName: chosen.name,
          governorate: chosen.governorate ?? (typeof slots.governorate === "string" ? slots.governorate : null),
          delegation: chosen.delegation,
          source: "buyer_choice",
        });
        return true;
      }

      const matchedId = typeof slots.matchedProductId === "string" ? slots.matchedProductId : null;
      if (!matchedId) return false;

      // Negotiation ladder (deterministic; amounts only from negotiation.ts).
      // Counter-offer: model proposal first, deterministic Derja money
      // parsing as fallback â€” code decides the amount either way.
      const counterOfferMillimes = result.counterOfferMillimes ?? parseMoneyMillimes(combinedText);
      if (result.primaryIntent === "bargain" || counterOfferMillimes !== null) {
        const { data: product } = await supabase
          .from("products")
          .select("name, price_millimes, floor_millimes")
          .eq("id", matchedId)
          .maybeSingle();
        if (!product) return false;
        const step = nextNegotiationStep({
          priceMillimes: product.price_millimes as number,
          floorMillimes: product.floor_millimes as number,
          state: negotiationState,
          counterOfferMillimes,
        });
        negotiationState = step.state;
        await supabase
          .from("conversations")
          .update({ negotiation: negotiationState, updated_at: burstCursor })
          .eq("id", conversationId);
        // Spark phrases the reply from ladder facts only; the price
        // firewall inside phrasing falls back to a fixed template.
        const phrased = await phraseNegotiationReply(
          {
            productName: product.name as string,
            offerMillimes: step.offerMillimes,
            listPriceMillimes: product.price_millimes as number,
            acceptedCounter: step.acceptedCounter,
            isFinal: step.isFinal,
          },
          conversationId,
        );
        await channelAdapter.sendText(conversationId, phrased.text);
        await logEvent(conversationId, "negotiation.offer", {
          offerMillimes: step.offerMillimes,
          rung: negotiationState.rung,
          acceptedCounter: step.acceptedCounter,
          final: step.isFinal,
          phrasing: phrased.source,
        });
        return true;
      }

      const action = nextAction(slots);
      if (action === "need_pin") {
        // Returning buyers reuse a confirmed pin and skip the map step â€”
        // but only when the landmark they just stated is that same place.
        // A newly stated, different address always gets a fresh pin for
        // that address; the stored pin must never override it silently.
        if (conversation.customer_id) {
          const confirmed = await findConfirmedAddress(supabase, conversation.customer_id as string).catch(() => null);
          if (confirmed) {
            const statedNames = (Array.isArray(slots.landmarks) ? slots.landmarks : [])
              .map((l) => (l && typeof l === "object" ? (l as { name?: unknown }).name : null))
              .filter((n): n is string => typeof n === "string" && Boolean(n.trim()));
            if (landmarkMatchesAny(statedNames, confirmed.landmark)) {
              slots.confirmedAddressId = confirmed.id;
              slots.pinReused = true;
              await supabase
                .from("conversations")
                .update({ slots, updated_at: burstCursor })
                .eq("id", conversationId);
              await logEvent(conversationId, "address.pin_reused", { addressId: confirmed.id });
              return sendSummary(supabase, conversationId);
            }
            await logEvent(conversationId, "address.reuse_skipped", {
              addressId: confirmed.id,
              confirmedLandmark: confirmed.landmark,
              stated: statedNames,
              reason: "buyer stated a different landmark",
            });
          }
        }
        const outcome = await resolveAndSendPin({ supabase, conversationId, slots });
        if (outcome.status === "miss") {
          await channelAdapter.sendText(
            conversationId,
            "Ma l9itch el repÃ¨re hedha. Tnajem t9olli esm pharmacie, cafÃ©, mosquÃ©e walla Ã©cole 9riba lel dar, m3a el wilaya?",
          );
        } else if (outcome.status === "ambiguous") {
          await channelAdapter.sendButtons(
            conversationId,
            "L9it barcha amaken b nafs el esm. A9reb landmark howa anehou?",
            outcome.candidates.map((c, i) => ({ id: `landmark-${i}`, title: buttonTitle(i, c.name) })),
          );
        }
        return true;
      }
      if (action === "awaiting_pin") {
        if (result.landmarks.length > 0) {
          // Buyer corrected the landmark: resolve again, fresh pin link.
          slots.pinPending = false;
          delete slots.pendingAddress;
          return progressCheckout();
        }
        await channelAdapter.sendText(
          conversationId,
          "Mazzel nestanna fe takkid el mkan mte3ek 3al kharita. E8et 3al lien elli b3aththoulek w akked el pin bch nkammlou.",
        );
        return true;
      }
      if (action === "need_summary") {
        return sendSummary(supabase, conversationId);
      }
      if (action === "awaiting_confirmation") {
        await channelAdapter.sendText(
          conversationId,
          "Chouf el rÃ©cap l fou9, 3aychek. E8et [Akked] ken kol chay s7a7, w [Beddel] ken t7eb tbaddel haja.",
        );
        return true;
      }
      if (action === "ordered") {
        await channelAdapter.sendText(
          conversationId,
          "El commande mte3ek mtakkda deja, w el vendeur 3liha. Ken t7eb haja okhra 9olli, ana mawjoud!",
        );
        return true;
      }
      return false;
    };

    // ------------------------------------------------------ vision (Day 3)
    let visionHandled = false;

    const saveAndLog = async (replyLabel: string) => {
      await supabase
        .from("conversations")
        .update({ slots, updated_at: burstCursor })
        .eq("id", conversationId);
      await logEvent(conversationId, "reply.sent", { reply: replyLabel, template: "day3-vision" });
    };

    /** Applies the confidence gate: sends crop/buttons/decline, mutates slots. */
    const applyMatch = async (
      match: MatchResult,
      source: { cropPng?: Buffer; embedding?: number[] | null },
    ): Promise<void> => {
      await absorbLateTextMessages().catch(() => undefined);
      await logEvent(conversationId, "vision.match", {
        decision: match.decision,
        score: Math.round(match.score * 1000) / 1000,
        scoreSource: match.scoreSource,
        productId: match.chosen?.productId ?? null,
        productName: match.chosen?.name ?? null,
        stock: match.chosen?.stock ?? null,
        alternative: match.alternative?.name ?? null,
      });
      delete slots.pendingChoice;

      if (match.decision === "unmatched" || !match.chosen) {
        slots.visionStatus = "unmatched";
        let cropPath: string | null = null;
        if (source.cropPng) {
          cropPath = await uploadPng(supabase, "crops", `unmatched/${conversationId}`, source.cropPng).catch(
            () => null,
          );
        }
        await supabase.from("unmatched_demands").insert({
          merchant_id: merchantId,
          conversation_id: conversationId,
          description:
            (typeof slots.productDescriptionEn === "string" ? slots.productDescriptionEn : null) ??
            (typeof slots.samNounPhrase === "string" ? slots.samNounPhrase : null),
          crop_path: cropPath,
          embedding: source.embedding ?? null,
        });
        await channelAdapter.sendText(
          conversationId,
          "Samahni, ma l9itch el produit hedha 3andna fel catalogue. Tnajem tab3atli taswira awda7, walla ousifli el produit b kelmet o5rin?",
        );
        return;
      }

      const chosen = match.chosen;
      if (match.decision === "buttons") {
        slots.visionStatus = "needs_confirmation";
        slots.pendingChoice = {
          kind: "product",
          options: match.top.map((c, i) => ({
            label: buttonTitle(i, c.name),
            productId: c.productId,
            name: c.name,
            cropPath: c.cropPath,
            sourcePath: c.sourcePath,
          })),
        } satisfies PendingChoice;
        if (source.cropPng) {
          const cropMediaPath = await uploadPng(supabase, "buyer-media", `vision/${conversationId}`, source.cropPng);
          await channelAdapter.sendImage(conversationId, cropMediaPath, "Hedhi el taswira elli b3athetha ðŸ‘‡");
        } else {
          for (const [i, candidate] of match.top.entries()) {
            const photo = catalogPhotoPath(candidate);
            if (photo) await channelAdapter.sendImage(conversationId, photo, `${i + 1} Â· ${candidate.name}`);
          }
        }
        const sizeNote = typeof slots.size === "string" ? ` (sajaltlek taille ${slots.size}!)` : "";
        await channelAdapter.sendButtons(
          conversationId,
          slots.primaryIntent === "ask_price"
            ? `Qarrebt barcha${sizeNote}! A5tar el produit w na3tik el soum el sahih:`
            : `Qarrebt barcha${sizeNote}! A5tar el produit el sahih:`,
          match.top.map((c, i) => ({ id: `product-${i}`, title: buttonTitle(i, c.name) })),
        );
        return;
      }

      // decision === "propose"
      slots.matchedProductId = chosen.productId;
      slots.matchedProductName = chosen.name;
      slots.matchedSimilarity = Math.round(match.score * 1000) / 1000;

      if (chosen.stock <= 0) {
        slots.visionStatus = "out_of_stock";
        if (match.alternative) {
          slots.alternativeProductId = match.alternative.productId;
          slots.alternativeProductName = match.alternative.name;
          const text =
            `Samahni, ${chosen.name} kemmel (ma3adch mawjoud fel stock). ` +
            `Amma l9it hedha el qarib lou barcha: ${match.alternative.name}. T7eb tkammel bih?`;
          const alternativePhoto = catalogPhotoPath(match.alternative);
          if (alternativePhoto) {
            await channelAdapter.sendImage(conversationId, alternativePhoto, text);
          } else {
            await channelAdapter.sendText(conversationId, text);
          }
        } else {
          await channelAdapter.sendText(
            conversationId,
            `Samahni, ${chosen.name} kemmel (ma3adch mawjoud fel stock). T7eb nchouflek produit a5ar yechbeh lou?`,
          );
        }
        return;
      }

      slots.visionStatus = "matched";
      const text = await phraseMatchCaption(slots, chosen.name, chosen.priceMillimes, combinedText, conversationId);
      if (source.cropPng) {
        const cropMediaPath = await uploadPng(supabase, "buyer-media", `vision/${conversationId}`, source.cropPng);
        await channelAdapter.sendImage(conversationId, cropMediaPath, text);
      } else {
        const photo = catalogPhotoPath(chosen);
        if (photo) await channelAdapter.sendImage(conversationId, photo, text);
        else await channelAdapter.sendText(conversationId, text);
      }
    };

    const pending = readPendingChoice(slots);

    try {
      if (pending && imageCount === 0) {
        // The buyer is answering a disambiguation question.
        let index = parseChoice(combinedText, pending.options.length);
        if (index === null) {
          const lowered = combinedText.toLowerCase();
          const byName = pending.options.findIndex(
            (o) => o.name && lowered.includes(o.name.toLowerCase()),
          );
          if (byName >= 0) index = byName;
        }
        if (index === null) {
          await channelAdapter.sendButtons(
            conversationId,
            slots.primaryIntent === "ask_price"
              ? "Lezem ta5tar el produit el sahih bch na3tik el soum. A5tar b el ra9m:"
              : "Ma fhemtch a5tartek. A5tar b el ra9m:",
            pending.options.map((o, i) => ({ id: `${pending.kind}-${i}`, title: o.label })),
          );
          visionHandled = true;
        } else if (pending.kind === "product") {
          const option = pending.options[index];
          await logEvent(conversationId, "vision.choice", { kind: "product", index, productId: option.productId });
          delete slots.pendingChoice;
          await absorbLateTextMessages().catch(() => undefined);
          if (option.productId) {
            const { data: product } = await supabase
              .from("products")
              .select("id, name, stock, price_millimes")
              .eq("id", option.productId)
              .maybeSingle();
            if (product) {
              slots.matchedProductId = product.id;
              slots.matchedProductName = product.name;
              slots.visionStatus = "matched";
              const text = await phraseMatchCaption(
                slots,
                product.name as string,
                product.price_millimes as number,
                combinedText,
                conversationId,
              );
              const photo = catalogPhotoPath(option);
              if (photo) await channelAdapter.sendImage(conversationId, photo, text);
              else await channelAdapter.sendText(conversationId, text);
            }
          }
          visionHandled = true;
        } else {
          // kind === "crop": ladder step (d) â€” SAM point prompt on the chosen box.
          const option = pending.options[index];
          await logEvent(conversationId, "vision.choice", { kind: "crop", index });
          delete slots.pendingChoice;
          let resolved: { match: MatchResult; cropPng: Buffer } | null = null;
          if (pending.imageMediaPath && option.box) {
            const original = await downloadBuyerMedia(supabase, pending.imageMediaPath);
            resolved = await resolvePointSelection({
              supabase,
              merchantId,
              image: original.buffer,
              mime: original.mime,
              box: option.box,
              conversationId,
            }).catch(() => null);
            await logEvent(conversationId, "vision.point", { ok: resolved !== null, index });
          }
          if (resolved) {
            await applyMatch(resolved.match, { cropPng: resolved.cropPng });
          } else if (option.cropMediaPath) {
            // Fall back to the stored concept-prompt crop.
            const stored = await downloadBuyerMedia(supabase, option.cropMediaPath);
            const [embedding] = await embedImages([stored.buffer.toString("base64")], conversationId);
            const match = await matchProduct({
              supabase,
              merchantId,
              embedding,
              cropPng: stored.buffer,
              conversationId,
            });
            await applyMatch(match, { cropPng: stored.buffer, embedding });
          }
          visionHandled = true;
        }
      } else if (firstImage) {
        delete slots.pendingChoice;
        const outcome = await resolveScreenshot({
          supabase,
          merchantId,
          image: firstImage.buffer,
          mime: firstImage.mime,
          samNounPhrase:
            (typeof slots.samNounPhrase === "string" ? slots.samNounPhrase : null) ?? "clothing",
          spatialHint: typeof slots.spatialHint === "string" ? slots.spatialHint : null,
          buyerText: combinedText,
          color: typeof slots.color === "string" ? slots.color : null,
          conversationId,
        });
        await logEvent(conversationId, "vision.ladder", {
          status: outcome.status,
          options: outcome.status === "needs_choice" ? outcome.options.length : undefined,
        });
        if (outcome.status === "matched") {
          await applyMatch(outcome.match, { cropPng: outcome.option.cropPng, embedding: outcome.option.embedding });
        } else if (outcome.status === "unmatched") {
          await applyMatch(outcome.match, {
            cropPng: outcome.option?.cropPng,
            embedding: outcome.embedding,
          });
        } else if (outcome.status === "needs_choice") {
          await absorbLateTextMessages().catch(() => undefined);
          slots.visionStatus = "needs_choice";
          const options: PendingOption[] = [];
          for (const option of outcome.options) {
            const cropMediaPath = await uploadPng(
              supabase,
              "buyer-media",
              `vision/${conversationId}`,
              option.cropPng,
            );
            options.push({
              label: buttonTitle(option.index, option.best?.name),
              name: option.best?.name,
              box: option.box,
              cropMediaPath,
            });
          }
          slots.pendingChoice = {
            kind: "crop",
            imageMediaPath: firstImage.mediaPath,
            samNounPhrase: typeof slots.samNounPhrase === "string" ? slots.samNounPhrase : null,
            options,
          } satisfies PendingChoice;
          const overlayPath = await uploadPng(supabase, "buyer-media", `vision/${conversationId}`, outcome.overlayPng);
          const sizeNote = typeof slots.size === "string" ? ` (sajaltlek taille ${slots.size}!)` : "";
          await channelAdapter.sendImage(conversationId, overlayPath, `L9it barcha produits fel taswira ðŸ‘‡${sizeNote}`);
          await channelAdapter.sendButtons(
            conversationId,
            "Chnowa el produit elli t7eb alih? A5tar el ra9m:",
            options.map((o, i) => ({ id: `crop-${i}`, title: o.label })),
          );
        } else {
          slots.visionStatus = "no_garment";
          await channelAdapter.sendText(
            conversationId,
            "Wesletni el taswira, amma ma l9itch fiha produit lazem. Tnajem tab3atli taswira awda7 lel produit?",
          );
        }
        visionHandled = true;
      } else if (
        !slots.matchedProductId &&
        typeof slots.productDescriptionEn === "string" &&
        slots.productDescriptionEn
      ) {
        // Voice-only / text-only: PE text embedding into the same index.
        const { match, embedding } = await matchByDescription({
          supabase,
          merchantId,
          descriptionEn: slots.productDescriptionEn,
          conversationId,
        });
        await logEvent(conversationId, "vision.textMatch", {
          description: slots.productDescriptionEn,
          decision: match.decision,
        });
        await applyMatch(match, { embedding });
        visionHandled = true;
      }
    } catch (err) {
      // Vision must never kill the turn: log and fall back to the Day-2 ack.
      await logEvent(conversationId, "vision.error", {
        error: err instanceof Error ? err.message : String(err),
      });
      visionHandled = false;
    }

    if (visionHandled) {
      await saveAndLog("vision");
      // Buyer may have given every slot in the matching turn itself:
      // advance straight to pin/summary instead of stopping at the match.
      const action = nextAction(slots);
      if (action === "need_pin" || action === "need_summary") {
        // progressCheckout persists slots itself (pin/summary writes carry
        // their own slot updates) â€” do not overwrite with the stale copy.
        await progressCheckout().catch(() => false);
      }
      return;
    }

    // Checkout transitions (negotiation, pin, summary) run before the
    // generic question/ack replies; price/stock questions keep priority.
    if (
      typeof slots.matchedProductId === "string" &&
      result.primaryIntent !== "ask_price" &&
      result.primaryIntent !== "ask_stock"
    ) {
      const handled = await progressCheckout().catch(async (err) => {
        await logEvent(conversationId, "checkout.error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return false;
      });
      if (handled) {
        // progressCheckout already persisted the turn's slots at entry.
        await supabase.from("conversations").update({ updated_at: burstCursor }).eq("id", conversationId);
        await logEvent(conversationId, "reply.sent", { reply: "checkout", template: "day5-checkout" });
        return;
      }
    }

    // Direct questions (price, stock) are answered before any slot is
    // chased: the buyer asked something specific, so reply to that first.
    const matchedId = typeof slots.matchedProductId === "string" ? slots.matchedProductId : null;
    const { data: matchedProduct } = matchedId
      ? await supabase
          .from("products")
          .select("name, price_millimes, stock")
          .eq("id", matchedId)
          .maybeSingle()
      : { data: null };

    if (
      result.primaryIntent === "ask_price" ||
      result.primaryIntent === "ask_stock" ||
      result.primaryIntent === "bargain"
    ) {
      await supabase
        .from("conversations")
        .update({ slots, updated_at: burstCursor })
        .eq("id", conversationId);
      if (matchedProduct && result.primaryIntent === "bargain") {
        const reply =
          firewallChecked(
            `Fhemt elli t7eb soum a9al. El ${matchedProduct.name as string} soumou ${formatMillimesForChat(matchedProduct.price_millimes as number)} â€” ken ysa3dek nkammlou bih hakka, walla nchoufou el soum el akher ma3a el vendeur.`,
            [matchedProduct.price_millimes as number],
          ) ?? "Fhemt elli t7eb soum a9al. Nkammlou w nchoufou el soum m3a el vendeur?";
        await channelAdapter.sendText(conversationId, reply);
        await logEvent(conversationId, "reply.sent", { reply, template: "bargain-ack" });
      } else if (matchedProduct && result.primaryIntent === "ask_price") {
        const fallback =
          firewallChecked(
            buildPriceReply(
              matchedProduct.name as string,
              matchedProduct.price_millimes as number,
              slots,
              matchedProduct.stock as number,
            ),
            [matchedProduct.price_millimes as number],
          ) ?? `El ${matchedProduct.name as string} mawjoud 3andna. T7eb nkammlou bih?`;
        const phrased = await phraseSellerReply(
          {
            situation: "price_answer",
            buyerText: combinedText,
            productName: matchedProduct.name as string,
            priceMillimes: matchedProduct.price_millimes as number,
            stock: matchedProduct.stock as number,
            size: typeof slots.size === "string" ? slots.size : null,
            quantity: typeof slots.quantity === "number" ? slots.quantity : null,
            governorate: typeof slots.governorate === "string" ? slots.governorate : null,
            hasPhone: typeof slots.phone === "string",
            hasName: typeof slots.customerName === "string",
            nextAction: nextAction(slots),
            fallbackText: fallback,
          },
          conversationId,
        );
        await channelAdapter.sendText(conversationId, phrased.text);
        await logEvent(conversationId, "reply.sent", { reply: phrased.text, template: `price-${phrased.source}` });
      } else if (matchedProduct) {
        const fallback = buildStockReply(matchedProduct.name as string, matchedProduct.stock as number, slots);
        const phrased = await phraseSellerReply(
          {
            situation: "stock_answer",
            buyerText: combinedText,
            productName: matchedProduct.name as string,
            priceMillimes: matchedProduct.price_millimes as number,
            stock: matchedProduct.stock as number,
            size: typeof slots.size === "string" ? slots.size : null,
            quantity: typeof slots.quantity === "number" ? slots.quantity : null,
            governorate: typeof slots.governorate === "string" ? slots.governorate : null,
            hasPhone: typeof slots.phone === "string",
            hasName: typeof slots.customerName === "string",
            nextAction: nextAction(slots),
            fallbackText: fallback,
          },
          conversationId,
        );
        await channelAdapter.sendText(conversationId, phrased.text);
        await logEvent(conversationId, "reply.sent", { reply: phrased.text, template: `stock-${phrased.source}` });
      } else {
        const reply =
          result.primaryIntent === "ask_stock"
            ? "Marhba bik! Ab3atli taswirt el produit walla ousifhouli, w n9ollek fisa3 ken mawjoud fel stock."
            : "Marhba bik! Bch na3tik el soum el sahih, ab3atli taswirt el produit walla ousifhouli (el loun w el modÃ¨le).";
        await channelAdapter.sendText(conversationId, reply);
        await logEvent(conversationId, "reply.sent", { reply, template: "question-clarify" });
      }
      return;
    }

    await supabase
      .from("conversations")
      .update({ slots, updated_at: burstCursor })
      .eq("id", conversationId);

    const fallbackAck = buildAck(slots, imageCount > 0, hadAudio);
    const phrasedAck = fast
      ? { text: fallbackAck, source: "template" as const }
      : await phraseSellerReply(
      {
        situation: "collect_slot",
        buyerText: combinedText,
        productName:
          (typeof slots.matchedProductName === "string" ? slots.matchedProductName : null) ??
          (matchedProduct ? (matchedProduct.name as string) : null),
        priceMillimes: matchedProduct ? (matchedProduct.price_millimes as number) : null,
        stock: matchedProduct ? (matchedProduct.stock as number) : null,
        size: typeof slots.size === "string" ? slots.size : null,
        quantity: typeof slots.quantity === "number" ? slots.quantity : null,
        governorate: typeof slots.governorate === "string" ? slots.governorate : null,
        hasPhone: typeof slots.phone === "string",
        hasName: typeof slots.customerName === "string",
        nextAction: nextAction(slots),
        fallbackText: fallbackAck,
      },
      conversationId,
    );
    await channelAdapter.sendText(conversationId, phrasedAck.text);
    await logEvent(conversationId, "reply.sent", { reply: phrasedAck.text, template: `ack-${phrasedAck.source}` });
  } finally {
    running.delete(conversationId);
    if (pendingRerun.has(conversationId)) {
      pendingRerun.delete(conversationId);
      void runTurn(conversationId).catch((err) => {
        console.error(`[handleTurn] rerun ${conversationId}:`, err);
      });
    }
  }
}
