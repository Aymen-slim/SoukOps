import {
  DEFAULT_AI_CONTROLS,
  loadWorkspaceAiControls,
  normalizeWorkspaceAiControls,
  resolveControlledReplyLanguage,
  type WorkspaceAiControls,
} from "@/lib/context/ai-controls";
import type { BuyerLanguage, TextScript } from "@/lib/domain/language";
import type { createAdminClient } from "@/lib/supabase/admin";

export type ReplyLanguage = BuyerLanguage;

export interface SellerVoice {
  language: ReplyLanguage;
  instructions: string;
  controls?: WorkspaceAiControls;
}

export const DEFAULT_VOICE: SellerVoice = {
  language: "derja",
  instructions: "",
  controls: DEFAULT_AI_CONTROLS,
};

const bound = new Map<string, SellerVoice>();

export function isReplyLanguage(value: unknown): value is ReplyLanguage {
  return value === "derja" || value === "ar" || value === "fr" || value === "en";
}

export function bindSellerVoice(conversationId: string, voice: SellerVoice): void {
  bound.set(conversationId, {
    ...voice,
    controls: voice.controls
      ? normalizeWorkspaceAiControls(voice.controls, voice.language)
      : normalizeWorkspaceAiControls({ primaryLanguage: voice.language }),
  });
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

export function sellerVoiceFor(conversationId?: string): SellerVoice {
  if (!conversationId) return DEFAULT_VOICE;
  return bound.get(conversationId) ?? DEFAULT_VOICE;
}

export function sellerControlsFor(conversationId?: string): WorkspaceAiControls {
  const voice = sellerVoiceFor(conversationId);
  return voice.controls ?? normalizeWorkspaceAiControls({ primaryLanguage: voice.language });
}

/** Resolves effective reply language honoring owner's Language Controls (`auto` vs `fixed`, allowed languages). */
export function effectiveReplyLanguage(conversationId?: string): ReplyLanguage {
  const controls = sellerControlsFor(conversationId);
  return resolveControlledReplyLanguage({
    controls,
    detectedLanguage: buyerLanguageBound(conversationId),
    priorLanguage: buyerLanguageBound(conversationId),
    detectedScript: buyerScriptBound(conversationId),
    priorScript: buyerScriptBound(conversationId),
  }).language;
}

/** Resolves effective script honoring owner's Derja Script Control (`auto` / `latin` / `arabic`). */
export function effectiveReplyScript(conversationId?: string): TextScript | null {
  const controls = sellerControlsFor(conversationId);
  if (controls.derjaScript === "auto" && !buyerScriptBound(conversationId)) {
    return null;
  }
  return resolveControlledReplyLanguage({
    controls,
    detectedLanguage: buyerLanguageBound(conversationId),
    priorLanguage: buyerLanguageBound(conversationId),
    detectedScript: buyerScriptBound(conversationId),
    priorScript: buyerScriptBound(conversationId),
  }).script;
}

type Admin = ReturnType<typeof createAdminClient>;

/** Missing columns (migration not applied yet) keep safe defaults so turns still run. */
export async function loadSellerVoice(supabase: Admin, merchantId: string): Promise<SellerVoice> {
  const [merchantRes, controls] = await Promise.all([
    Promise.resolve(
      supabase
        .from("merchants")
        .select("reply_language, ai_instructions")
        .eq("id", merchantId)
        .maybeSingle(),
    ).catch(() => ({ data: null, error: null })),
    loadWorkspaceAiControls(supabase, merchantId),
  ]);
  const data = merchantRes?.data as { reply_language?: unknown; ai_instructions?: unknown } | null;
  const language = isReplyLanguage(data?.reply_language) ? data.reply_language : controls.primaryLanguage;
  return {
    language: controls.primaryLanguage ?? language,
    instructions: typeof data?.ai_instructions === "string" ? data.ai_instructions : "",
    controls: normalizeWorkspaceAiControls(controls, language),
  };
}

export function asrBias(language: ReplyLanguage): string[] | undefined {
  if (language === "en") return ["English"];
  if (language === "fr") return ["French", "Arabic"];
  if (language === "ar") return ["Arabic"];
  // Derja is Tunisian Arabic: explicit Arabic bias (French for loanwords).
  return ["Arabic", "French"];
}
