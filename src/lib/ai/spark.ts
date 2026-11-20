import { createHash } from "node:crypto";
import type { z } from "zod";
import type { BuyerLanguage } from "@/lib/domain/language";
import { getServerEnv } from "@/lib/env";
import { getBasetenLlmClient } from "./baseten";
import { withCassette } from "./cassette";
import { getMetaClient } from "./meta";
import { anthropicGenerateJson, anthropicGenerateText } from "./providers/anthropic";
import { geminiGenerateJson, geminiGenerateText } from "./providers/gemini";
import { openaiGenerateJson, openaiGenerateText } from "./providers/openai";
import { resolveAiRoutes, type AiTaskTier, type ResolvedModelRoute } from "./router";
import { traced } from "./trace";

export interface SparkJsonRequest<T> {
  /** zod schema validating the model output. */
  schema: z.ZodType<T>;
  /** JSON Schema sent as structured output specification. */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  system?: string;
  user: string;
  /** Optional image data URLs (user message only). */
  images?: string[];
  conversationId?: string;
  /** Task tier selects model/reasoning effort (default: fast_multimodal). */
  tier?: AiTaskTier;
  /** Hint for dialect-aware style routing. */
  languageHint?: BuyerLanguage;
  /** Optional abort signal for deadline cancellation. */
  signal?: AbortSignal;
}

type ChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

function buildUserContent(req: SparkJsonRequest<unknown>): ChatContent {
  if (!req.images?.length) return req.user;
  return [
    { type: "text", text: req.user },
    ...req.images.map((url) => ({
      type: "image_url" as const,
      image_url: { url },
    })),
  ];
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

async function callJsonRoute(
  route: ResolvedModelRoute,
  req: SparkJsonRequest<unknown>,
): Promise<string> {
  if (route.provider === "gemini") {
    return geminiGenerateJson({
      model: route.model,
      jsonSchema: req.jsonSchema,
      system: req.system,
      user: req.user,
      images: req.images,
      reasoningEffort: route.reasoningEffort,
      signal: req.signal,
    });
  }
  if (route.provider === "openai") {
    return openaiGenerateJson({
      model: route.model,
      schemaName: req.schemaName,
      jsonSchema: req.jsonSchema,
      system: req.system,
      user: req.user,
      images: req.images,
      reasoningEffort: route.reasoningEffort,
    });
  }
  if (route.provider === "anthropic") {
    return anthropicGenerateJson({
      model: route.model,
      jsonSchema: req.jsonSchema,
      system: req.system,
      user: req.user,
      images: req.images,
      reasoningEffort: route.reasoningEffort,
    });
  }
  // Meta / Baseten OpenAI-compatible path (never send `stop` or `logit_bias`).
  const client = route.provider === "baseten" ? getBasetenLlmClient() : getMetaClient();
  const completion = await client.chat.completions.create({
    model: route.model,
    reasoning_effort: route.reasoningEffort,
    messages: [
      ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
      { role: "user" as const, content: buildUserContent(req) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: req.schemaName, strict: true, schema: req.jsonSchema },
    },
  });
  return completion.choices[0]?.message?.content ?? "";
}

async function callTextRoute(
  route: ResolvedModelRoute,
  req: { system?: string; user: string; signal?: AbortSignal },
): Promise<string> {
  if (route.provider === "gemini") {
    return geminiGenerateText({
      model: route.model,
      system: req.system,
      user: req.user,
      reasoningEffort: route.reasoningEffort,
      signal: req.signal,
    });
  }
  if (route.provider === "openai") {
    return openaiGenerateText({
      model: route.model,
      system: req.system,
      user: req.user,
      reasoningEffort: route.reasoningEffort,
      signal: req.signal,
    });
  }
  if (route.provider === "anthropic") {
    return anthropicGenerateText({
      model: route.model,
      system: req.system,
      user: req.user,
      reasoningEffort: route.reasoningEffort,
      signal: req.signal,
    });
  }
  const client = route.provider === "baseten" ? getBasetenLlmClient() : getMetaClient();
  const completion = await client.chat.completions.create(
    {
      model: route.model,
      reasoning_effort: route.reasoningEffort,
      messages: [
        ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
        { role: "user" as const, content: req.user },
      ],
    },
    req.signal ? { signal: req.signal } : undefined,
  );
  return completion.choices[0]?.message?.content ?? "";
}

/**
 * Structured JSON call routed by task tier, Zod-validated with 1 retry and
 * multi-provider transport fallback. Preserves legacy Meta cassette keys when
 * routed to meta/baseten on the default fast tier.
 */
export async function sparkJson<T>(req: SparkJsonRequest<T>): Promise<T> {
  const tier = req.tier ?? "fast_multimodal";
  const routes = resolveAiRoutes(tier, { languageHint: req.languageHint });
  const primary = routes[0]!;
  const isLegacyKey =
    (primary.provider === "meta" || primary.provider === "baseten") && tier === "fast_multimodal";

  const imageHashes = (req.images ?? []).map((u) =>
    createHash("sha256").update(u.slice(0, 512_000)).digest("hex").slice(0, 16),
  );
  const cassetteInput = isLegacyKey
    ? {
        model: primary.model,
        schemaName: req.schemaName,
        system: req.system ?? null,
        user: req.user,
        imageCount: req.images?.length ?? 0,
        imageHashes,
      }
    : {
        provider: primary.provider,
        model: primary.model,
        tier,
        schemaName: req.schemaName,
        system: req.system ?? null,
        user: req.user,
        imageCount: req.images?.length ?? 0,
        imageHashes,
      };

  const mode = getServerEnv().AI_MODE;
  return withCassette(`spark.json.${req.schemaName}`, cassetteInput, async () => {
    const candidates = mode === "replay" ? [primary] : routes;
    let lastError: unknown = null;
    for (const route of candidates) {
      try {
        return await traced(
          { kind: "spark.json", model: route.model, provider: route.provider, conversationId: req.conversationId },
          async () => {
            let validationErr: unknown = null;
            for (let attempt = 0; attempt < 2; attempt++) {
              const rawText = await callJsonRoute(route, req as SparkJsonRequest<unknown>);
              try {
                return req.schema.parse(JSON.parse(stripJsonFences(rawText)));
              } catch (err) {
                validationErr = err;
              }
            }
            throw new Error(
              `Spark JSON validation failed after retry: ${
                validationErr instanceof Error ? validationErr.message : String(validationErr)
              }`,
            );
          },
        );
      } catch (err) {
        lastError = err;
        // Do not mask validation failures with another provider unless it's a transport error,
        // or try fallback route when primary provider failed at the API layer.
        if (err instanceof Error && err.message.startsWith("Spark JSON validation failed") && candidates.length === 1) {
          throw err;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  });
}

/** Task-routed plain-text completion. Callers must enforce domain/price firewalls. */
export async function sparkText(req: {
  system?: string;
  user: string;
  conversationId?: string;
  signal?: AbortSignal;
  tier?: AiTaskTier;
  languageHint?: BuyerLanguage;
}): Promise<string> {
  const tier = req.tier ?? "fast_multimodal";
  const routes = resolveAiRoutes(tier, { languageHint: req.languageHint });
  const primary = routes[0]!;
  const isLegacyKey =
    (primary.provider === "meta" || primary.provider === "baseten") && tier === "fast_multimodal";

  const cassetteInput = isLegacyKey
    ? { model: primary.model, system: req.system ?? null, user: req.user }
    : { provider: primary.provider, model: primary.model, tier, system: req.system ?? null, user: req.user };

  const mode = getServerEnv().AI_MODE;
  return withCassette("spark.text", cassetteInput, async () => {
    const candidates = mode === "replay" ? [primary] : routes;
    let lastError: unknown = null;
    for (const route of candidates) {
      if (req.signal?.aborted) {
        throw new Error("aborted");
      }
      try {
        return await traced(
          { kind: "spark.text", model: route.model, provider: route.provider, conversationId: req.conversationId },
          () => callTextRoute(route, req),
        );
      } catch (err) {
        lastError = err;
        if (req.signal?.aborted) throw err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  });
}

export const aiJson = sparkJson;
export const aiText = sparkText;
