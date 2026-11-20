import { sparkText } from "@/lib/ai/spark";
import {
  buildAiControlPromptDirectives,
  hasCustomStyleControls,
  maxReplyCharsForLength,
  type WorkspaceAiControls,
} from "@/lib/context/ai-controls";
import { extractAmountsMillimes, passesPriceFirewall } from "@/lib/domain/firewall";
import { firewallChecked, formatMillimesForChat } from "@/lib/domain/pricing";
import type { NextAction } from "@/lib/domain/slots";
import {
  effectiveReplyLanguage,
  effectiveReplyScript,
  sellerControlsFor,
  sellerVoiceFor,
  type ReplyLanguage,
} from "./seller-voice";

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
  buyerText?: string;
  shopContext?: string;
  conversationHistory?: string;
  controls?: WorkspaceAiControls;
  deadlineMs?: number;
}

const PHRASE_DEADLINE_MS = 8_000;

/** Uses Gemini/Spark under a generous deadline so natural replies complete without timing out into templates. */
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

/** Model text under the phrasing deadline, with the provider request cancelled on timeout. */
async function sparkTextWithDeadline(req: {
  system?: string;
  user: string;
  conversationId?: string;
  languageHint?: ReplyLanguage;
  deadlineMs?: number;
}): Promise<string> {
  const timeoutMs = req.deadlineMs ?? PHRASE_DEADLINE_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await withDeadline(
      sparkText({
        system: req.system,
        user: req.user,
        conversationId: req.conversationId,
        tier: "style_writer",
        languageHint: req.languageHint,
        signal: controller.signal,
      }),
      timeoutMs,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Applies language, Derja script, custom tone note, and AI reply controls (length/style/emojis). */
function applyVoice(system: string, conversationId?: string, explicitControls?: WorkspaceAiControls): string {
  const voice = sellerVoiceFor(conversationId);
  const controls = explicitControls ?? sellerControlsFor(conversationId);
  const language = effectiveReplyLanguage(conversationId);
  const script = effectiveReplyScript(conversationId);
  const hasControls = hasCustomStyleControls(controls);
  if (language === "derja" && script !== "arabic" && !voice.instructions.trim() && !hasControls) return system;
  const note = voice.instructions.trim().slice(0, 2000).replace(/\s+/g, " ");
  const languageLine =
    language === "derja" && script === "arabic"
      ? "Reply in natural Tunisian Derja written in Arabic script (not Modern Standard Arabic, not Arabizi)."
      : LANGUAGE_LINE[language];
  const parts = [system, languageLine];
  if (hasControls) {
    parts.push(buildAiControlPromptDirectives(controls, language));
  }
  if (note) {
    parts.push(`Seller note about tone only, never a price: ${note}`);
  }
  return parts.join("\n");
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

export function negotiationTemplateArabicScript(facts: NegotiationFacts): string {
  const offer = formatMillimesForChat(facts.offerMillimes);
  if (facts.acceptedCounter) {
    return `موافق على راسي! السعر الأخير هو ${offer}. نكملو الطلب بيه؟`;
  }
  if (facts.isFinal) {
    return `والله هذا آخر سعر نقدر نعملهولك: ${offer}. ما نقدرش نقص أكثر، تحب نكملو بيه؟`;
  }
  return `على خاطرك نعملك سعر باهي: ${offer}. كان يساعدك نكملو الطلب بيه!`;
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
  const controls = facts.controls ?? sellerControlsFor(conversationId);
  const language = effectiveReplyLanguage(conversationId);
  const script = effectiveReplyScript(conversationId);
  const fallback =
    language === "derja"
      ? script === "arabic"
        ? negotiationTemplateArabicScript(facts)
        : negotiationTemplate(facts)
      : localizedNegotiation(facts, language);
  const offer = formatMillimesForChat(facts.offerMillimes);
  const maxChars = maxReplyCharsForLength(controls.replyLength, "negotiation");
  try {
    const raw = await sparkTextWithDeadline({
      system: applyVoice(
        "You are a warm, genuine, easygoing Tunisian shop seller texting on WhatsApp/Instagram in natural Tunisian Derja (Arabizi). " +
        "Use ONLY the facts given. Never invent or change an amount: the only prices you may write are the offer " +
        "and the list price, exactly as formatted. Sound like a real human shop owner chatting naturally ('3la rasi', '3aychek', 'mrigel'), never a template or robot. No markdown.",
        conversationId,
        controls,
      ),
      user: [
        facts.conversationHistory ? `Recent conversation:\n${facts.conversationHistory}` : null,
        facts.buyerText ? `Buyer just said: ${facts.buyerText}` : null,
        `Product: ${facts.productName}`,
        `List price: ${formatMillimesForChat(facts.listPriceMillimes)}`,
        `Offer to state: ${offer}`,
        facts.acceptedCounter
          ? "The buyer's counter-offer was accepted. Confirm the agreed price warmly and ask to continue the order."
          : facts.isFinal
            ? "This is the final offer (akher soum): the seller cannot go lower. Say so politely and warmly, and ask if they still want to order."
            : "Make this counter-offer warmly like a Tunisian seller and ask if it suits them to continue the order.",
      ]
        .filter(Boolean)
        .join("\n"),
      conversationId,
      languageHint: language,
      deadlineMs: facts.deadlineMs,
    });
    const candidate = raw.trim();
    const allowed = [facts.offerMillimes, facts.listPriceMillimes];
    const statesOffer = extractAmountsMillimes(candidate).includes(facts.offerMillimes);
    if (
      candidate.length > 0 &&
      candidate.length <= maxChars &&
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

const ASSISTANCE: Record<
  ReplyLanguage,
  Record<"ask_delivery" | "ask_policy" | "track_order_ordered" | "track_order_none", string>
> = {
  derja: {
    ask_delivery:
      "El livraison tethseb 3la el wilaya mte3ek w tet2akked fel récap 9bal ma takked. Généralement el commande tet7adhar ba3d ma el vendeur yakkedha, w nwassloulek el wa9t el mou2akked m3a el vendeur.",
    ask_policy:
      "Ken el taille ma jech mrigel, tnajem tbeddelha m3a el vendeur ba3d el livraison 3la 7seb el disponibilité. 9olli el taille el jdida w nbeddelha lek fel commande taw ken ma tb3attech.",
    track_order_ordered:
      "El commande mte3ek mtakkda w 3and el vendeur taw. Yab3atlek el mise à jour mta3 el envoi ki tetb3at.",
    track_order_none:
      "Mazelt ma l9it commande mtakkda b esmek fel conversation hethi. Ken akkadt deja, el vendeur taw ykabarek b el envoi.",
  },
  fr: {
    ask_delivery:
      "La livraison est calculée selon votre gouvernorat et confirmée dans le récapitulatif avant validation. En général, la commande est préparée après confirmation du vendeur, et le délai confirmé vous est communiqué avec lui.",
    ask_policy:
      "Si la taille ne convient pas, vous pouvez l'échanger avec le vendeur après la livraison selon les disponibilités. Dites-moi la nouvelle taille et je la change dans la commande si elle n'est pas encore expédiée.",
    track_order_ordered:
      "Votre commande est confirmée et chez le vendeur. Il vous enverra la mise à jour d'expédition dès l'envoi.",
    track_order_none:
      "Je ne trouve pas encore de commande confirmée à votre nom dans cette conversation. Si vous avez déjà confirmé, le vendeur vous informera de l'envoi.",
  },
  en: {
    ask_delivery:
      "Delivery is calculated from your governorate and confirmed in the summary before you confirm. Orders are usually prepared after the seller confirms, and the confirmed timing is shared with the seller.",
    ask_policy:
      "If the size is not right, you can exchange it with the seller after delivery, subject to availability. Tell me the new size and I will update the order if it has not shipped yet.",
    track_order_ordered:
      "Your order is confirmed and with the seller now. They will send you the shipping update once it ships.",
    track_order_none:
      "I can't find a confirmed order under your name in this conversation yet. If you already confirmed, the seller will update you on shipping.",
  },
  ar: {
    ask_delivery:
      "التوصيل يُحسب حسب ولايتك ويتأكد في الملخص قبل التأكيد. عادة تُحضّر الطلبات بعد تأكيد البائع، ويُشاركك الوقت المؤكد مع البائع.",
    ask_policy:
      "إذا لم يناسبك المقاس، يمكنك تبديله مع البائع بعد التوصيل حسب التوفر. قل لي المقاس الجديد وأبدّله في الطلب إذا لم يُرسل بعد.",
    track_order_ordered: "طلبك مؤكد وعند البائع الآن. سيبعث لك تحديث الشحن عند الإرسال.",
    track_order_none:
      "لا أجد بعد طلبًا مؤكدًا باسمك في هذه المحادثة. إذا أكدت من قبل، فسيخبرك البائع بالشحن.",
  },
};

/** Deterministic side-question answers, in the buyer's language. No amounts are invented here. */
export function assistanceReply(
  intent: "ask_delivery" | "ask_policy" | "track_order",
  hasOrder: boolean,
  language: ReplyLanguage = "derja",
): string {
  const table = ASSISTANCE[language];
  if (intent === "ask_delivery") return table.ask_delivery;
  if (intent === "ask_policy") return table.ask_policy;
  return hasOrder ? table.track_order_ordered : table.track_order_none;
}

export interface SellerReplyFacts {
  situation:
    | "matched"
    | "collect_slot"
    | "price_answer"
    | "stock_answer"
    | "greeting"
    | "general_qa"
    | "delivery_policy"
    | "draft_change"
    | "out_of_stock"
    | "unmatched";
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
  /** Full ask bundle (e.g. name + phone together). Defaults to [nextAction]. */
  askBundle?: NextAction[];
  askHint?: string | null;
  /** Vertical-aware size instruction ("shoe size / pointure..."), replacing the clothing default. */
  sizeAsk?: string | null;
  /** Full deterministic shop context (catalog, delivery fees, policies, owner live notes). */
  shopContext?: string;
  /** Recent prior conversation lines (`Client:` / `You:`) with zero timestamps/IDs. */
  conversationHistory?: string;
  /** Extra verified non-floor amounts (catalog list prices, delivery fees, free delivery threshold). */
  allowedExtraMillimes?: number[];
  /** Human-readable description of a deterministic draft change applied this turn. */
  draftChangeNote?: string | null;
  /** Workspace reply controls (length, style, emoji level, language mode). */
  controls?: WorkspaceAiControls;
  /** Optional custom deadline override (defaults to PHRASE_DEADLINE_MS). */
  deadlineMs?: number;
  fallbackText: string;
}

function nextStepInstruction(
  action: NextAction,
  hasSize: boolean,
  askHint?: string | null,
  bundle?: NextAction[],
  sizeAsk?: string | null,
): string {
  switch (action) {
    case "need_product":
      return "Ask the buyer warmly which item they want (they can send a screenshot/photo or describe it).";
    case "need_size":
      return askHint ?? sizeAsk ?? "Ask for their clothing size (S, M, L, XL).";
    case "need_name":
      if (bundle?.includes("need_phone")) {
        return "Ask for their name AND their Tunisian phone number in ONE single message (name + number together, like 'Ahmed 55123456'). Do not ask them in separate messages.";
      }
      return "Ask for their name, the way a Tunisian seller would (esmek).";
    case "need_phone":
      return "Ask for their Tunisian phone number to register the order.";
    case "need_governorate":
      return "Ask which governorate (wilaya) they live in and the nearest landmark (pharmacie, café, mosquée, école) to their home, in one message.";
    case "need_landmark":
      return "They already gave the governorate; ask only for the nearest well-known landmark (pharmacie, café, mosquée, école) near their home so you can send the map pin.";
    default:
      return hasSize
        ? "Ask if they want to proceed with the order. Do not ask for a size again."
        : "Do not ask for a size. Ask only for the next missing detail.";
  }
}

/** Strict reply discipline: a candidate that re-asks a known slot, or fires
 * several questions at once, is rejected so the bundled template is sent. */
export function replyViolatesDiscipline(
  candidate: string,
  facts: SellerReplyFacts,
): boolean {
  const questions = (candidate.match(/[?؟]/g) ?? []).length;
  if (questions > 2) return true;
  if (facts.hasPhone && /(?:chnowa|chnia|a3tini|aatini|9olli|quel|quelle|what|give|donnez|donne|اعطيني|ما هو).{0,40}(?:num(?:ero|éro)?|téléphone|telephone|phone|رقم|هاتف)/i.test(candidate)) {
    return true;
  }
  if (facts.hasName && /(?:chnowa|chnia|a3tini|aatini|9olli|quel est votre nom|what is your name|ما اسمك).{0,20}/i.test(candidate) && /esmek|votre nom|your name|اسمك/i.test(candidate)) {
    return true;
  }
  if (facts.governorate && /(?:win toskon|où habitez|where do you live|أين تسكن|quelle? (?:ville|gouvernorat)|which (?:city|governorate))/i.test(candidate)) {
    return true;
  }
  return false;
}

function normalizeReplyThousands(reply: string, allowedSet: Set<number>): string {
  return reply.replace(
    /\b(\d{1,3})[,\s](\d{3})\s*(dt|dinar|dinars|دينار)\b/gi,
    (full, head: string, tail: string) => {
      const asThousands = (Number(head) * 1000 + Number(tail)) * 1000;
      const asDecimal = Number(head) * 1000 + Number(tail);
      if (allowedSet.has(asThousands) && !allowedSet.has(asDecimal)) {
        return formatMillimesForChat(asThousands);
      }
      return full;
    },
  );
}

/**
 * Shared validator for both unified 1-call replies and `phraseSellerReply`:
 * enforces price firewall (catalog prices & delivery fees only — never invented/floor amounts),
 * required price presence when answering a price ask, and no-repeat-question discipline.
 */
export function validateSellerCandidateReply(
  rawCandidate: string,
  facts: SellerReplyFacts,
): string | null {
  const trimmed = rawCandidate.trim();
  const maxChars = maxReplyCharsForLength(facts.controls?.replyLength ?? "medium", "ecommerce");
  if (!trimmed || trimmed.length > maxChars) return null;

  const allowedSet = new Set<number>();
  if (typeof facts.priceMillimes === "number" && facts.priceMillimes > 0) {
    allowedSet.add(facts.priceMillimes);
  }
  for (const extra of facts.allowedExtraMillimes ?? []) {
    if (typeof extra === "number" && Number.isInteger(extra) && extra > 0) {
      allowedSet.add(extra);
    }
  }
  const allowed = [...allowedSet];
  const candidate = normalizeReplyThousands(trimmed, allowedSet);

  // Never allow the model to re-ask for size or name when already known.
  if (facts.size && /(?:chnowa|chnia|a3tini|aatini|9olli).*\b(?:taille|size)\b/i.test(candidate)) {
    return null;
  }
  if (facts.hasName && /(?:chnowa|chnia|a3tini|aatini|9olli).{0,40}\besmek\b/i.test(candidate)) {
    return null;
  }
  if (replyViolatesDiscipline(candidate, facts)) {
    return null;
  }

  // Price firewall check
  if (!passesPriceFirewall(candidate, allowedSet) || firewallChecked(candidate, allowed) === null) {
    return null;
  }

  // If answering a direct price question, the exact product price must be stated.
  if (
    facts.situation === "price_answer" &&
    typeof facts.priceMillimes === "number" &&
    !extractAmountsMillimes(candidate).includes(facts.priceMillimes)
  ) {
    return null;
  }

  return candidate;
}

/**
 * Generates a natural, human-sounding Tunisian seller reply for product matches,
 * slot collection, price/stock answers, greetings, delivery/policy Q&A, and general questions
 * while strictly enforcing the price firewall and slot-discipline rules.
 */
export async function phraseSellerReply(
  facts: SellerReplyFacts,
  conversationId?: string,
): Promise<{ text: string; source: "spark" | "template" }> {
  const allowedSet = new Set<number>();
  if (typeof facts.priceMillimes === "number" && facts.priceMillimes > 0) {
    allowedSet.add(facts.priceMillimes);
  }
  for (const extra of facts.allowedExtraMillimes ?? []) {
    if (typeof extra === "number" && Number.isInteger(extra) && extra > 0) {
      allowedSet.add(extra);
    }
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
  if (facts.draftChangeNote) knownParts.push(`Order update just applied: ${facts.draftChangeNote}`);

  const askLead =
    facts.situation === "price_answer"
      ? "Answer their price question first, stating the exact catalog price."
      : facts.situation === "stock_answer"
        ? "Answer their stock question first."
        : facts.situation === "greeting"
          ? "Greet them warmly and naturally like a real Tunisian shop owner, and invite them to tell you what they are looking for or ask any question."
          : facts.situation === "delivery_policy" || facts.situation === "general_qa"
            ? "Answer their exact question directly and helpfully using the Shop Knowledge & Live Owner Context below."
            : facts.situation === "draft_change"
              ? "Confirm the exact order change naturally."
              : null;
  const shouldIncludeNextStep =
    facts.situation !== "greeting" &&
    !(facts.situation === "general_qa" && !facts.productName);
  const askInstruction = [
    askLead,
    shouldIncludeNextStep
      ? nextStepInstruction(facts.nextAction, Boolean(facts.size), facts.askHint, facts.askBundle, facts.sizeAsk)
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const allowedListText =
    allowedSet.size > 0
      ? [...allowedSet].map((m) => formatMillimesForChat(m)).join(", ")
      : "None (do NOT write any price or money amount)";

  const controls = facts.controls ?? sellerControlsFor(conversationId);
  const effectiveLang = effectiveReplyLanguage(conversationId);
  const lengthAndStyleBlock = buildAiControlPromptDirectives(controls, effectiveLang);
  const factsWithControls: SellerReplyFacts = { ...facts, controls };

  try {
    const raw = await sparkTextWithDeadline({
      system: applyVoice(
        "You are a real, warm, friendly Tunisian shop owner texting directly on WhatsApp/Instagram in natural Tunisian Derja (Arabizi). " +
        "Talk like a real human running your own boutique — NEVER like a fixed template, script, or form. " +
        "CRITICAL RULES:\n" +
        "1. Answer what the buyer ACTUALLY asked first using the Shop Knowledge & Live Owner Context (products, stock, delivery fees, policies, hours, promos, calendar schedule). Never ignore their question!\n" +
        "2. Acknowledge any new detail they just gave and NEVER re-ask information marked as already recorded or already answered in Recent Conversation.\n" +
        "3. Vary your phrasing naturally across turns — do not repeat identical greetings if you already greeted them.\n" +
        "4. If an order is in progress, gently weave in ONLY the next needed detail in 'Next step to ask' (at most 1-2 question marks total).\n" +
        `5. Money firewall: NEVER invent or alter any price or delivery fee. Only amounts you may write: ${allowedListText}. Write prices cleanly like 110DT or 7DT.\n` +
        `6. ${lengthAndStyleBlock}\n` +
        "7. No markdown headings or bullet templates.",
        conversationId,
        controls,
      ),
      user: [
        facts.shopContext ? `Shop Knowledge & Live Owner Context:\n${facts.shopContext}` : null,
        facts.conversationHistory ? `Recent Conversation:\n${facts.conversationHistory}` : null,
        `Situation: ${facts.situation}`,
        `Buyer just said: ${facts.buyerText || "(sent product image)"}`,
        `Known order info:\n${knownParts.join("\n") || "None yet"}`,
        typeof facts.stock === "number" ? `Stock count: ${facts.stock}` : null,
        `Next step to ask: ${askInstruction || "Reply helpfully and naturally."}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      conversationId,
      languageHint: effectiveLang,
      deadlineMs: facts.deadlineMs,
    });

    const validated = validateSellerCandidateReply(raw, factsWithControls);
    if (!validated) {
      return { text: facts.fallbackText, source: "template" };
    }

    return { text: validated, source: "spark" };
  } catch {
    return { text: facts.fallbackText, source: "template" };
  }
}

