import { getServerEnv, resolveImageProviderName } from "@/lib/env";
import { withCassette } from "./cassette";
import { getMetaClient } from "./meta";
import { geminiGenerateImage } from "./providers/gemini";
import { openaiGenerateImage } from "./providers/openai";
import { traced } from "./trace";

/**
 * Image generation routed via `IMAGE_PROVIDER` (`openai` gpt-image-2.6, `gemini`
 * Nano Banana 2.1, or `meta` muse-image-1.0). For product/service overlays,
 * generate backgrounds/cards only and composite real photos with sharp.
 */
export async function generateImage(req: {
  prompt: string;
  conversationId?: string;
}): Promise<{ b64Json?: string; url?: string }> {
  const env = getServerEnv();
  const provider = resolveImageProviderName(env);

  if (provider === "openai") {
    const model = env.OPENAI_IMAGE_MODEL;
    return withCassette("image.generate", { provider, model, prompt: req.prompt }, () =>
      traced({ kind: "image.generate", model, provider: "openai", conversationId: req.conversationId }, () =>
        openaiGenerateImage({ model, prompt: req.prompt }),
      ),
    );
  }

  if (provider === "gemini") {
    const model = env.GEMINI_IMAGE_MODEL;
    return withCassette("image.generate", { provider, model, prompt: req.prompt }, () =>
      traced({ kind: "image.generate", model, provider: "gemini", conversationId: req.conversationId }, () =>
        geminiGenerateImage({ model, prompt: req.prompt }),
      ),
    );
  }

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
