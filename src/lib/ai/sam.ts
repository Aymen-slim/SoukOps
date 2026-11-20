import { createHash } from "node:crypto";
import { buildObjectPrompt, decodeMaskToRaster, parseImageStream, recordsOfKind } from "@meta-sam/parser";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { withCassette } from "./cassette";
import { getMetaClient, metaConfigured } from "./meta";
import { traced } from "./trace";

export interface SamBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SamObject {
  objectId: string;
  box: SamBox;
  confidence?: number;
  mask: { width: number; height: number; encoding: string; payload: string };
  /** Box-sized mask raster (1 byte per pixel), base64. */
  rasterBase64: string;
}

export interface SamResult {
  objects: SamObject[];
  diagnostics: Array<{ severity: string; code: string; message: string }>;
}

export function samConfigured(): boolean {
  return metaConfigured() || Boolean(getServerEnv().FAL_KEY);
}

/** Content hash for cassette keys (CODE_MAP gap: byte length alone collides). */
export function contentHash(dataUrlOrBase64: string): string {
  return createHash("sha256").update(dataUrlOrBase64.slice(0, 512_000)).digest("hex").slice(0, 16);
}

const falSamResponseSchema = z.object({
  boxes: z.array(z.array(z.number())).optional(),
  scores: z.array(z.number()).optional(),
});

async function runFalSam(req: {
  imageDataUrl: string;
  promptText: string;
  conversationId?: string;
}): Promise<SamResult> {
  const env = getServerEnv();
  if (!env.FAL_KEY) throw new Error("Missing FAL_KEY for SAM fallback");
  return traced(
    { kind: "sam.segment", model: "fal-ai/sam-3/image", provider: "fal", conversationId: req.conversationId },
    async () => {
      const res = await fetch("https://fal.run/fal-ai/sam-3/image", {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
        headers: {
          Authorization: `Key ${env.FAL_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_url: req.imageDataUrl,
          prompt: req.promptText,
          return_multiple_masks: true,
          max_masks: 6,
          include_scores: true,
          include_boxes: true,
        }),
      });
      if (!res.ok) throw new Error(`fal SAM failed: ${res.status} ${await res.text()}`);
      const parsed = falSamResponseSchema.parse(await res.json());
      const boxes = parsed.boxes ?? [];
      const scores = parsed.scores ?? [];
      const objects: SamObject[] = boxes
        .filter((b) => b.length >= 4)
        .map((b, i) => ({
          objectId: `fal_${i}`,
          box: { left: b[0]!, top: b[1]!, right: b[2]!, bottom: b[3]! },
          confidence: scores[i],
          mask: { width: 0, height: 0, encoding: "none", payload: "" },
          rasterBase64: "",
        }));
      return { objects, diagnostics: [] };
    },
  );
}

async function runSamPrompt(req: {
  imageDataUrl: string;
  promptText: string;
  cassetteNamespace: string;
  cassetteInput: Record<string, unknown>;
  kind: string;
  conversationId?: string;
  allowFalFallback?: boolean;
}): Promise<SamResult> {
  const env = getServerEnv();
  const model = env.SAM_MODEL;
  return withCassette(req.cassetteNamespace, req.cassetteInput, async () => {
    if (!metaConfigured() && req.allowFalFallback && env.FAL_KEY && env.AI_MODE !== "replay") {
      return runFalSam({
        imageDataUrl: req.imageDataUrl,
        promptText: req.promptText,
        conversationId: req.conversationId,
      });
    }
    try {
      return await traced(
        { kind: req.kind, model, provider: "meta", conversationId: req.conversationId },
        async () => {
          const client = getMetaClient();
          const events = await client.responses.create({
            model,
            stream: true,
            input: [
              {
                type: "message",
                role: "user",
                content: [
                  { type: "input_text", text: req.promptText },
                  { type: "input_image", image_url: req.imageDataUrl, detail: "auto" },
                ],
              },
            ],
            metadata: { include_confidence: "true", mask_encoding: "one_bit", score_threshold: "0.5" },
          });

          const parsed = parseImageStream(events as AsyncIterable<{ type: string }>);
          for await (const _event of parsed) {
            void _event;
          }
          const { records, diagnostics } = await parsed.finalResult;

          const masks = recordsOfKind(records, "mask");
          const objects: SamObject[] = masks.map((record) => {
            const raster = decodeMaskToRaster(record.mask);
            return {
              objectId: record.objectId,
              box: {
                left: record.bounds.left,
                top: record.bounds.top,
                right: record.bounds.right,
                bottom: record.bounds.bottom,
              },
              confidence: record.confidence,
              mask: {
                width: record.mask.width,
                height: record.mask.height,
                encoding: record.mask.encoding,
                payload: record.mask.payload,
              },
              rasterBase64: Buffer.from(raster).toString("base64"),
            };
          });

          return {
            objects,
            diagnostics: diagnostics.map((d) => ({ severity: d.severity, code: d.code, message: d.message })),
          };
        },
      );
    } catch (err) {
      if (req.allowFalFallback && env.FAL_KEY && env.AI_MODE !== "replay") {
        return runFalSam({
          imageDataUrl: req.imageDataUrl,
          promptText: req.promptText,
          conversationId: req.conversationId,
        });
      }
      throw err;
    }
  });
}

/**
 * SAM 3.1 segmentation via Responses API streaming + @meta-sam/parser
 * (with optional fal.ai SAM 3 fallback).
 */
export async function segmentImage(req: {
  imageDataUrl: string;
  nounPhrase: string;
  conversationId?: string;
}): Promise<SamResult> {
  const env = getServerEnv();
  return runSamPrompt({
    imageDataUrl: req.imageDataUrl,
    promptText: req.nounPhrase,
    cassetteNamespace: "sam.segment",
    cassetteInput: { model: env.SAM_MODEL, nounPhrase: req.nounPhrase, imageHash: contentHash(req.imageDataUrl) },
    kind: "sam.segment",
    conversationId: req.conversationId,
    allowFalFallback: true,
  });
}

/**
 * SAM point prompt (disambiguation ladder step d): segment the garment the
 * buyer tapped/chose.
 */
export async function segmentImageAtPoint(req: {
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  point: { x: number; y: number };
  /** Box of the tapped crop, when known (numbered-crop selection). */
  box?: SamBox;
  conversationId?: string;
}): Promise<SamResult> {
  const env = getServerEnv();
  const x = Math.max(0, Math.min(Math.round(req.point.x), req.imageWidth - 1));
  const y = Math.max(0, Math.min(Math.round(req.point.y), req.imageHeight - 1));
  const box =
    req.box &&
    req.box.left >= 0 &&
    req.box.top >= 0 &&
    req.box.right <= req.imageWidth &&
    req.box.bottom <= req.imageHeight &&
    req.box.right > req.box.left &&
    req.box.bottom > req.box.top
      ? {
          left: Math.floor(req.box.left),
          top: Math.floor(req.box.top),
          right: Math.floor(req.box.right),
          bottom: Math.floor(req.box.bottom),
        }
      : undefined;
  const promptText = buildObjectPrompt({
    size: { width: req.imageWidth, height: req.imageHeight },
    objects: [
      {
        id: 0,
        prompts: [
          box
            ? { box, points: [{ x, y, label: "positive" as const }] }
            : { points: [{ x, y, label: "positive" as const }] },
        ],
      },
    ],
  });
  return runSamPrompt({
    imageDataUrl: req.imageDataUrl,
    promptText,
    cassetteNamespace: "sam.segmentPoint",
    cassetteInput: {
      model: env.SAM_MODEL,
      point: { x, y },
      box: box ?? null,
      imageSize: { width: req.imageWidth, height: req.imageHeight },
      imageHash: contentHash(req.imageDataUrl),
    },
    kind: "sam.segmentPoint",
    conversationId: req.conversationId,
  });
}
