import OpenAI from "openai";
import { getServerEnv, requireEnv } from "@/lib/env";

let cachedLlm: OpenAI | null = null;

/** Baseten Model APIs client for Muse Spark Open (OpenAI-compatible). Server-only. Reused across calls. */
export function getBasetenLlmClient(): OpenAI {
  if (cachedLlm) return cachedLlm;
  requireEnv("BASETEN_API_KEY");
  cachedLlm = new OpenAI({
    apiKey: getServerEnv().BASETEN_API_KEY,
    baseURL: "https://inference.baseten.co/v1",
    timeout: 120_000,
  });
  return cachedLlm;
}

export function basetenConfigured(): boolean {
  return Boolean(getServerEnv().BASETEN_API_KEY);
}

export function peConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.peEmbedUrl);
}

/**
 * Raw predict call to the Perception Encoder endpoint (Baseten Truss or Modal
 * web endpoint — same {images|texts} -> {embeddings} contract). Server-only.
 * PE_EMBED_URL/PE_EMBED_API_KEY take precedence; BASETEN_PE_URL/BASETEN_API_KEY
 * remain as fallbacks. The Modal endpoint also checks `_secret` in the body.
 */
export async function pePredict(body: Record<string, unknown>): Promise<unknown> {
  const env = getServerEnv();
  if (!env.peEmbedUrl) {
    throw new Error("Missing required env var: PE_EMBED_URL (or BASETEN_PE_URL)");
  }
  const res = await fetch(env.peEmbedUrl, {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: {
      ...(env.peEmbedApiKey ? { Authorization: `Bearer ${env.peEmbedApiKey}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      env.peEmbedApiKey ? { ...body, _secret: env.peEmbedApiKey } : body,
    ),
  });
  if (!res.ok) {
    throw new Error(`PE predict failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
