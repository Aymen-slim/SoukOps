import { createHash } from "node:crypto";
import { z } from "zod";
import { getServerEnv, requireEnv, resolveAsrProviderName } from "@/lib/env";
import { getBasetenLlmClient } from "./baseten";
import { withCassette } from "./cassette";
import { geminiConfigured, geminiTranscribeAudio } from "./providers/gemini";
import { openaiConfigured, openaiTranscribeAudio } from "./providers/openai";
import { traced } from "./trace";

export interface TranscribeRequest {
  /** Audio bytes (WAV for Meta ASR; WAV/OGG/MP4/M4A/AAC/MP3 for ElevenLabs, OpenAI & Gemini). */
  wav: Buffer;
  /** Optional MIME type override (otherwise inferred from magic bytes). */
  mimeType?: string;
  /** Optional filename override (otherwise inferred from MIME). */
  filename?: string;
  /** Biasing terms: product/service names, landmarks, common Derja words. */
  keywords?: string[];
  conversationId?: string;
  /** Set only when the shop is not on the Derja default, so replay keys stay stable. */
  languageBias?: string[];
  /** Auto-detect and transcribe ANY spoken language worldwide (used by voice context input). */
  anyLanguage?: boolean;
}

const metaAsrResponseSchema = z
  .object({
    text: z.string().optional(),
    transcript: z.string().optional(),
    transcription: z.string().optional(),
  })
  .passthrough();

const elevenLabsAsrResponseSchema = z
  .object({
    text: z.string().optional(),
    transcript: z.string().optional(),
  })
  .passthrough();

function wavHash(wav: Buffer): string {
  return `${wav.length}:${wav.subarray(0, 64).toString("hex")}`;
}

function fullAudioHash(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

/** Detects audio container MIME + extension from buffer magic bytes. */
export function detectAudioFormat(buf: Buffer, explicitMime?: string): { mimeType: string; ext: string } {
  if (explicitMime) {
    const clean = explicitMime.split(";")[0]!.trim().toLowerCase();
    if (clean === "audio/wav" || clean === "audio/x-wav") return { mimeType: "audio/wav", ext: "wav" };
    if (clean === "audio/ogg" || clean === "application/ogg") return { mimeType: "audio/ogg", ext: "ogg" };
    if (clean === "audio/mp4" || clean === "audio/m4a" || clean === "audio/x-m4a" || clean === "video/mp4") {
      return { mimeType: "audio/mp4", ext: "m4a" };
    }
    if (clean === "audio/aac") return { mimeType: "audio/aac", ext: "aac" };
    if (clean === "audio/mpeg" || clean === "audio/mp3") return { mimeType: "audio/mpeg", ext: "mp3" };
    if (clean === "audio/webm") return { mimeType: "audio/webm", ext: "webm" };
  }
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WAVE") {
    return { mimeType: "audio/wav", ext: "wav" };
  }
  if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "OggS") {
    return { mimeType: "audio/ogg", ext: "ogg" };
  }
  if (buf.length >= 8 && buf.subarray(4, 8).toString("ascii") === "ftyp") {
    return { mimeType: "audio/mp4", ext: "m4a" };
  }
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { mimeType: "audio/webm", ext: "webm" };
  }
  if (
    (buf.length >= 3 && buf.subarray(0, 3).toString("ascii") === "ID3") ||
    (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)
  ) {
    return { mimeType: "audio/mpeg", ext: "mp3" };
  }
  return { mimeType: "audio/wav", ext: "wav" };
}

/** ElevenLabs Scribe v2: POST /v1/speech-to-text (handles OGG, MP4/M4A, AAC, MP3, WAV natively). */
export async function transcribeWithElevenLabs(req: TranscribeRequest): Promise<string> {
  const env = getServerEnv();
  requireEnv("ELEVENLABS_API_KEY");
  const model = env.ELEVENLABS_ASR_MODEL;
  const format = detectAudioFormat(req.wav, req.mimeType);
  return withCassette(
    "asr.elevenlabs",
    { model, audio: fullAudioHash(req.wav), mimeType: format.mimeType, keywords: req.keywords ?? [] },
    () =>
      traced({ kind: "asr.transcribe", model, provider: "elevenlabs", conversationId: req.conversationId }, async () => {
        const form = new FormData();
        form.append("model_id", model);
        form.append("tag_audio_events", "false");
        form.append(
          "file",
          new Blob([new Uint8Array(req.wav)], { type: format.mimeType }),
          req.filename ?? `audio.${format.ext}`,
        );
        const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          headers: { "xi-api-key": env.ELEVENLABS_API_KEY! },
          body: form,
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) throw new Error(`ElevenLabs ASR failed: ${res.status} ${await res.text()}`);
        const parsed = elevenLabsAsrResponseSchema.parse(await res.json());
        const text = (parsed.text ?? parsed.transcript ?? "").trim();
        if (!text) throw new Error("ElevenLabs ASR returned an empty transcript");
        return text;
      }),
  );
}

/** OpenAI `gpt-transcribe`: smart code-switching & domain-keyword prompting. */
export async function transcribeWithOpenAI(req: TranscribeRequest): Promise<string> {
  const env = getServerEnv();
  requireEnv("OPENAI_API_KEY");
  const model = env.OPENAI_ASR_MODEL;
  const format = detectAudioFormat(req.wav, req.mimeType);
  return withCassette(
    "asr.openai",
    { model, audio: fullAudioHash(req.wav), mimeType: format.mimeType, keywords: req.keywords ?? [] },
    () =>
      traced({ kind: "asr.transcribe", model, provider: "openai", conversationId: req.conversationId }, async () => {
        const promptParts = [
          "Tunisian Derja (Arabic script or Arabizi), French, and English voice note.",
          req.keywords?.length ? `Domain keywords: ${req.keywords.join(", ")}.` : null,
        ].filter(Boolean);
        const text = await openaiTranscribeAudio({
          audio: req.wav,
          mimeType: format.mimeType,
          filename: req.filename ?? `audio.${format.ext}`,
          model,
          prompt: promptParts.join(" "),
        });
        if (!text) throw new Error("OpenAI ASR returned an empty transcript");
        return text;
      }),
  );
}

/** Gemini native audio transcription with Tunisian Derja + French dialect context. */
export async function transcribeWithGeminiAudio(req: TranscribeRequest): Promise<string> {
  const env = getServerEnv();
  if (!env.geminiApiKey) throw new Error("Missing required env var: GEMINI_API_KEY (set it in .env.local)");
  const model = env.GEMINI_FAST_MODEL;
  const format = detectAudioFormat(req.wav, req.mimeType);
  return withCassette(
    "asr.gemini",
    req.anyLanguage
      ? { model, audio: fullAudioHash(req.wav), mimeType: format.mimeType, keywords: req.keywords ?? [], anyLanguage: true }
      : { model, audio: fullAudioHash(req.wav), mimeType: format.mimeType, keywords: req.keywords ?? [] },
    () =>
      traced({ kind: "asr.transcribe", model, provider: "gemini", conversationId: req.conversationId }, async () => {
        const text = await geminiTranscribeAudio({
          audio: req.wav,
          mimeType: format.mimeType,
          model,
          keywords: req.keywords,
          languageBias: req.languageBias,
          anyLanguage: req.anyLanguage,
        });
        if (!text) throw new Error("Gemini audio transcription returned an empty transcript");
        return text;
      }),
  );
}

/** Muse Voice Transcribe: POST /v1/asr/transcribe (WAV mono 16-bit 16/24 kHz). */
export async function transcribeWithMeta(req: TranscribeRequest): Promise<string> {
  const env = getServerEnv();
  requireEnv("MODEL_API_KEY");
  const cassetteInput = req.languageBias
    ? { model: env.ASR_MODEL, wav: wavHash(req.wav), keywords: req.keywords ?? [], languageBias: req.languageBias }
    : { model: env.ASR_MODEL, wav: wavHash(req.wav), keywords: req.keywords ?? [] };
  return withCassette("asr.meta", cassetteInput, () =>
    traced({ kind: "asr.transcribe", model: env.ASR_MODEL, provider: "meta", conversationId: req.conversationId }, async () => {
      const form = new FormData();
      form.append(
        "request",
        JSON.stringify({
          model: env.ASR_MODEL,
          audioEncoding: "WAV",
          languageBias: req.languageBias ?? ["Arabic", "French"],
          keywords: req.keywords ?? [],
        }),
      );
      form.append("audio", new Blob([new Uint8Array(req.wav)], { type: "audio/wav" }), "audio.wav");

      const res = await fetch("https://api.meta.ai/v1/asr/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.MODEL_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`Meta ASR failed: ${res.status} ${await res.text()}`);
      const parsed = metaAsrResponseSchema.parse(await res.json());
      const text = parsed.text ?? parsed.transcript ?? parsed.transcription ?? "";
      if (!text) throw new Error("Meta ASR returned an empty transcript");
      return text;
    }),
  );
}

/** Muse Spark Open (Baseten) audio input — legacy fallback. */
export async function transcribeWithSparkOpen(req: TranscribeRequest): Promise<string> {
  const env = getServerEnv();
  const model = env.BASETEN_SPARK_OPEN_MODEL;
  return withCassette("asr.sparkOpen", { model, wav: wavHash(req.wav), keywords: req.keywords ?? [] }, () =>
    traced({ kind: "asr.transcribe", model, provider: "baseten", conversationId: req.conversationId }, async () => {
      const client = getBasetenLlmClient();
      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Transcribe this Tunisian Derja audio exactly as spoken. Return only the transcript.${
                  req.keywords?.length ? ` Likely words: ${req.keywords.join(", ")}.` : ""
                }`,
              },
              {
                type: "input_audio",
                input_audio: { data: req.wav.toString("base64"), format: "wav" },
              },
            ],
          },
        ],
      });
      const text = completion.choices[0]?.message?.content?.trim() ?? "";
      if (!text) throw new Error("Spark Open ASR returned an empty transcript");
      return text;
    }),
  );
}

type AsrProviderName = "elevenlabs" | "openai" | "gemini" | "transcribe" | "spark-open";

async function runAsrProvider(provider: AsrProviderName, req: TranscribeRequest): Promise<string> {
  switch (provider) {
    case "elevenlabs":
      return transcribeWithElevenLabs(req);
    case "openai":
      return transcribeWithOpenAI(req);
    case "gemini":
      return transcribeWithGeminiAudio(req);
    case "spark-open":
      return transcribeWithSparkOpen(req);
    case "transcribe":
      return transcribeWithMeta(req);
  }
}

/**
 * Primary transcription path with automatic fallback across configured engines.
 * In `AI_MODE=replay`, executes only the resolved primary provider for strict
 * cassette determinism.
 */
export async function transcribe(req: TranscribeRequest): Promise<string> {
  const env = getServerEnv();
  const primary = resolveAsrProviderName(env);
  if (env.AI_MODE === "replay" || env.ASR_PROVIDER !== "auto") {
    return runAsrProvider(primary, req);
  }

  const fallbacks: AsrProviderName[] = [primary];
  if (env.ELEVENLABS_API_KEY && !fallbacks.includes("elevenlabs")) fallbacks.push("elevenlabs");
  if (openaiConfigured() && !fallbacks.includes("openai")) fallbacks.push("openai");
  if (geminiConfigured() && !fallbacks.includes("gemini")) fallbacks.push("gemini");
  if (env.MODEL_API_KEY && !fallbacks.includes("transcribe")) fallbacks.push("transcribe");

  let lastErr: unknown = null;
  for (const provider of fallbacks) {
    try {
      return await runAsrProvider(provider, req);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
