import OpenAI from "openai";
import { getServerEnv, requireEnv } from "@/lib/env";

let cached: OpenAI | null = null;

/** Meta Model API client (OpenAI-compatible). Server-only. Reused across calls so connections stay warm. */
export function getMetaClient(): OpenAI {
  if (cached) return cached;
  requireEnv("MODEL_API_KEY");
  cached = new OpenAI({
    apiKey: getServerEnv().MODEL_API_KEY,
    baseURL: "https://api.meta.ai/v1",
    timeout: 120_000,
  });
  return cached;
}

export function metaConfigured(): boolean {
  return Boolean(getServerEnv().MODEL_API_KEY);
}
