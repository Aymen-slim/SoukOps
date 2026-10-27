import { z } from "zod";
import { pePredict } from "./baseten";
import { withCassette } from "./cassette";
import { traced } from "./trace";

const peResponseSchema = z.object({
  embeddings: z.array(z.array(z.number())),
});

export const PE_DIMENSIONS = 1024;

function assertNormalizedBatch(vectors: number[][], label: string): number[][] {
  for (const v of vectors) {
    if (v.length !== PE_DIMENSIONS) {
      throw new Error(`PE ${label} embedding has ${v.length} dims, expected ${PE_DIMENSIONS}`);
    }
  }
  return vectors;
}

/** Image embeddings from the Baseten PE-Core-L14-336 Truss. Input: base64 (no data: prefix). */
export async function embedImages(base64Images: string[], conversationId?: string): Promise<number[][]> {
  return withCassette("pe.embedImages", { count: base64Images.length, sizes: base64Images.map((b) => b.length) }, () =>
    traced({ kind: "pe.embedImages", model: "PE-Core-L14-336", provider: "baseten", conversationId }, async () => {
      const raw = await pePredict({ images: base64Images });
      const parsed = peResponseSchema.parse(raw);
      return assertNormalizedBatch(parsed.embeddings, "image");
    }),
  );
}

/** Text embeddings (same 1024-dim space). Keep queries short: 32-token limit. */
export async function embedTexts(texts: string[], conversationId?: string): Promise<number[][]> {
  return withCassette("pe.embedTexts", { texts }, () =>
    traced({ kind: "pe.embedTexts", model: "PE-Core-L14-336", provider: "baseten", conversationId }, async () => {
      const raw = await pePredict({ texts });
      const parsed = peResponseSchema.parse(raw);
      return assertNormalizedBatch(parsed.embeddings, "text");
    }),
  );
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
