/**
 * Browser voice-note recorder. Captures the mic with MediaRecorder, then
 * re-encodes to mono 16-bit 16 kHz WAV — the only format transcription accepts.
 * Client-side only.
 */

const MIN_SAMPLES = Math.floor(16000 * 0.4);

export class WavRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  async start(): Promise<void> {
    this.chunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    const mimeType = pickMimeType();
    this.recorder = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
    this.recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    });
    this.recorder.start(250);
  }

  /** Stops the mic and returns a 16 kHz WAV, or null when the clip is too short. */
  async stop(): Promise<Blob | null> {
    const recorder = this.recorder;
    const raw = await finishRecording(recorder, this.chunks);
    this.release();
    if (!raw || raw.size < 800) return null;

    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(await raw.arrayBuffer());
      const pcm16 = downsampleTo16kPcm(decoded.getChannelData(0), decoded.sampleRate);
      if (pcm16.length < MIN_SAMPLES) return null;
      return new Blob([encodeWav(pcm16, 16000)], { type: "audio/wav" });
    } finally {
      await context.close();
    }
  }

  cancel(): void {
    const recorder = this.recorder;
    try {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {
      // The recorder can already be inactive if the mic was released.
    }
    this.release();
  }

  private release(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function finishRecording(recorder: MediaRecorder | null, chunks: Blob[]): Promise<Blob | null> {
  if (!recorder) return Promise.resolve(null);
  if (recorder.state === "inactive") {
    return Promise.resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null);
  }
  return new Promise((resolve) => {
    recorder.addEventListener(
      "stop",
      () => resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null),
      { once: true },
    );
    recorder.stop();
  });
}

function downsampleTo16kPcm(input: Float32Array, inputRate: number): Int16Array {
  const ratio = inputRate / 16000;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const sample = input[Math.floor(i * ratio)];
    out[i] = Math.max(-1, Math.min(1, sample)) * 0x7fff;
  }
  return out;
}

function encodeWav(samples: Int16Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, s, true));
  return buffer;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export async function fileToBase64(file: File): Promise<string> {
  return blobToBase64(file);
}
