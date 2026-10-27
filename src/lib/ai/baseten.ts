import OpenAI from "openai";
import { getServerEnv, requireEnv } from "@/lib/env";

/** Baseten Model APIs client for Muse Spark Open (OpenAI-compatible). Server-only. */
export function getBasetenLlmClient(): OpenAI {
  requireEnv("BASETEN_API_KEY");
  return new OpenAI({
    apiKey: getServerEnv().BASETEN_API_KEY,
    baseURL: "https://inference.baseten.co/v1",
  });
}

export function basetenConfigured(): boolean {
  return Boolean(getServerEnv().BASETEN_API_KEY);
}

export function peConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.BASETEN_API_KEY && env.BASETEN_PE_URL);
}

/** Raw predict call to the Perception Encoder Truss. Server-only (no CORS). */
export async function pePredict(body: Record<string, unknown>): Promise<unknown> {
  const env = getServerEnv();
  requireEnv("BASETEN_API_KEY");
  requireEnv("BASETEN_PE_URL");
  const res = await fetch(env.BASETEN_PE_URL as string, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.BASETEN_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Baseten PE predict failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
