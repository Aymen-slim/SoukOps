import { createHash } from "node:crypto";
import type { z } from "zod";
import { withCassette } from "./cassette";
import { getLlmClient } from "./llm";
import { traced } from "./trace";

export interface SparkJsonRequest<T> {
  /** zod schema validating the model output (Baseten does not enforce json_schema). */
  schema: z.ZodType<T>;
  /** JSON Schema sent as response_format to providers that support it. */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  system?: string;
  user: string;
  /** Optional image data URLs (user message only). */
  images?: string[];
  conversationId?: string;
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

/**
 * Spark call returning zod-validated JSON. Validates every output and retries
 * once on a validation/parse failure (required for Baseten Spark Open).
 * Note: never send `stop` or `logit_bias` to Muse Spark (returns 400).
 */
export async function sparkJson<T>(req: SparkJsonRequest<T>): Promise<T> {
  const { client, model, provider } = getLlmClient();
  const cassetteInput = {
    model,
    schemaName: req.schemaName,
    system: req.system ?? null,
    user: req.user,
    imageCount: req.images?.length ?? 0,
    // Content hash (not byte length, which collides) keeps replay keys stable.
    imageHashes: (req.images ?? []).map((u) =>
      createHash("sha256").update(u.slice(0, 512_000)).digest("hex").slice(0, 16),
    ),
  };

  return withCassette(`spark.json.${req.schemaName}`, cassetteInput, () =>
    traced(
      { kind: "spark.json", model, provider, conversationId: req.conversationId },
      async () => {
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          const completion = await client.chat.completions.create({
            model,
            reasoning_effort: "low",
            messages: [
              ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
              { role: "user" as const, content: buildUserContent(req as SparkJsonRequest<unknown>) },
            ],
            response_format: {
              type: "json_schema",
              json_schema: { name: req.schemaName, strict: true, schema: req.jsonSchema },
            },
          });
          const text = completion.choices[0]?.message?.content ?? "";
          try {
            return req.schema.parse(JSON.parse(text));
          } catch (err) {
            lastError = err;
          }
        }
        throw new Error(
          `Spark JSON validation failed after retry: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
        );
      },
    ),
  );
}

/** Plain-text Spark completion (Derja phrasing). Callers must run the price firewall on the result. */
export async function sparkText(req: {
  system?: string;
  user: string;
  conversationId?: string;
  /** Aborts the provider request (e.g. when a phrasing deadline passes). */
  signal?: AbortSignal;
}): Promise<string> {
  const { client, model, provider } = getLlmClient();
  return withCassette(
    "spark.text",
    { model, system: req.system ?? null, user: req.user },
    () =>
      traced({ kind: "spark.text", model, provider, conversationId: req.conversationId }, async () => {
        const completion = await client.chat.completions.create(
          {
            model,
            reasoning_effort: "low",
            messages: [
              ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
              { role: "user" as const, content: req.user },
            ],
          },
          req.signal ? { signal: req.signal } : undefined,
        );
        return completion.choices[0]?.message?.content ?? "";
      }),
  );
}
