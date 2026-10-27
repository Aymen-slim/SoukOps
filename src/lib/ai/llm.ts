import type OpenAI from "openai";
import { getServerEnv } from "@/lib/env";
import { getBasetenLlmClient } from "./baseten";
import { getMetaClient } from "./meta";
import type { AiProvider } from "./trace";

/**
 * Provider switch for Spark calls. LLM_PROVIDER=meta uses Muse Spark on the
 * Meta Model API; =baseten uses Muse Spark Open on Baseten as fallback.
 */
export function getLlmClient(): { client: OpenAI; model: string; provider: AiProvider } {
  const env = getServerEnv();
  if (env.LLM_PROVIDER === "baseten") {
    return { client: getBasetenLlmClient(), model: env.BASETEN_SPARK_OPEN_MODEL, provider: "baseten" };
  }
  return { client: getMetaClient(), model: env.META_SPARK_MODEL, provider: "meta" };
}
