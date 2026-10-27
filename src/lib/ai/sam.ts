import { decodeMaskToRaster, parseImageStream, recordsOfKind } from "@meta-sam/parser";
import { getServerEnv } from "@/lib/env";
import { withCassette } from "./cassette";
import { getMetaClient } from "./meta";
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

/**
 * SAM 3.1 segmentation via Responses API streaming + @meta-sam/parser.
 * `nounPhrase` must be a short English category phrase ("dress"), not a
 * brand-like product name. Zero matches returns an empty objects list.
 * Day 1 supports concept prompts; point prompts (tap) land on Day 3.
 */
export async function segmentImage(req: {
  imageDataUrl: string;
  nounPhrase: string;
  conversationId?: string;
}): Promise<SamResult> {
  const env = getServerEnv();
  const model = env.SAM_MODEL;
  return withCassette(
    "sam.segment",
    { model, nounPhrase: req.nounPhrase, imageSize: req.imageDataUrl.length },
    () =>
      traced({ kind: "sam.segment", model, provider: "meta", conversationId: req.conversationId }, async () => {
        const client = getMetaClient();
        const events = await client.responses.create({
          model,
          stream: true,
          input: [
            {
              type: "message",
              role: "user",
              content: [
                { type: "input_text", text: req.nounPhrase },
                { type: "input_image", image_url: req.imageDataUrl, detail: "auto" },
              ],
            },
          ],
          metadata: { include_confidence: "true", mask_encoding: "one_bit", score_threshold: "0.5" },
        });

        const parsed = parseImageStream(events as AsyncIterable<{ type: string }>);
        // Drain the stream so finalResult resolves.
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
      }),
  );
}
