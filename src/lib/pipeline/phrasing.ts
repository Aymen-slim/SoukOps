import { sparkText } from "@/lib/ai/spark";
import { extractAmountsMillimes, passesPriceFirewall } from "@/lib/domain/firewall";
import { firewallChecked, formatMillimesForChat } from "@/lib/domain/pricing";
import type { NextAction } from "@/lib/domain/slots";
import { sellerVoiceFor, type ReplyLanguage } from "./seller-voice";

/**
 * Spark phrasing for negotiation and conversational seller replies:
 * the model only words facts the deterministic pipeline produced.
 * Every reply is verified by the price firewall; on any failure (model down,
 * invented amount, missing required price) a warm deterministic Derja
 * template is sent instead. No timestamps or random ids in prompts, so
 * cassette replay keys stay stable.
 */

export interface NegotiationFacts {
  productName: string;
  offerMillimes: number;
  listPriceMillimes: number;
  acceptedCounter: boolean;
  isFinal: boolean;
}

const PHRASE_DEADLINE_MS = 900;

/** Uses Spark when it answers quickly. A slow first token falls back to the template so the buyer isn't left waiting. */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("phrasing-deadline"));
    }, ms);
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

const LANGUAGE_LINE: Record<ReplyLanguage, string> = {
  derja: "Reply in natural Tunisian Derja (Arabizi).",
  ar: "Reply in clear Modern Standard Arabic.",
  en: "Reply in clear English.",
  fr: "Reply in clear French.",
};

/** Default Derja prompts stay byte-for-byte so cassette keys do not move. */
function applyVoice(system: string, conversationId?: string): string {
  const voice = sellerVoiceFor(conversationId);
  if (voice.language === "derja" && !voice.instructions.trim()) return system;
  const note = voice.instructions.trim().slice(0, 400).replace(/\s+/g, " ");
  return `${system}\n${LANGUAGE_LINE[voice.language]}${note ? ` Seller note about tone only, never a price: ${note}` : ""}`;
}

function localizedNegotiation(facts: NegotiationFacts, language: ReplyLanguage): string {
  const offer = formatMillimesForChat(facts.offerMillimes);
  if (language === "en") {
    return facts.isFinal
      ? `This is my final price: ${offer}. I can't go lower. Do you want to continue?`
      : `I can do ${offer}. Shall we continue the order?`;
  }
  if (language === "fr") {
    return facts.isFinal
      ? `C'est mon dernier prix : ${offer}. Je ne peux pas descendre plus. On continue ?`
      : `Je peux faire ${offer}. On continue la commande ?`;
  }
  if (language === "ar") {
    return facts.isFinal
      ? `هذا آخر سعر: ${offer}. ما نقدرش ننقص أكثر. نكملو الطلب؟`
      : `نقدر نعمل ${offer}. نكملو الطلب؟`;
  }
  return negotiationTemplate(facts);
}

export function negotiationTemplate(facts: NegotiationFacts): string {
  const offer = formatMillimesForChat(facts.offerMillimes);
  if (facts.acceptedCounter) {
    return `Mawaf9 3la rasi! El soum el akheer howa ${offer}. Nkammlou el commande bih?`;
  }
  if (facts.isFinal) {
    return `Wallahi hedha akher soum najam na3melhoulek: ${offer}. Ma najamch na9es aktar, t7eb nkammlou bih?`;
  }
  return `3la khatrek na3mallek soum behi: ${offer}. Ken ysa3dek nkammlou el commande bih!`;
}

export async function phraseNegotiationReply(
  facts: NegotiationFacts,
  conversationId?: string,
): Promise<{ text: string; source: "spark" | "template" }> {
  const voice = sellerVoiceFor(conversationId);
  const fallback = voice.language === "derja" ? negotiationTemplate(facts) : localizedNegotiation(facts, voice.language);
  const offer = formatMillimesForChat(facts.offerMillimes);
  try {
    const raw = await withDeadline(sparkText({
      system: applyVoice(
        "You are a warm, playful, easygoing Tunisian clothing boutique seller chatting on WhatsApp in natural Tunisian Derja (Arabizi). " +
        "Use ONLY the facts given. Never invent or change an amount: the only prices you may write are the offer " +
        "and the list price, exactly as formatted. Sound like a friend who runs the shop (light, kind, a little playful — '3la rasi', 'yesss', '3aychek', 'mrigel'), never a form. One or two short sentences. No markdown.",
        conversationId,
      ),
      user: [
        `Product: ${facts.productName}`,
        `List price: ${formatMillimesForChat(facts.listPriceMillimes)}`,
        `Offer to state: ${offer}`,
        facts.acceptedCounter
          ? "The buyer's counter-offer was accepted. Confirm the agreed price warmly and ask to continue the order."
          : facts.isFinal
            ? "This is the final offer (akher soum): the seller cannot go lower. Say so politely and warmly, and ask if they still want to order."
            : "Make this counter-offer warmly like a Tunisian seller and ask if it suits them to continue the order.",
      ].join("\n"),
      conversationId,
    }), PHRASE_DEADLINE_MS);
    const candidate = raw.trim();
    const allowed = [facts.offerMillimes, facts.listPriceMillimes];
    const statesOffer = extractAmountsMillimes(candidate).includes(facts.offerMillimes);
    if (
      candidate.length > 0 &&
      candidate.length <= 400 &&
      statesOffer &&
      passesPriceFirewall(candidate, new Set(allowed)) &&
      firewallChecked(candidate, allowed) !== null
    ) {
      return { text: candidate, source: "spark" };
    }
  } catch {
    // Model unavailable or invalid: fixed template below.
  }
  return { text: fallback, source: "template" };
}

export interface SellerReplyFacts {
  situation: "matched" | "collect_slot" | "price_answer" | "stock_answer";
  buyerText: string;
  productName?: string | null;
  priceMillimes?: number | null;
  stock?: number | null;
  size?: string | null;
  quantity?: number | null;
  governorate?: string | null;
  landmark?: string | null;
  hasPhone?: boolean;
  hasName?: boolean;
  nextAction: NextAction;
  fallbackText: string;
}

function nextStepInstruction(action: NextAction, hasSize: boolean): string {
  switch (action) {
    case "need_product":
      return "Ask the buyer warmly which item they want (they can send a screenshot/photo or describe it).";
    case "need_size":
      return "Ask for their clothing size (S, M, L, XL).";
    case "need_name":
      return "Ask for their name, the way a Tunisian seller would (esmek).";
    case "need_phone":
      return "Ask for their Tunisian phone number to register the order.";
    case "need_governorate":
      return "Ask which governorate (wilaya) they live in and the nearest landmark (pharmacie, café, mosquée, école) to their home.";
    case "need_landmark":
      return "They already gave the governorate; ask only for the nearest well-known landmark (pharmacie, café, mosquée, école) near their home so you can send the map pin.";
    default:
      return hasSize
        ? "Ask if they want to proceed with the order."
        : "Ask for their size (S, M, L, XL) if they want to order.";
  }
}

/**
 * Generates a natural, human-sounding Tunisian Derja reply for product matches,
 * slot collection, and price/stock answers while strictly enforcing:
 * 1. Price firewall (no invented numbers; required price must appear when answering price).
 * 2. Never re-asking a slot (like size or governorate) that is already known.
 * 3. Instant fallback to `fallbackText` on any error or firewall violation.
 */
export async function phraseSellerReply(
  facts: SellerReplyFacts,
  conversationId?: string,
): Promise<{ text: string; source: "spark" | "template" }> {
  const allowed: number[] = [];
  if (typeof facts.priceMillimes === "number" && facts.priceMillimes > 0) {
    allowed.push(facts.priceMillimes);
  }
  const formattedPrice =
    typeof facts.priceMillimes === "number" && facts.priceMillimes > 0
      ? formatMillimesForChat(facts.priceMillimes)
      : null;

  const knownParts: string[] = [];
  if (facts.productName) knownParts.push(`Product: ${facts.productName}`);
  if (formattedPrice) knownParts.push(`Exact catalog price: ${formattedPrice}`);
  if (facts.size) knownParts.push(`Size already recorded (DO NOT ask for size again): ${facts.size}`);
  if (facts.quantity && facts.quantity > 1) knownParts.push(`Quantity: ${facts.quantity}`);
  if (facts.governorate) knownParts.push(`Governorate already recorded (DO NOT ask for governorate again): ${facts.governorate}`);
  if (facts.landmark) knownParts.push(`Landmark already recorded: ${facts.landmark}`);
  if (facts.hasName) knownParts.push("Name already recorded (DO NOT ask for the name again)");
  if (facts.hasPhone) knownParts.push("Phone number: already given (DO NOT ask for phone)");

  const askLead =
    facts.situation === "price_answer"
      ? "Answer their price question first, stating the exact catalog price."
      : facts.situation === "stock_answer"
        ? "Answer their stock question first."
        : null;
  const askInstruction = [askLead, nextStepInstruction(facts.nextAction, Boolean(facts.size))].filter(Boolean).join(" ");

  try {
    const raw = await withDeadline(sparkText({
      system: applyVoice(
        "You are a warm, playful, easygoing Tunisian clothing boutique seller chatting on WhatsApp in natural Tunisian Derja (Arabizi). " +
        "Sound like a friend who runs the shop (light, kind, a little playful — 'Ahla bik', 'yesss', '3aychek', 'mrigel', '3la rasi'), NEVER like a bot or a form. " +
        "CRITICAL RULES:\n" +
        "1. Acknowledge any new info the buyer just gave (for example if they gave their size or city, confirm you noted it!) and NEVER ask again for information marked as already recorded.\n" +
        "2. Ask ONLY for the single next needed step described in 'Next step to ask'.\n" +
        "3. Money firewall: NEVER invent or alter any price. If an Exact catalog price is provided and relevant, write it EXACTLY as formatted (e.g. 110DT). If no price is provided, do NOT write any price or money amount.\n" +
        "4. Keep it concise: 1 to 2 natural WhatsApp sentences, no bullet lists, no markdown.",
        conversationId,
      ),
      user: [
        `Situation: ${facts.situation}`,
        `Buyer just said: ${facts.buyerText || "(sent product image)"}`,
        `Known order info:\n${knownParts.join("\n") || "None yet"}`,
        typeof facts.stock === "number" ? `Stock count: ${facts.stock}` : null,
        `Next step to ask: ${askInstruction}`,
      ]
        .filter(Boolean)
        .join("\n"),
      conversationId,
    }), PHRASE_DEADLINE_MS);

    const candidate = raw.trim();
    if (!candidate || candidate.length > 420) {
      return { text: facts.fallbackText, source: "template" };
    }

    // Never allow the model to re-ask for size when we already have size!
    if (facts.size && /(?:chnowa|chnia|a3tini|aatini|9olli).*\b(?:taille|size)\b/i.test(candidate)) {
      return { text: facts.fallbackText, source: "template" };
    }
    if (facts.hasName && /(?:chnowa|chnia|a3tini|aatini|9olli).{0,40}\besmek\b/i.test(candidate)) {
      return { text: facts.fallbackText, source: "template" };
    }

    // Price firewall check
    if (!passesPriceFirewall(candidate, new Set(allowed)) || firewallChecked(candidate, allowed) === null) {
      return { text: facts.fallbackText, source: "template" };
    }

    // If answering a price question, the exact price must be stated
    if (
      facts.situation === "price_answer" &&
      typeof facts.priceMillimes === "number" &&
      !extractAmountsMillimes(candidate).includes(facts.priceMillimes)
    ) {
      return { text: facts.fallbackText, source: "template" };
    }

    return { text: candidate, source: "spark" };
  } catch {
    return { text: facts.fallbackText, source: "template" };
  }
}

