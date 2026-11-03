import type { createAdminClient } from "@/lib/supabase/admin";

export type ReplyLanguage = "derja" | "ar" | "fr" | "en";

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
  return undefined;
}
