import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { segmentImage } from "@/lib/ai/sam";
import { isBlurry } from "@/lib/media/blur";
import { cropWithMask } from "@/lib/media/crop";

const bodySchema = z.object({
  imageBase64: z.string().min(32).max(12_000_000),
  mediaExt: z.enum(["jpg", "jpeg", "png", "webp"]).default("jpg"),
  categoryPhrase: z.string().trim().min(1).max(60),
});

function decodeImage(input: string): Buffer {
  const match = input.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
  return Buffer.from(match ? match[1] : input, "base64");
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid photo or category" }, { status: 400 });
  const rawBytes = decodeImage(parsed.data.imageBase64);
  let meta: { width?: number; height?: number };
  try {
    meta = await sharp(rawBytes).metadata();
  } catch {
    return NextResponse.json({ error: "Image illisible." }, { status: 400 });
  }

  // Only downscale oversized camera images (>1280px); smaller images keep exact bytes for cassette stability.
  const needsResize = (meta.width ?? 0) > 1280 || (meta.height ?? 0) > 1280;
  const bytes = needsResize
    ? await sharp(rawBytes)
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 86 })
      .toBuffer()
    : rawBytes;

  if (await isBlurry(bytes)) {
    return NextResponse.json(
      { error: "Photo too blurry. Retake it closer, without moving." },
      { status: 422 },
    );
  }

  const ext = needsResize ? "jpeg" : parsed.data.mediaExt === "jpg" ? "jpeg" : parsed.data.mediaExt;
  const dataUrl = `data:image/${ext};base64,${bytes.toString("base64")}`;
  try {
    const sam = await segmentImage({ imageDataUrl: dataUrl, nounPhrase: parsed.data.categoryPhrase });
    const crop = sam.objects[0]
      ? await cropWithMask(bytes, sam.objects[0])
      : await sharp(bytes).png({ compressionLevel: 8 }).toBuffer();
    return NextResponse.json({
      cropBase64: crop.toString("base64"),
      usedOriginal: sam.objects.length === 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "crop failed";
    return NextResponse.json({ error: `Crop failed: ${message}` }, { status: 502 });
  }
}
