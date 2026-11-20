import { createHash } from "node:crypto";
import type { Content } from "@google/genai";
import { z } from "zod";
import { getServerEnv, requireEnv, resolveEmbedProviderName } from "@/lib/env";
import { peConfigured, pePredict } from "./baseten";
import { withCassette } from "./cassette";
import { geminiConfigured, geminiEmbedContents } from "./providers/gemini";
import { traced } from "./trace";

const peResponseSchema = z.object({
  embeddings: z.array(z.array(z.number())),
});

const voyageResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()) })),
});

export const PE_DIMENSIONS = 1024;

function assertNormalizedBatch(vectors: number[][], label: string): number[][] {
  for (const v of vectors) {
    if (v.length !== PE_DIMENSIONS) {
      throw new Error(`Embedding ${label} vector has ${v.length} dims, expected ${PE_DIMENSIONS}`);
    }
  }
  return vectors;
}

function contentHash(base64: string): string {
  return createHash("sha256").update(base64.slice(0, 512_000)).digest("hex").slice(0, 16);
}

function sniffImageMime(base64: string): string {
  if (base64.startsWith("iVBORw0")) return "image/png";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  return "image/jpeg";
}

function stripDataUrlPrefix(input: string): { mimeType: string; data: string } {
  const match = input.match(/^data:([^;]+);base64,(.+)$/i);
  if (match) return { mimeType: match[1], data: match[2] };
  return { mimeType: sniffImageMime(input), data: input };
}

export function embedConfigured(): boolean {
  const env = getServerEnv();
  return geminiConfigured() || Boolean(env.VOYAGE_API_KEY) || peConfigured();
}

async function voyageMultimodalEmbed(
  inputs: Array<Array<{ type: "text"; text: string } | { type: "image_base64"; image_base64: string }>>,
  inputType?: "query" | "document",
): Promise<number[][]> {
  const env = getServerEnv();
  requireEnv("VOYAGE_API_KEY");
  const res = await fetch("https://api.voyageai.com/v1/multimodalembeddings", {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: {
      Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.VOYAGE_EMBED_MODEL,
      inputs: inputs.map((content) => ({ content })),
      output_dimension: PE_DIMENSIONS,
      ...(inputType ? { input_type: inputType } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Voyage multimodal embed failed: ${res.status} ${await res.text()}`);
  const parsed = voyageResponseSchema.parse(await res.json());
  return assertNormalizedBatch(
    parsed.data.map((d) => d.embedding),
    "voyage",
  );
}

/**
 * Image embeddings (1024-dim normalized). Uses `gemini-embedding-2` (or
 * `voyage-multimodal-3.5`) when configured, falling back to `PE-Core-L14-336`.
 */
export async function embedImages(base64Images: string[], conversationId?: string): Promise<number[][]> {
  if (base64Images.length === 0) return [];
  const env = getServerEnv();
  const provider = resolveEmbedProviderName(env);

  if (provider === "pe") {
    return withCassette("pe.embedImages", { count: base64Images.length, hashes: base64Images.map(contentHash) }, () =>
      traced({ kind: "pe.embedImages", model: "PE-Core-L14-336", provider: "baseten", conversationId }, async () => {
        const raw = await pePredict({ images: base64Images });
        const parsed = peResponseSchema.parse(raw);
        return assertNormalizedBatch(parsed.embeddings, "image");
      }),
    );
  }

  if (provider === "voyage") {
    const model = env.VOYAGE_EMBED_MODEL;
    return withCassette(
      "embed.images",
      { provider, model, count: base64Images.length, hashes: base64Images.map(contentHash) },
      () =>
        traced({ kind: "embed.images", model, provider: "voyage", conversationId }, () =>
          voyageMultimodalEmbed(
            base64Images.map((raw) => {
              const { mimeType, data } = stripDataUrlPrefix(raw);
              return [{ type: "image_base64", image_base64: `data:${mimeType};base64,${data}` }];
            }),
          ),
        ),
    );
  }

  const model = env.GEMINI_EMBED_MODEL;
  return withCassette(
    "embed.images",
    { provider: "gemini", model, count: base64Images.length, hashes: base64Images.map(contentHash) },
    () =>
      traced({ kind: "embed.images", model, provider: "gemini", conversationId }, async () => {
        const contents: Content[] = base64Images.map((raw) => {
          const { mimeType, data } = stripDataUrlPrefix(raw);
          return { parts: [{ inlineData: { mimeType, data } }] };
        });
        const vectors = await geminiEmbedContents(contents, model, PE_DIMENSIONS);
        return assertNormalizedBatch(vectors, "image");
      }),
  );
}

/**
 * Text embeddings (same 1024-dim space as `embedImages`).
 * `gemini-embedding-2` and `voyage-multimodal-3.5` handle full Arabic/French/English
 * descriptions without PE's 32-token cap.
 */
export async function embedTexts(texts: string[], conversationId?: string): Promise<number[][]> {
  if (texts.length === 0) return [];
  const env = getServerEnv();
  const provider = resolveEmbedProviderName(env);

  if (provider === "pe") {
    return withCassette("pe.embedTexts", { texts }, () =>
      traced({ kind: "pe.embedTexts", model: "PE-Core-L14-336", provider: "baseten", conversationId }, async () => {
        const raw = await pePredict({ texts });
        const parsed = peResponseSchema.parse(raw);
        return assertNormalizedBatch(parsed.embeddings, "text");
      }),
    );
  }

  if (provider === "voyage") {
    const model = env.VOYAGE_EMBED_MODEL;
    return withCassette("embed.texts", { provider, model, texts }, () =>
      traced({ kind: "embed.texts", model, provider: "voyage", conversationId }, () =>
        voyageMultimodalEmbed(
          texts.map((text) => [{ type: "text", text }]),
          "query",
        ),
      ),
    );
  }

  const model = env.GEMINI_EMBED_MODEL;
  return withCassette("embed.texts", { provider: "gemini", model, texts }, () =>
    traced({ kind: "embed.texts", model, provider: "gemini", conversationId }, async () => {
      const contents: Content[] = texts.map((text) => ({ parts: [{ text }] }));
      const vectors = await geminiEmbedContents(contents, model, PE_DIMENSIONS);
      return assertNormalizedBatch(vectors, "text");
    }),
  );
}

/**
 * Mixed text + optional image embedding in the shared 1024-dim space (used for
 * Creator/Pro services, profiles, and Opportunity matching).
 */
export async function embedMixed(
  items: Array<{ text?: string; imageBase64?: string }>,
  conversationId?: string,
): Promise<number[][]> {
  if (items.length === 0) return [];
  const env = getServerEnv();
  const provider = resolveEmbedProviderName(env);

  if (provider === "pe") {
    const texts = items.map((item) => (item.text ?? "").slice(0, 140) || "service");
    return embedTexts(texts, conversationId);
  }

  if (provider === "voyage") {
    const model = env.VOYAGE_EMBED_MODEL;
    const keyItems = items.map((item) => ({
      text: item.text ?? null,
      imageHash: item.imageBase64 ? contentHash(item.imageBase64) : null,
    }));
    return withCassette("embed.mixed", { provider, model, items: keyItems }, () =>
      traced({ kind: "embed.mixed", model, provider: "voyage", conversationId }, () =>
        voyageMultimodalEmbed(
          items.map((item) => {
            const parts: Array<{ type: "text"; text: string } | { type: "image_base64"; image_base64: string }> = [];
            if (item.text) parts.push({ type: "text", text: item.text });
            if (item.imageBase64) {
              const { mimeType, data } = stripDataUrlPrefix(item.imageBase64);
              parts.push({ type: "image_base64", image_base64: `data:${mimeType};base64,${data}` });
            }
            if (parts.length === 0) parts.push({ type: "text", text: "item" });
            return parts;
          }),
        ),
      ),
    );
  }

  const model = env.GEMINI_EMBED_MODEL;
  const keyItems = items.map((item) => ({
    text: item.text ?? null,
    imageHash: item.imageBase64 ? contentHash(item.imageBase64) : null,
  }));
  return withCassette("embed.mixed", { provider: "gemini", model, items: keyItems }, () =>
    traced({ kind: "embed.mixed", model, provider: "gemini", conversationId }, async () => {
      const contents: Content[] = items.map((item) => {
        const parts: NonNullable<Content["parts"]> = [];
        if (item.text) parts.push({ text: item.text });
        if (item.imageBase64) {
          const { mimeType, data } = stripDataUrlPrefix(item.imageBase64);
          parts.push({ inlineData: { mimeType, data } });
        }
        if (parts.length === 0) parts.push({ text: "item" });
        return { parts };
      });
      const vectors = await geminiEmbedContents(contents, model, PE_DIMENSIONS);
      return assertNormalizedBatch(vectors, "mixed");
    }),
  );
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
