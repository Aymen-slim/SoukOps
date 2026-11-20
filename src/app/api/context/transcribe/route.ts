import { NextResponse } from "next/server";
import { z } from "zod";
import { transcribe } from "@/lib/ai/asr";
import { requireMerchant } from "@/lib/dashboard/guard";

const bodySchema = z.object({
  audioBase64: z.string().min(64).max(8_500_000),
  mimeType: z.string().trim().max(80).optional(),
});

export async function POST(request: Request) {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid voice recording payload." }, { status: 400 });
  }

  const cleanBase64 = parsed.data.audioBase64.replace(/^data:[^;]+;base64,/i, "");
  const wav = Buffer.from(cleanBase64, "base64");
  if (wav.length < 400 || wav.length > 6_500_000) {
    return NextResponse.json({ error: "Voice recording must be between 0.5s and 6 MB." }, { status: 400 });
  }

  try {
    const transcript = await transcribe({
      wav,
      mimeType: parsed.data.mimeType ?? "audio/wav",
      anyLanguage: true,
    });
    return NextResponse.json({ transcript });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not transcribe voice context." },
      { status: 500 },
    );
  }
}
