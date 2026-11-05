import type { BuyerLanguage, TextScript } from "@/lib/domain/language";
import type { createAdminClient } from "@/lib/supabase/admin";

export type ReplyLanguage = BuyerLanguage;

export interface SellerVoice {
  language: ReplyLanguage;
  instructions: string;
}

export const DEFAULT_VOICE: SellerVoice = { language: "derja", instructions: "" };

const bound = new Map<string, SellerVoice>();

export function isReplyLanguage(value: unknown): value is ReplyLanguage {
  return value === "derja" || value === "ar" || value === "fr" || value === "en";
}

export function bindSellerVoice(conversationId: string, voice: SellerVoice): void {
  bound.set(conversationId, voice);
}

export function clearSellerVoice(conversationId: string): void {
  bound.delete(conversationId);
  boundScript.delete(conversationId);
  boundBuyer.delete(conversationId);
}

const boundScript = new Map<string, TextScript>();

/** Script the buyer writes in (Arabic vs Latin), bound for phrasing. */
export function bindBuyerScript(conversationId: string, script: TextScript): void {
  boundScript.set(conversationId, script);
}

export function buyerScriptBound(conversationId?: string): TextScript | null {
  if (!conversationId) return null;
  return boundScript.get(conversationId) ?? null;
}

const boundBuyer = new Map<string, BuyerLanguage>();

/** The buyer's own language for this conversation (mirrors their messages). */
export function bindBuyerLanguage(conversationId: string, language: BuyerLanguage): void {
  boundBuyer.set(conversationId, language);
}

export function buyerLanguageBound(conversationId?: string): BuyerLanguage | null {
  if (!conversationId) return null;
  return boundBuyer.get(conversationId) ?? null;
}

/** Buyer language wins; the seller template is only the starting default. */
export function effectiveReplyLanguage(conversationId?: string): ReplyLanguage {
  return buyerLanguageBound(conversationId) ?? sellerVoiceFor(conversationId).language;
}

export function sellerVoiceFor(conversationId?: string): SellerVoice {
  if (!conversationId) return DEFAULT_VOICE;
  return bound.get(conversationId) ?? DEFAULT_VOICE;
}

type Admin = ReturnType<typeof createAdminClient>;

/** Missing columns (migration not applied yet) keep the Derja default so turns still run. */
export async function loadSellerVoice(supabase: Admin, merchantId: string): Promise<SellerVoice> {
  const { data, error } = await supabase
    .from("merchants")
    .select("reply_language, ai_instructions")
    .eq("id", merchantId)
    .maybeSingle();
  if (error || !data) return DEFAULT_VOICE;
  return {
    language: isReplyLanguage(data.reply_language) ? data.reply_language : "derja",
    instructions: typeof data.ai_instructions === "string" ? data.ai_instructions : "",
  };
}

export function asrBias(language: ReplyLanguage): string[] | undefined {
  if (language === "en") return ["English"];
  if (language === "fr") return ["French", "Arabic"];
  if (language === "ar") return ["Arabic"];
  // Derja is Tunisian Arabic: explicit Arabic bias (French for loanwords).
  return ["Arabic", "French"];
}
