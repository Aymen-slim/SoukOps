import OpenAI from "openai";
import { toFile } from "openai";
import { getServerEnv, requireEnv } from "@/lib/env";

let cached: OpenAI | null = null;

/** OpenAI client singleton. Server-only. */
export function getOpenAiClient(): OpenAI {
  if (cached) return cached;
  const key = requireEnv("OPENAI_API_KEY");
  cached = new OpenAI({ apiKey: key, timeout: 120_000 });
  return cached;
}

export function openaiConfigured(): boolean {
  return Boolean(getServerEnv().OPENAI_API_KEY);
}

/** Drop cached client (e.g., in tests after changing process.env). */
export function resetOpenAiClient(): void {
  cached = null;
}

export function dataUrlToImagePart(url: string): { type: "image_url"; image_url: { url: string } } {
  return { type: "image_url", image_url: { url } };
}

export async function openaiGenerateJson(req: {
  model: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  system?: string;
  user: string;
  images?: string[];
  reasoningEffort?: "low" | "medium" | "high";
}): Promise<string> {
  const client = getOpenAiClient();
  const content: OpenAI.ChatCompletionContentPart[] | string = req.images?.length
    ? [{ type: "text", text: req.user }, ...req.images.map(dataUrlToImagePart)]
    : req.user;

  const basePayload = {
    model: req.model,
    messages: [
      ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
      { role: "user" as const, content },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: { name: req.schemaName, strict: true, schema: req.jsonSchema },
    },
  };

  try {
    const completion = await client.chat.completions.create({
      ...basePayload,
      ...(req.reasoningEffort ? { reasoning_effort: req.reasoningEffort } : {}),
    });
    return completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    // Some OpenAI snapshots reject reasoning_effort; retry once without it if 400.
    const msg = err instanceof Error ? err.message : String(err);
    if (req.reasoningEffort && /reasoning_effort|unsupported/i.test(msg)) {
      const completion = await client.chat.completions.create(basePayload);
      return completion.choices[0]?.message?.content ?? "";
    }
    throw err;
  }
}

export async function openaiGenerateText(req: {
  model: string;
  system?: string;
  user: string;
  reasoningEffort?: "low" | "medium" | "high";
  signal?: AbortSignal;
}): Promise<string> {
  const client = getOpenAiClient();
  const basePayload = {
    model: req.model,
    messages: [
      ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
      { role: "user" as const, content: req.user },
    ],
  };

  const options = req.signal ? { signal: req.signal } : undefined;
  try {
    const completion = await client.chat.completions.create(
      {
        ...basePayload,
        ...(req.reasoningEffort ? { reasoning_effort: req.reasoningEffort } : {}),
      },
      options,
    );
    return completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (req.reasoningEffort && /reasoning_effort|unsupported/i.test(msg)) {
      const completion = await client.chat.completions.create(basePayload, options);
      return completion.choices[0]?.message?.content ?? "";
    }
    throw err;
  }
}

export async function openaiTranscribeAudio(req: {
  audio: Buffer;
  mimeType: string;
  filename: string;
  model: string;
  prompt?: string;
}): Promise<string> {
  const client = getOpenAiClient();
  const file = await toFile(req.audio, req.filename, { type: req.mimeType });
  const result = await client.audio.transcriptions.create({
    model: req.model,
    file,
    ...(req.prompt ? { prompt: req.prompt } : {}),
  });
  return result.text?.trim() ?? "";
}

export async function openaiGenerateImage(req: {
  model: string;
  prompt: string;
}): Promise<{ b64Json?: string; url?: string }> {
  const client = getOpenAiClient();
  const result = await client.images.generate({
    model: req.model,
    prompt: req.prompt,
    n: 1,
  });
  const first = result.data?.[0];
  if (!first?.b64_json && !first?.url) {
    throw new Error("OpenAI image generation returned no image data");
  }
  return { b64Json: first.b64_json, url: first.url };
}
