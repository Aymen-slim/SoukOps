import { z } from "zod";

/**
 * Server-only environment. All values optional at parse time so the app and
 * `npm run smoke` boot without keys and report exactly what is missing.
 * Never import this file from a Client Component.
 */
const schema = z.object({
  // --- Multi-provider AI API keys ---
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  VOYAGE_API_KEY: z.string().optional(),
  FAL_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),

  // --- Meta & Baseten legacy/fallback keys ---
  MODEL_API_KEY: z.string().optional(),
  META_SPARK_MODEL: z.string().default("muse-spark-1.3"),
  SAM_MODEL: z.string().default("sam-3.1"),
  ASR_MODEL: z.string().default("muse-voice-transcribe-1.0"),
  IMAGE_MODEL: z.string().default("muse-image-1.0"),
  BASETEN_API_KEY: z.string().optional(),
  BASETEN_PE_URL: z.string().optional(),
  PE_EMBED_URL: z.string().optional(),
  PE_EMBED_API_KEY: z.string().optional(),
  BASETEN_SPARK_OPEN_MODEL: z.string().default("meta-models/muse-spark-open-1026"),

  // --- Model ID overrides per provider ---
  GEMINI_FAST_MODEL: z.string().default("gemini-3.8-flash"),
  GEMINI_REASONING_MODEL: z.string().default("gemini-4-argon"),
  GEMINI_EMBED_MODEL: z.string().default("gemini-embedding-2"),
  GEMINI_IMAGE_MODEL: z.string().default("gemini-nano-banana-2.1"),
  OPENAI_FAST_MODEL: z.string().default("gpt-6.1-sol"),
  OPENAI_REASONING_MODEL: z.string().default("gpt-6-astra"),
  OPENAI_ASR_MODEL: z.string().default("gpt-transcribe"),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-2.6"),
  ANTHROPIC_STYLE_MODEL: z.string().default("claude-sonnet-5-5"),
  ANTHROPIC_REASONING_MODEL: z.string().default("claude-opus-5-5"),
  ELEVENLABS_ASR_MODEL: z.string().default("scribe_v2"),
  VOYAGE_EMBED_MODEL: z.string().default("voyage-multimodal-3.5"),

  // --- Task-routed provider switches ("auto" selects best configured key) ---
  FAST_LLM_PROVIDER: z.enum(["auto", "gemini", "openai", "anthropic", "meta", "baseten"]).default("auto"),
  REASONING_LLM_PROVIDER: z.enum(["auto", "gemini", "openai", "anthropic", "meta", "baseten"]).default("auto"),
  STYLE_LLM_PROVIDER: z.enum(["auto", "gemini", "openai", "anthropic", "meta", "baseten"]).default("auto"),
  LLM_PROVIDER: z.enum(["auto", "meta", "baseten", "gemini", "openai", "anthropic"]).default("auto"),
  ASR_PROVIDER: z
    .enum(["auto", "elevenlabs", "openai", "gemini", "transcribe", "spark-open"])
    .default("auto"),
  EMBED_PROVIDER: z.enum(["auto", "gemini", "voyage", "pe"]).default("auto"),
  IMAGE_PROVIDER: z.enum(["auto", "openai", "gemini", "meta"]).default("auto"),
  VISION_SEGMENT_MODE: z.enum(["always", "auto", "never"]).default("auto"),

  // --- Runtime / Matching / Cassette ---
  MATCHER: z.enum(["vector", "all"]).default("vector"),
  AI_MODE: z.enum(["live", "record", "replay"]).default("live"),
  CASSETTE_DIR: z.string().default(".ai-cassettes"),

  // --- Supabase ---
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // --- App ---
  APP_BASE_URL: z.string().default("http://localhost:3000"),
  SIMULATOR_PUBLIC: z.string().default("true"),

  // --- Channels (Meta Cloud API) ---
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_WABA_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  WHATSAPP_EMBEDDED_CONFIG_ID: z.string().optional(),
  FACEBOOK_VERIFY_TOKEN: z.string().optional(),
  MESSENGER_PAGE_ID: z.string().optional(),
  MESSENGER_PAGE_ACCESS_TOKEN: z.string().optional(),
  INSTAGRAM_BUSINESS_ID: z.string().optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),

  // --- Google Places (New) & Google Calendar OAuth ---
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().optional(),

  // --- Courier ---
  FD_API_BASE_URL: z.string().optional(),
  FD_API_TOKEN: z.string().optional(),
  COURIER_CLONE_USER: z.string().default("agent"),
  COURIER_CLONE_PASSWORD: z.string().default("wassalha"),
});

export type ServerEnv = z.infer<typeof schema> & {
  geminiApiKey?: string;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  supabaseSecretKey?: string;
  peEmbedUrl?: string;
  peEmbedApiKey?: string;
};

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.parse(process.env);
  cached = {
    ...parsed,
    geminiApiKey: parsed.GEMINI_API_KEY ?? parsed.GOOGLE_API_KEY,
    supabaseUrl: parsed.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey:
      parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseSecretKey: parsed.SUPABASE_SECRET_KEY ?? parsed.SUPABASE_SERVICE_ROLE_KEY,
    peEmbedUrl: parsed.PE_EMBED_URL ?? parsed.BASETEN_PE_URL,
    peEmbedApiKey: parsed.PE_EMBED_API_KEY ?? parsed.BASETEN_API_KEY,
  };
  return cached;
}

/** Test/script helper: drop the cache after mutating process.env. */
export function resetEnvCache(): void {
  cached = null;
}

export function requireEnv<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = getServerEnv()[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing required env var: ${String(key)} (set it in .env.local)`);
  }
  return value as NonNullable<ServerEnv[K]>;
}

/** Resolves effective ASR provider from explicit setting or configured API keys (Gemini primary). */
export function resolveAsrProviderName(env = getServerEnv()): "elevenlabs" | "openai" | "gemini" | "transcribe" | "spark-open" {
  if (env.ASR_PROVIDER !== "auto") return env.ASR_PROVIDER;
  if (env.geminiApiKey) return "gemini";
  if (env.ELEVENLABS_API_KEY) return "elevenlabs";
  if (env.OPENAI_API_KEY) return "openai";
  if (env.MODEL_API_KEY) return "transcribe";
  if (env.BASETEN_API_KEY) return "spark-open";
  return "gemini";
}

/** Resolves effective Embedding provider from explicit setting or configured API keys (Gemini primary). */
export function resolveEmbedProviderName(env = getServerEnv()): "gemini" | "voyage" | "pe" {
  if (env.EMBED_PROVIDER !== "auto") return env.EMBED_PROVIDER;
  if (env.geminiApiKey) return "gemini";
  if (env.VOYAGE_API_KEY) return "voyage";
  return "pe";
}

/** Resolves effective Image Generation provider from explicit setting or configured API keys (Gemini primary). */
export function resolveImageProviderName(env = getServerEnv()): "openai" | "gemini" | "meta" {
  if (env.IMAGE_PROVIDER !== "auto") return env.IMAGE_PROVIDER;
  if (env.geminiApiKey) return "gemini";
  if (env.OPENAI_API_KEY) return "openai";
  return "meta";
}

/** Boolean presence only — safe to render in the UI, never exposes secrets. */
export function providerStatus() {
  const env = getServerEnv();
  const fastLlm =
    env.FAST_LLM_PROVIDER !== "auto"
      ? env.FAST_LLM_PROVIDER
      : env.LLM_PROVIDER !== "auto"
        ? env.LLM_PROVIDER
        : env.geminiApiKey
          ? "gemini"
          : env.OPENAI_API_KEY
            ? "openai"
            : env.ANTHROPIC_API_KEY
              ? "anthropic"
              : env.MODEL_API_KEY
                ? "meta"
                : env.BASETEN_API_KEY
                  ? "baseten"
                  : "gemini";

  const reasoningLlm =
    env.REASONING_LLM_PROVIDER !== "auto"
      ? env.REASONING_LLM_PROVIDER
      : env.geminiApiKey
        ? "gemini"
        : env.OPENAI_API_KEY
          ? "openai"
          : env.ANTHROPIC_API_KEY
            ? "anthropic"
            : fastLlm;

  const styleLlm =
    env.STYLE_LLM_PROVIDER !== "auto"
      ? env.STYLE_LLM_PROVIDER
      : env.geminiApiKey
        ? "gemini"
        : env.ANTHROPIC_API_KEY
          ? "anthropic"
          : env.OPENAI_API_KEY
            ? "openai"
            : fastLlm;

  return {
    gemini: Boolean(env.geminiApiKey),
    openai: Boolean(env.OPENAI_API_KEY),
    anthropic: Boolean(env.ANTHROPIC_API_KEY),
    elevenlabs: Boolean(env.ELEVENLABS_API_KEY),
    voyage: Boolean(env.VOYAGE_API_KEY),
    fal: Boolean(env.FAL_KEY),
    resend: Boolean(env.RESEND_API_KEY),
    metaModelApi: Boolean(env.MODEL_API_KEY),
    baseten: Boolean(env.BASETEN_API_KEY),
    basetenPe: Boolean(env.peEmbedUrl),
    supabase: Boolean(env.supabaseUrl && env.supabasePublishableKey),
    supabaseAdmin: Boolean(env.supabaseUrl && env.supabaseSecretKey),
    whatsappEnv: Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN),
    googlePlaces: Boolean(env.GOOGLE_PLACES_API_KEY ?? env.GOOGLE_MAPS_API_KEY),
    googleCalendarOAuth: Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET),
    llmProvider: fastLlm,
    fastLlmProvider: fastLlm,
    reasoningLlmProvider: reasoningLlm,
    styleLlmProvider: styleLlm,
    asrProvider: resolveAsrProviderName(env),
    embedProvider: resolveEmbedProviderName(env),
    imageProvider: resolveImageProviderName(env),
    visionSegmentMode: env.VISION_SEGMENT_MODE,
    matcher: env.MATCHER,
    aiMode: env.AI_MODE,
    models: {
      geminiFast: env.GEMINI_FAST_MODEL,
      geminiReasoning: env.GEMINI_REASONING_MODEL,
      geminiEmbed: env.GEMINI_EMBED_MODEL,
      geminiImage: env.GEMINI_IMAGE_MODEL,
      openaiFast: env.OPENAI_FAST_MODEL,
      openaiReasoning: env.OPENAI_REASONING_MODEL,
      openaiAsr: env.OPENAI_ASR_MODEL,
      openaiImage: env.OPENAI_IMAGE_MODEL,
      anthropicStyle: env.ANTHROPIC_STYLE_MODEL,
      anthropicReasoning: env.ANTHROPIC_REASONING_MODEL,
      elevenlabsAsr: env.ELEVENLABS_ASR_MODEL,
      voyageEmbed: env.VOYAGE_EMBED_MODEL,
      spark: env.META_SPARK_MODEL,
      sam: env.SAM_MODEL,
      asr: env.ASR_MODEL,
      image: env.IMAGE_MODEL,
      sparkOpen: env.BASETEN_SPARK_OPEN_MODEL,
    },
  };
}
