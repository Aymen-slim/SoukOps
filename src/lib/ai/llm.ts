import type OpenAI from "openai";
import { getServerEnv } from "@/lib/env";
import { getBasetenLlmClient } from "./baseten";
import { getMetaClient } from "./meta";
import type { AiProvider } from "./trace";

export { resolveAiRoute, resolveAiRoutes, type AiTaskTier, type ResolvedModelRoute } from "./router";

/**
 * Legacy OpenAI-compatible client switch (Meta Muse Spark / Baseten Spark Open).
 * Task-routed multi-provider calls go through `src/lib/ai/router.ts` and `spark.ts`.
 */
export function getLlmClient(): { client: OpenAI; model: string; provider: AiProvider } {
  const env = getServerEnv();
  if (env.LLM_PROVIDER === "baseten") {
    return { client: getBasetenLlmClient(), model: env.BASETEN_SPARK_OPEN_MODEL, provider: "baseten" };
  }
  return { client: getMetaClient(), model: env.META_SPARK_MODEL, provider: "meta" };
}
