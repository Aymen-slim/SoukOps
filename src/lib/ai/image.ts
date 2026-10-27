import { getServerEnv } from "@/lib/env";
import { withCassette } from "./cassette";
import { getMetaClient } from "./meta";
import { traced } from "./trace";

/**
 * Muse Image generation. P2 only (out-of-stock poster): generate the background
 * only and composite the real SAM crop on top with sharp — never let the image
 * model redraw the product.
 */
export async function generateImage(req: { prompt: string; conversationId?: string }): Promise<{ b64Json?: string; url?: string }> {
  const env = getServerEnv();
  const model = env.IMAGE_MODEL;
  return withCassette("image.generate", { model, prompt: req.prompt }, () =>
    traced({ kind: "image.generate", model, provider: "meta", conversationId: req.conversationId }, async () => {
      const client = getMetaClient();
      const result = await client.images.generate({ model, prompt: req.prompt, n: 1 });
      const first = result.data?.[0];
      if (!first?.b64_json && !first?.url) throw new Error("Muse Image returned no image data");
      return { b64Json: first.b64_json, url: first.url };
    }),
  );
}
