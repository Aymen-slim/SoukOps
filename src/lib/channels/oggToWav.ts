/**
 * WhatsApp voice notes arrive as OGG Opus (48 kHz); Muse Voice Transcribe
 * only accepts WAV mono 16-bit 16/24 kHz. Decode, downmix, resample to
 * 16 kHz and wrap as WAV. Pure helpers are exported for unit tests.
 */
import { OggOpusDecoder } from "ogg-opus-decoder";

export function resampleTo16k(samples: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === 16_000) return samples;
  const ratio = sourceRate / 16_000;
  const outLength = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = samples[idx] ?? 0;
    const b = samples[Math.min(idx + 1, samples.length - 1)] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

export function encodeWav16kMono(samples: Float32Array): Buffer {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(16_000, 24);
  buffer.writeUInt32LE(32_000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32_767), 44 + i * 2);
  }
  return buffer;
}

export async function oggOpusToWav16k(ogg: Buffer): Promise<Buffer> {
  const decoder = new OggOpusDecoder();
  try {
    await decoder.ready;
    const decoded = await decoder.decodeFile(new Uint8Array(ogg));
    const channels = decoded.channelData;
    if (!channels.length || !channels[0].length) throw new Error("empty opus decode");
    const mono = new Float32Array(channels[0].length);
    for (const channel of channels) {
      for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / channels.length;
    }
    return encodeWav16kMono(resampleTo16k(mono, decoded.sampleRate));
  } finally {
    decoder.free();
  }
}
