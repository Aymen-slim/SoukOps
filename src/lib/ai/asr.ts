import { z } from "zod";
import { getServerEnv, requireEnv } from "@/lib/env";
import { getBasetenLlmClient } from "./baseten";
import { withCassette } from "./cassette";
import { traced } from "./trace";

export interface TranscribeRequest {
  /** WAV bytes: mono, 16-bit, 16 or 24 kHz (max 10 min). */
  wav: Buffer;
  /** Biasing terms: product names, landmark names, common Derja words. */
  keywords?: string[];
  conversationId?: string;
}

const metaAsrResponseSchema = z
  .object({
    text: z.string().optional(),
    transcript: z.string().optional(),
    transcription: z.string().optional(),
  })
  .passthrough();

function wavHash(wav: Buffer): string {
  return `${wav.length}:${wav.subarray(0, 64).toString("hex")}`;
}

/** Muse Voice Transcribe: POST /v1/asr/transcribe (multipart request + audio). */
export async function transcribeWithMeta(req: TranscribeRequest): Promise<string> {
  const env = getServerEnv();
  requireEnv("MODEL_API_KEY");
  return withCassette("asr.meta", { model: env.ASR_MODEL, wav: wavHash(req.wav), keywords: req.keywords ?? [] }, () =>
    traced({ kind: "asr.transcribe", model: env.ASR_MODEL, provider: "meta", conversationId: req.conversationId }, async () => {
      const form = new FormData();
      form.append(
        "request",
        JSON.stringify({
          model: env.ASR_MODEL,
          audioEncoding: "WAV",
          languageBias: ["Arabic", "French"],
          keywords: req.keywords ?? [],
        }),
      );
      form.append("audio", new Blob([new Uint8Array(req.wav)], { type: "audio/wav" }), "audio.wav");

      const res = await fetch("https://api.meta.ai/v1/asr/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.MODEL_API_KEY}` },
        body: form,
      });
      if (!res.ok) throw new Error(`Meta ASR failed: ${res.status} ${await res.text()}`);
      const parsed = metaAsrResponseSchema.parse(await res.json());
      const text = parsed.text ?? parsed.transcript ?? parsed.transcription ?? "";
      if (!text) throw new Error("Meta ASR returned an empty transcript");
      return text;
    }),
  );
}

/** Muse Spark Open (Baseten) audio input — bake-off competitor and ASR fallback. */
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

/** Primary transcription path, selected by ASR_PROVIDER (Day 1 bake-off winner). */
export async function transcribe(req: TranscribeRequest): Promise<string> {
  const env = getServerEnv();
  return env.ASR_PROVIDER === "spark-open" ? transcribeWithSparkOpen(req) : transcribeWithMeta(req);
}
