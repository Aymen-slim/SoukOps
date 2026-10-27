import OpenAI from "openai";
import { getServerEnv, requireEnv } from "@/lib/env";

/** Meta Model API client (OpenAI-compatible). Server-only. */
export function getMetaClient(): OpenAI {
  requireEnv("MODEL_API_KEY");
  return new OpenAI({
    apiKey: getServerEnv().MODEL_API_KEY,
    baseURL: "https://api.meta.ai/v1",
  });
}

export function metaConfigured(): boolean {
  return Boolean(getServerEnv().MODEL_API_KEY);
}
