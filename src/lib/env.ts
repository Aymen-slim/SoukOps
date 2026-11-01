import { z } from "zod";

/**
 * Server-only environment. All values optional at parse time so the app and
 * `npm run smoke` boot without keys and report exactly what is missing.
 * Never import this file from a Client Component.
 */
const schema = z.object({
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
  LLM_PROVIDER: z.enum(["meta", "baseten"]).default("meta"),
  ASR_PROVIDER: z.enum(["transcribe", "spark-open"]).default("transcribe"),
  MATCHER: z.enum(["vector", "all"]).default("vector"),
  AI_MODE: z.enum(["live", "record", "replay"]).default("live"),
  CASSETTE_DIR: z.string().default(".ai-cassettes"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  APP_BASE_URL: z.string().default("http://localhost:3000"),
  SIMULATOR_PUBLIC: z.string().default("true"),
  FD_API_BASE_URL: z.string().optional(),
  FD_API_TOKEN: z.string().optional(),
  // WhatsApp Cloud API (fallback when the merchant has no DB-saved config;
  // Settings > Link WhatsApp saves to merchants columns from migration 0002).
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_WABA_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  // Meta Embedded Signup (one-click Facebook link in Settings): app id is
  // public, app secret is server-only, config id comes from the app's
  // Facebook Login for Business configuration.
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  WHATSAPP_EMBEDDED_CONFIG_ID: z.string().optional(),
  // Messenger / Instagram (fallback when no DB-saved page config; Settings
  // Link buttons save to merchants columns from migration 0003).
  FACEBOOK_VERIFY_TOKEN: z.string().optional(),
  MESSENGER_PAGE_ID: z.string().optional(),
  MESSENGER_PAGE_ACCESS_TOKEN: z.string().optional(),
  INSTAGRAM_BUSINESS_ID: z.string().optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
  COURIER_CLONE_USER: z.string().default("agent"),
  COURIER_CLONE_PASSWORD: z.string().default("wassalha"),
});

export type ServerEnv = z.infer<typeof schema> & {
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

/** Boolean presence only — safe to render in the UI, never exposes secrets. */
export function providerStatus() {
  const env = getServerEnv();
  return {
    metaModelApi: Boolean(env.MODEL_API_KEY),
    baseten: Boolean(env.BASETEN_API_KEY),
    basetenPe: Boolean(env.peEmbedUrl),
    supabase: Boolean(env.supabaseUrl && env.supabasePublishableKey),
    supabaseAdmin: Boolean(env.supabaseUrl && env.supabaseSecretKey),
    whatsappEnv: Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN),
    llmProvider: env.LLM_PROVIDER,
    asrProvider: env.ASR_PROVIDER,
    matcher: env.MATCHER,
    aiMode: env.AI_MODE,
    models: {
      spark: env.META_SPARK_MODEL,
      sam: env.SAM_MODEL,
      asr: env.ASR_MODEL,
      image: env.IMAGE_MODEL,
      sparkOpen: env.BASETEN_SPARK_OPEN_MODEL,
    },
  };
}
