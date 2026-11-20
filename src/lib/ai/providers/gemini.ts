import { GoogleGenAI, ThinkingLevel, type Content, type Part } from "@google/genai";
import { getServerEnv, requireEnv } from "@/lib/env";

let cached: GoogleGenAI | null = null;

/** Google GenAI client singleton. Server-only. */
export function getGeminiClient(): GoogleGenAI {
  if (cached) return cached;
  const apiKey = getServerEnv().geminiApiKey ?? requireEnv("GEMINI_API_KEY");
  cached = new GoogleGenAI({ apiKey });
  return cached;
}

export function geminiConfigured(): boolean {
  return Boolean(getServerEnv().geminiApiKey);
}

export function resetGeminiClient(): void {
  cached = null;
}

function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function toThinkingLevel(effort: "low" | "medium" | "high"): ThinkingLevel {
  if (effort === "high") return ThinkingLevel.HIGH;
  if (effort === "medium") return ThinkingLevel.MEDIUM;
  return ThinkingLevel.LOW;
}

function buildParts(user: string, images?: string[]): Part[] {
  const parts: Part[] = [{ text: user }];
  for (const img of images ?? []) {
    const parsed = parseDataUrl(img);
    if (parsed) {
      parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
    }
  }
  return parts;
}

export async function geminiGenerateJson(req: {
  model: string;
  jsonSchema: Record<string, unknown>;
  system?: string;
  user: string;
  images?: string[];
  reasoningEffort?: "low" | "medium" | "high";
  signal?: AbortSignal;
}): Promise<string> {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: req.model,
    contents: [{ role: "user", parts: buildParts(req.user, req.images) }],
    config: {
      ...(req.system ? { systemInstruction: req.system } : {}),
      ...(req.signal ? { abortSignal: req.signal } : {}),
      responseMimeType: "application/json",
      responseJsonSchema: req.jsonSchema,
      thinkingConfig: { thinkingLevel: toThinkingLevel(req.reasoningEffort ?? "low") },
    },
  });
  return response.text ?? "";
}

export async function geminiGenerateText(req: {
  model: string;
  system?: string;
  user: string;
  reasoningEffort?: "low" | "medium" | "high";
  signal?: AbortSignal;
}): Promise<string> {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: req.model,
    contents: req.user,
    config: {
      ...(req.system ? { systemInstruction: req.system } : {}),
      ...(req.signal ? { abortSignal: req.signal } : {}),
      thinkingConfig: { thinkingLevel: toThinkingLevel(req.reasoningEffort ?? "low") },
    },
  });
  return response.text ?? "";
}

function l2Normalize(vec: number[]): number[] {
  let norm = 0;
  for (const x of vec) norm += x * x;
  const denom = Math.sqrt(norm) || 1;
  return vec.map((x) => x / denom);
}

/**
 * Generates normalized 1024-dim multimodal embeddings via `gemini-embedding-2`.
 * Passes one Content entry per item so batch requests return one vector per item.
 */
export async function geminiEmbedContents(
  contents: Content[],
  model: string,
  dimensions = 1024,
): Promise<number[][]> {
  if (contents.length === 0) return [];
  const ai = getGeminiClient();
  const res = await ai.models.embedContent({
    model,
    contents,
    config: { outputDimensionality: dimensions },
  });
  const vectors = (res.embeddings ?? []).map((item) => l2Normalize(item.values ?? []));
  if (vectors.length !== contents.length || vectors.some((v) => v.length !== dimensions)) {
    throw new Error(
      `Gemini embedding mismatch: got ${vectors.length} vectors (expected ${contents.length}) of dims ${vectors[0]?.length ?? 0}`,
    );
  }
  return vectors;
}

export async function geminiTranscribeAudio(req: {
  audio: Buffer;
  mimeType: string;
  model: string;
  keywords?: string[];
  languageBias?: string[];
  anyLanguage?: boolean;
}): Promise<string> {
  const ai = getGeminiClient();
  const hints = req.keywords?.length ? ` Domain terms/names: ${req.keywords.join(", ")}.` : "";
  const instruction = req.anyLanguage
    ? `Transcribe this voice note verbatim in whatever language or dialect the speaker uses (auto-detect ANY language worldwide — Tunisian Derja in Arabizi or Arabic script, Arabic, French, English, Spanish, Italian, German, Turkish, or mixed code-switching). Preserve exact prices, hours, dates, names, and numbers accurately. Return ONLY the transcript text.${hints}`
    : (() => {
        const langs = req.languageBias?.length ? req.languageBias.join(", ") : "Tunisian Derja (Arabic/Arabizi), French, Arabic";
        return `Transcribe this voice message verbatim in its spoken dialect/language (${langs}). Preserve Tunisian Arabizi, Arabic script, and French code-switching accurately. Return ONLY the transcript text.${hints}`;
      })();
  const response = await ai.models.generateContent({
    model: req.model,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: instruction,
          },
          { inlineData: { mimeType: req.mimeType, data: req.audio.toString("base64") } },
        ],
      },
    ],
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });
  return (response.text ?? "").trim();
}

export async function geminiGenerateImage(req: {
  model: string;
  prompt: string;
}): Promise<{ b64Json?: string; url?: string }> {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: req.model,
    contents: req.prompt,
    config: { responseModalities: ["IMAGE"] },
  });
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return { b64Json: part.inlineData.data };
    }
  }
  throw new Error("Gemini image generation returned no image data");
}
