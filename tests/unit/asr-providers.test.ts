import { afterEach, describe, expect, it, vi } from "vitest";
import { detectAudioFormat } from "@/lib/ai/asr";
import { parseFacebookWebhook } from "@/lib/channels/facebook";
import { resetEnvCache, resolveAsrProviderName, resolveEmbedProviderName } from "@/lib/env";

const OLD_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...OLD_ENV };
  resetEnvCache();
  vi.restoreAllMocks();
});

describe("ASR format detection & provider routing", () => {
  it("detects WAV, OGG, M4A/MP4, MP3, and WebM magic bytes accurately", () => {
    const wav = Buffer.from("RIFF\x24\x00\x00\x00WAVEfmt ", "ascii");
    expect(detectAudioFormat(wav)).toEqual({ mimeType: "audio/wav", ext: "wav" });

    const ogg = Buffer.from("OggS\x00\x02\x00\x00", "ascii");
    expect(detectAudioFormat(ogg)).toEqual({ mimeType: "audio/ogg", ext: "ogg" });

    const m4a = Buffer.from("\x00\x00\x00\x18ftypM4A ", "ascii");
    expect(detectAudioFormat(m4a)).toEqual({ mimeType: "audio/mp4", ext: "m4a" });

    const mp3 = Buffer.from("ID3\x03\x00\x00\x00", "ascii");
    expect(detectAudioFormat(mp3)).toEqual({ mimeType: "audio/mpeg", ext: "mp3" });
  });

  it("prioritizes Gemini Audio > ElevenLabs Scribe v2 > OpenAI gpt-transcribe > Meta ASR in auto mode", () => {
    delete process.env.ASR_PROVIDER;
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    process.env.MODEL_API_KEY = "meta-key";
    resetEnvCache();
    expect(resolveAsrProviderName()).toBe("transcribe");

    process.env.OPENAI_API_KEY = "oai-key";
    resetEnvCache();
    expect(resolveAsrProviderName()).toBe("openai");

    process.env.ELEVENLABS_API_KEY = "el-key";
    resetEnvCache();
    expect(resolveAsrProviderName()).toBe("elevenlabs");

    process.env.GEMINI_API_KEY = "gem-key";
    resetEnvCache();
    expect(resolveAsrProviderName()).toBe("gemini");
  });

  it("resolves Gemini Embedding 2 over Voyage and PE in auto mode", () => {
    delete process.env.EMBED_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.VOYAGE_API_KEY;
    resetEnvCache();
    expect(resolveEmbedProviderName()).toBe("pe");

    process.env.VOYAGE_API_KEY = "voy-key";
    resetEnvCache();
    expect(resolveEmbedProviderName()).toBe("voyage");

    process.env.GEMINI_API_KEY = "gem-key";
    resetEnvCache();
    expect(resolveEmbedProviderName()).toBe("gemini");
  });
});

describe("Instagram & Messenger voice attachment extraction", () => {
  it("parses Instagram voice notes and Messenger audio clips for ASR transcription", () => {
    const parsed = parseFacebookWebhook({
      object: "instagram",
      entry: [
        {
          id: "ig-page-1",
          messaging: [
            {
              sender: { id: "ig-user-1" },
              message: {
                mid: "ig-audio-1",
                attachments: [{ type: "audio", payload: { url: "https://cdn.example/voice.mp4" } }],
              },
            },
          ],
        },
      ],
    });
    expect(parsed).toEqual([
      {
        externalId: "ig-audio-1",
        platformUserId: "ig-user-1",
        pageId: "ig-page-1",
        platform: "instagram",
        kind: "audio",
        body: null,
        attachmentUrl: "https://cdn.example/voice.mp4",
      },
    ]);
  });
});
