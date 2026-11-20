import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam, ImageBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages/messages";
import { getServerEnv, requireEnv } from "@/lib/env";

let cached: Anthropic | null = null;

/** Anthropic client singleton. Server-only. */
export function getAnthropicClient(): Anthropic {
  if (cached) return cached;
  const apiKey = requireEnv("ANTHROPIC_API_KEY");
  cached = new Anthropic({ apiKey, timeout: 120_000 });
  return cached;
}

export function anthropicConfigured(): boolean {
  return Boolean(getServerEnv().ANTHROPIC_API_KEY);
}

export function resetAnthropicClient(): void {
  cached = null;
}

type SupportedMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function parseImageBlock(url: string): ImageBlockParam | null {
  const match = url.match(/^data:(image\/(?:jpeg|jpg|png|gif|webp));base64,(.+)$/i);
  if (!match) return null;
  const rawType = match[1].toLowerCase();
  const mediaType: SupportedMediaType = rawType === "image/jpg" ? "image/jpeg" : (rawType as SupportedMediaType);
  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data: match[2] },
  };
}

function buildContent(user: string, images?: string[]): string | Array<ContentBlockParam> {
  if (!images?.length) return user;
  const blocks: Array<TextBlockParam | ImageBlockParam> = [{ type: "text", text: user }];
  for (const img of images) {
    const parsed = parseImageBlock(img);
    if (parsed) blocks.push(parsed);
  }
  return blocks;
}

function extractText(blocks: Array<{ type: string; text?: string }>): string {
  return blocks
    .filter((b): b is { type: "text"; text: string } => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
}

export async function anthropicGenerateJson(req: {
  model: string;
  jsonSchema: Record<string, unknown>;
  system?: string;
  user: string;
  images?: string[];
  reasoningEffort?: "low" | "medium" | "high";
}): Promise<string> {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: req.model,
    max_tokens: req.reasoningEffort === "high" ? 4096 : 2048,
    ...(req.system ? { system: req.system } : {}),
    messages: [{ role: "user", content: buildContent(req.user, req.images) }],
    output_config: {
      effort: req.reasoningEffort ?? "low",
      format: { type: "json_schema", schema: req.jsonSchema },
    },
  });
  return extractText(message.content as Array<{ type: string; text?: string }>);
}

export async function anthropicGenerateText(req: {
  model: string;
  system?: string;
  user: string;
  reasoningEffort?: "low" | "medium" | "high";
  signal?: AbortSignal;
}): Promise<string> {
  const client = getAnthropicClient();
  const message = await client.messages.create(
    {
      model: req.model,
      max_tokens: req.reasoningEffort === "high" ? 4096 : 1536,
      ...(req.system ? { system: req.system } : {}),
      messages: [{ role: "user", content: req.user }],
      ...(req.reasoningEffort ? { output_config: { effort: req.reasoningEffort } } : {}),
    },
    req.signal ? { signal: req.signal } : undefined,
  );
  return extractText(message.content as Array<{ type: string; text?: string }>);
}
