import { z } from "zod";
import { isBuyerLanguage, type BuyerLanguage, type TextScript } from "@/lib/domain/language";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export const REPLY_LENGTHS = ["short", "medium", "long"] as const;
export type ReplyLength = (typeof REPLY_LENGTHS)[number];

export const REPLY_STYLES = ["casual", "balanced", "formal"] as const;
export type ReplyStyle = (typeof REPLY_STYLES)[number];

export const EMOJI_LEVELS = ["none", "light", "expressive"] as const;
export type EmojiLevel = (typeof EMOJI_LEVELS)[number];

export const LANGUAGE_MODES = ["auto", "fixed"] as const;
export type LanguageMode = (typeof LANGUAGE_MODES)[number];

export const DERJA_SCRIPTS = ["auto", "latin", "arabic"] as const;
export type DerjaScriptPref = (typeof DERJA_SCRIPTS)[number];

export const CALENDAR_AUTO_BOOK_MODES = ["tentative", "confirmed", "manual"] as const;
export type CalendarAutoBookMode = (typeof CALENDAR_AUTO_BOOK_MODES)[number];

export const ALL_BUYER_LANGUAGES: readonly BuyerLanguage[] = ["derja", "fr", "ar", "en"];

export interface WorkspaceAiControls {
  replyLength: ReplyLength;
  replyStyle: ReplyStyle;
  emojiLevel: EmojiLevel;
  languageMode: LanguageMode;
  primaryLanguage: BuyerLanguage;
  allowedLanguages: BuyerLanguage[];
  derjaScript: DerjaScriptPref;
  calendarAutoBook: CalendarAutoBookMode;
}

export const DEFAULT_AI_CONTROLS: WorkspaceAiControls = {
  replyLength: "medium",
  replyStyle: "balanced",
  emojiLevel: "light",
  languageMode: "auto",
  primaryLanguage: "derja",
  allowedLanguages: ["derja", "fr", "ar", "en"],
  derjaScript: "auto",
  calendarAutoBook: "tentative",
};

export const workspaceAiControlsPatchSchema = z.object({
  replyLength: z.enum(REPLY_LENGTHS).optional(),
  replyStyle: z.enum(REPLY_STYLES).optional(),
  emojiLevel: z.enum(EMOJI_LEVELS).optional(),
  languageMode: z.enum(LANGUAGE_MODES).optional(),
  primaryLanguage: z.enum(["derja", "fr", "ar", "en"]).optional(),
  allowedLanguages: z.array(z.enum(["derja", "fr", "ar", "en"])).min(1).max(4).optional(),
  derjaScript: z.enum(DERJA_SCRIPTS).optional(),
  calendarAutoBook: z.enum(CALENDAR_AUTO_BOOK_MODES).optional(),
});

export type WorkspaceAiControlsPatch = z.infer<typeof workspaceAiControlsPatchSchema>;

function isOneOf<T extends string>(value: unknown, list: readonly T[]): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

/**
 * Normalizes untrusted/partial control JSON into a safe, canonical `WorkspaceAiControls`.
 * Guarantees `primaryLanguage` is always included in `allowedLanguages` in deterministic order.
 */
export function normalizeWorkspaceAiControls(
  raw: unknown,
  fallbackPrimaryLanguage?: unknown,
): WorkspaceAiControls {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const primaryLanguage: BuyerLanguage = isBuyerLanguage(obj.primaryLanguage)
    ? obj.primaryLanguage
    : isBuyerLanguage(fallbackPrimaryLanguage)
      ? fallbackPrimaryLanguage
      : DEFAULT_AI_CONTROLS.primaryLanguage;

  const rawAllowed = Array.isArray(obj.allowedLanguages)
    ? obj.allowedLanguages.filter((l): l is BuyerLanguage => isBuyerLanguage(l))
    : DEFAULT_AI_CONTROLS.allowedLanguages;
  const allowedSet = new Set<BuyerLanguage>(rawAllowed.length > 0 ? rawAllowed : DEFAULT_AI_CONTROLS.allowedLanguages);
  allowedSet.add(primaryLanguage);
  const allowedLanguages = ALL_BUYER_LANGUAGES.filter((l) => allowedSet.has(l));

  return {
    replyLength: isOneOf(obj.replyLength, REPLY_LENGTHS) ? obj.replyLength : DEFAULT_AI_CONTROLS.replyLength,
    replyStyle: isOneOf(obj.replyStyle, REPLY_STYLES) ? obj.replyStyle : DEFAULT_AI_CONTROLS.replyStyle,
    emojiLevel: isOneOf(obj.emojiLevel, EMOJI_LEVELS) ? obj.emojiLevel : DEFAULT_AI_CONTROLS.emojiLevel,
    languageMode: isOneOf(obj.languageMode, LANGUAGE_MODES) ? obj.languageMode : DEFAULT_AI_CONTROLS.languageMode,
    primaryLanguage,
    allowedLanguages,
    derjaScript: isOneOf(obj.derjaScript, DERJA_SCRIPTS) ? obj.derjaScript : DEFAULT_AI_CONTROLS.derjaScript,
    calendarAutoBook: isOneOf(obj.calendarAutoBook, CALENDAR_AUTO_BOOK_MODES)
      ? obj.calendarAutoBook
      : DEFAULT_AI_CONTROLS.calendarAutoBook,
  };
}

/** True when phrasing-relevant controls equal the untouched defaults. */
export function hasCustomStyleControls(controls: WorkspaceAiControls): boolean {
  return (
    controls.replyLength !== DEFAULT_AI_CONTROLS.replyLength ||
    controls.replyStyle !== DEFAULT_AI_CONTROLS.replyStyle ||
    controls.emojiLevel !== DEFAULT_AI_CONTROLS.emojiLevel
  );
}

/**
 * Deterministic language & script resolver honoring owner controls:
 * - `fixed`: always reply in `primaryLanguage`.
 * - `auto`: mirror client language when enabled in `allowedLanguages`, else prior allowed language, else `primaryLanguage`.
 * - `derjaScript`: forces Arabizi (`latin`) or Arabic script (`arabic`) when Derja is chosen, or mirrors the client (`auto`).
 */
export function resolveControlledReplyLanguage(input: {
  controls: WorkspaceAiControls;
  detectedLanguage?: BuyerLanguage | null;
  priorLanguage?: BuyerLanguage | null;
  detectedScript?: TextScript | null;
  priorScript?: TextScript | null;
}): { language: BuyerLanguage; script: TextScript } {
  const { controls } = input;
  const allowed = new Set<BuyerLanguage>(controls.allowedLanguages);
  allowed.add(controls.primaryLanguage);

  let language: BuyerLanguage;
  if (controls.languageMode === "fixed") {
    language = controls.primaryLanguage;
  } else if (input.detectedLanguage && allowed.has(input.detectedLanguage)) {
    language = input.detectedLanguage;
  } else if (input.priorLanguage && allowed.has(input.priorLanguage)) {
    language = input.priorLanguage;
  } else {
    language = controls.primaryLanguage;
  }

  let script: TextScript;
  if (language === "derja") {
    if (controls.derjaScript === "latin") script = "latin";
    else if (controls.derjaScript === "arabic") script = "arabic";
    else script = input.detectedScript ?? input.priorScript ?? "latin";
  } else if (language === "ar") {
    script = "arabic";
  } else {
    script = "latin";
  }

  return { language, script };
}

/** Dynamic reply character caps so `long` responses are never wrongly truncated into templates. */
export function maxReplyCharsForLength(
  length: ReplyLength,
  context: "ecommerce" | "negotiation" | "pro",
): number {
  if (context === "negotiation") {
    if (length === "short") return 350;
    if (length === "long") return 900;
    return 500;
  }
  if (context === "pro") {
    if (length === "short") return 500;
    if (length === "long") return 1600;
    return 900;
  }
  if (length === "short") return 450;
  if (length === "long") return 1500;
  return 750;
}

export function buildLengthDirective(length: ReplyLength): string {
  if (length === "short") {
    return "MESSAGE LENGTH — SHORT: Reply in 1 to 2 crisp, punchy sentences (under ~35 words). Get straight to the point like a quick WhatsApp message with zero fluff.";
  }
  if (length === "long") {
    return "MESSAGE LENGTH — LONG: Reply in 4 to 6 warm, thorough sentences. Give rich, helpful context (options, availability, delivery or prep details, and friendly guidance from workspace knowledge) while still reading like a natural human DM — no markdown headings or bullet templates.";
  }
  return "MESSAGE LENGTH — MEDIUM: Reply in 2 to 3 balanced, natural sentences — clear, helpful, and conversational.";
}

export function buildStyleDirective(
  style: ReplyStyle,
  emojiLevel: EmojiLevel,
  language: BuyerLanguage,
): string {
  const registerLine =
    style === "casual"
      ? language === "fr"
        ? "CONVERSATIONAL STYLE — CASUAL & FRIENDLY: Talk like a friendly, approachable person texting naturally. Use informal 'tu' ('salut', 'avec plaisir', 't'inquiète'), relaxed phrasing, never stiff or corporate."
        : language === "en"
          ? "CONVERSATIONAL STYLE — CASUAL & FRIENDLY: Talk like an easygoing, approachable human texting a friend ('hey!', 'no worries', 'happy to help'). Relaxed and upbeat, never corporate."
          : language === "ar"
            ? "CONVERSATIONAL STYLE — CASUAL & FRIENDLY: Talk in warm, friendly, approachable Arabic without stiff corporate phrasing."
            : "CONVERSATIONAL STYLE — CASUAL & FRIENDLY: Talk like a warm, relaxed, street-friendly Tunisian texting naturally ('ahla', 'marhba bik', '3la rasi', 'mrigel', 'ya ghali', 'أهلا بيك', 'على راسي'). Relaxed and genuine, never stiff or robotic."
      : style === "formal"
        ? language === "fr"
          ? "CONVERSATIONAL STYLE — FORMAL & PROFESSIONAL: Maintain a polished, courteous, respectful tone. Always use formal 'vous' ('Bonjour', 'Je vous remercie', 'Avec plaisir'), complete grammar, and zero slang."
          : language === "en"
            ? "CONVERSATIONAL STYLE — FORMAL & PROFESSIONAL: Maintain a polished, courteous, professional register with complete sentences and zero slang."
            : language === "ar"
              ? "CONVERSATIONAL STYLE — FORMAL & PROFESSIONAL: Maintain a refined, polite, formal Arabic register with courteous address and zero slang."
              : "CONVERSATIONAL STYLE — FORMAL & PROFESSIONAL: Use a polite, respectful, refined Tunisian register ('Marhba bik sidi/madame', '3aychek', 'b kol sorour'), avoiding heavy slang while staying warm and professional."
        : "CONVERSATIONAL STYLE — WARM & BALANCED: Sound warm, genuine, helpful, and human — friendly and approachable without being overly slangy or overly stiff.";

  const emojiLine =
    emojiLevel === "none"
      ? "EMOJIS: Do NOT include any emojis."
      : emojiLevel === "expressive"
        ? "EMOJIS: Use 2 to 3 warm, fitting emojis naturally in the reply."
        : "EMOJIS: Use at most 1 tasteful emoji if it feels natural (or none).";

  return `${registerLine}\n${emojiLine}`;
}

/**
 * Deterministic prompt block injected into E-Commerce & Pro prompts.
 * Contains zero timestamps or UUIDs so cassette replay keys remain stable.
 */
export function buildAiControlPromptDirectives(
  controls: WorkspaceAiControls,
  language: BuyerLanguage,
): string {
  return `${buildLengthDirective(controls.replyLength)}\n${buildStyleDirective(
    controls.replyStyle,
    controls.emojiLevel,
    language,
  )}`;
}

const LANG_SHORT_LABELS: Record<BuyerLanguage, string> = {
  derja: "Derja",
  fr: "FR",
  ar: "AR",
  en: "EN",
};

export function summarizeAiControls(controls: WorkspaceAiControls): string {
  const len = controls.replyLength === "short" ? "Short" : controls.replyLength === "long" ? "Long" : "Medium";
  const style = controls.replyStyle === "casual" ? "Casual" : controls.replyStyle === "formal" ? "Formal" : "Balanced";
  const emoji =
    controls.emojiLevel === "none"
      ? "No emojis"
      : controls.emojiLevel === "expressive"
        ? "Expressive emojis"
        : "Light emojis";
  const scriptTag =
    controls.derjaScript === "arabic"
      ? " (Arabic script)"
      : controls.derjaScript === "latin"
        ? " (Arabizi)"
        : "";
  const langLabel =
    controls.languageMode === "fixed"
      ? `Always ${LANG_SHORT_LABELS[controls.primaryLanguage]}${controls.primaryLanguage === "derja" ? scriptTag : ""}`
      : `Auto (${controls.allowedLanguages.map((l) => LANG_SHORT_LABELS[l]).join("/")}${
          controls.allowedLanguages.includes("derja") ? scriptTag : ""
        })`;
  return `${len} · ${style} · ${emoji} · ${langLabel}`;
}

// ---------------------------------------------------------------------------
// Zero-downtime persistence (merchants.ai_controls + ai_cache fallback)
// ---------------------------------------------------------------------------

const CACHE_NAMESPACE = "workspace_ai_controls";

function controlsCacheKey(merchantId: string): string {
  return `${CACHE_NAMESPACE}:${merchantId}`;
}

function isMissingControlsColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("ai_controls") && (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find"));
}

async function readControlsFromCache(supabase: AdminClient, merchantId: string): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase
      .from("ai_cache")
      .select("value")
      .eq("key", controlsCacheKey(merchantId))
      .maybeSingle();
    if (error || !data) return null;
    const val = (data as { value?: unknown }).value;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return val as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeControlsToCache(
  supabase: AdminClient,
  merchantId: string,
  controls: WorkspaceAiControls,
): Promise<void> {
  const { error } = await supabase.from("ai_cache").upsert(
    {
      key: controlsCacheKey(merchantId),
      namespace: CACHE_NAMESPACE,
      value: controls,
    },
    { onConflict: "key" },
  );
  if (error) {
    throw new Error(`ai controls cache save failed: ${error.message}`);
  }
}

/**
 * Loads normalized workspace AI controls safely across migrated DBs, pre-migration DBs
 * (via `ai_cache` fallback), and partial unit-test Supabase stubs.
 */
export async function loadWorkspaceAiControls(
  supabase: AdminClient,
  merchantId: string,
): Promise<WorkspaceAiControls> {
  try {
    const { data, error } = await supabase
      .from("merchants")
      .select("reply_language, ai_controls")
      .eq("id", merchantId)
      .maybeSingle();

    if (!error && data) {
      const row = data as { reply_language?: unknown; ai_controls?: unknown };
      const rawObj =
        row.ai_controls && typeof row.ai_controls === "object" && !Array.isArray(row.ai_controls)
          ? (row.ai_controls as Record<string, unknown>)
          : {};
      if (Object.keys(rawObj).length > 0) {
        return normalizeWorkspaceAiControls(rawObj, row.reply_language);
      }
      const cached = await readControlsFromCache(supabase, merchantId);
      if (cached) {
        return normalizeWorkspaceAiControls(cached, row.reply_language);
      }
      return normalizeWorkspaceAiControls({}, row.reply_language);
    }

    if (error && !isMissingControlsColumnError(error)) {
      const cached = await readControlsFromCache(supabase, merchantId);
      return normalizeWorkspaceAiControls(cached ?? {});
    }

    const [cached, langRes] = await Promise.all([
      readControlsFromCache(supabase, merchantId),
      Promise.resolve(
        supabase.from("merchants").select("reply_language").eq("id", merchantId).maybeSingle(),
      ).catch(() => ({ data: null })),
    ]);
    const fallbackLang = (langRes?.data as { reply_language?: unknown } | null)?.reply_language;
    return normalizeWorkspaceAiControls(cached ?? {}, fallbackLang);
  } catch {
    const cached = await readControlsFromCache(supabase, merchantId);
    return normalizeWorkspaceAiControls(cached ?? {});
  }
}

/**
 * Merges and persists workspace AI controls (0 LLM calls).
 * Keeps `merchants.reply_language` synced with `primaryLanguage`.
 */
export async function saveWorkspaceAiControls(
  supabase: AdminClient,
  merchantId: string,
  patch: WorkspaceAiControlsPatch,
): Promise<WorkspaceAiControls> {
  const current = await loadWorkspaceAiControls(supabase, merchantId);
  const next = normalizeWorkspaceAiControls({
    ...current,
    ...patch,
    allowedLanguages: patch.allowedLanguages ?? current.allowedLanguages,
  });

  const { error } = await supabase
    .from("merchants")
    .update({
      ai_controls: next,
      reply_language: next.primaryLanguage,
    })
    .eq("id", merchantId);

  if (!error) {
    return next;
  }

  if (!isMissingControlsColumnError(error)) {
    throw new Error(error.message);
  }

  await writeControlsToCache(supabase, merchantId, next);
  await Promise.resolve(
    supabase.from("merchants").update({ reply_language: next.primaryLanguage }).eq("id", merchantId),
  ).catch(() => undefined);
  return next;
}
