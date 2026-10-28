/**
 * Day 1 smoke tests: verify every verified API fact before building on it.
 * Run: npm run smoke
 * Each check reports PASS / FAIL / SKIP (missing env or demo-pack asset).
 * Exit code is non-zero if any check FAILs (SKIPs do not fail the run).
 */
import "./load-env";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { transcribeWithMeta } from "../src/lib/ai/asr";
import { cosineSimilarity, embedImages, embedTexts } from "../src/lib/ai/embeddings";
import { generateImage } from "../src/lib/ai/image";
import { getBasetenLlmClient } from "../src/lib/ai/baseten";
import { segmentImage } from "../src/lib/ai/sam";
import { sparkJson } from "../src/lib/ai/spark";
import { cropToBox } from "../src/lib/media/crop";
import { createAdminClient, hasAdminConfig } from "../src/lib/supabase/admin";
import { getServerEnv } from "../src/lib/env";

type Status = "PASS" | "FAIL" | "SKIP";
const results: Array<{ name: string; status: Status; detail: string }> = [];

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, status: "PASS", detail: `${detail} (${Date.now() - started}ms)` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const skip = /Missing required env|not set|ENOENT|no such file/i.test(message);
    results.push({ name, status: skip ? "SKIP" : "FAIL", detail: message.split("\n")[0] });
  }
}

function skip(reason: string): never {
  throw new Error(`Missing required env/asset: ${reason}`);
}

async function firstFile(dir: string, exts: string[]): Promise<string | null> {
  try {
    const files = await readdir(dir);
    const hit = files.find((f) => exts.some((e) => f.toLowerCase().endsWith(e)));
    return hit ? path.join(dir, hit) : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const env = getServerEnv();
  const productPhoto = await firstFile(path.join("demo-pack", "products"), [".jpg", ".jpeg", ".png", ".webp"]);
  const voiceNote = await firstFile(path.join("demo-pack", "voice"), [".wav"]);

  await check("1. Spark JSON-schema call", async () => {
    if (!env.MODEL_API_KEY && env.LLM_PROVIDER === "meta") skip("MODEL_API_KEY");
    const out = await sparkJson({
      schemaName: "smoke_echo",
      jsonSchema: {
        type: "object",
        properties: { ok: { type: "boolean" }, product: { type: "string" } },
        required: ["ok", "product"],
        additionalProperties: false,
      },
      schema: z.object({ ok: z.boolean(), product: z.string() }),
      user: 'Return JSON: {"ok": true, "product": "red dress"}.',
    });
    if (!out.ok) throw new Error("Spark returned ok=false");
    return `schema-valid JSON, product="${out.product}" via ${env.LLM_PROVIDER}`;
  });

  await check("2. SAM crop saved to PNG", async () => {
    if (!env.MODEL_API_KEY) skip("MODEL_API_KEY");
    if (!productPhoto) skip("demo-pack/products/*.(jpg|png) — add a pilot product photo");
    const bytes = await readFile(productPhoto);
    const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
    // Use the catalog category phrase for this photo when available (SAM gets
    // a short English category like "hoodie", never a product name).
    let nounPhrase = "hoodie";
    try {
      const catalog = JSON.parse(await readFile(path.join("demo-pack", "products.json"), "utf8")) as Array<{
        file: string;
        categoryPhrase: string;
      }>;
      nounPhrase = catalog.find((c) => c.file === path.basename(productPhoto))?.categoryPhrase ?? nounPhrase;
    } catch {
      // products.json absent/invalid: fall back to the default phrase.
    }
    const result = await segmentImage({ imageDataUrl: dataUrl, nounPhrase });
    if (result.objects.length === 0) {
      return "SAM returned zero objects (valid empty result) — try a clearer photo/phrase";
    }
    const crop = await cropToBox(bytes, result.objects[0].box);
    await mkdir("demo-pack/out", { recursive: true });
    await writeFile(path.join("demo-pack", "out", "smoke-crop.png"), crop);
    return `${result.objects.length} object(s); crop saved to demo-pack/out/smoke-crop.png — inspect it visually`;
  });

  await check("3. WAV transcription (Muse Voice Transcribe)", async () => {
    if (!env.MODEL_API_KEY) skip("MODEL_API_KEY");
    if (!voiceNote) skip("demo-pack/voice/*.wav — add a Derja voice note");
    const text = await transcribeWithMeta({ wav: await readFile(voiceNote), keywords: ["robe", "hamra"] });
    return `transcript: "${text.slice(0, 80)}"`;
  });

  await check("4. PE image+text embeddings (self-match)", async () => {
    if (!env.peEmbedUrl) skip("PE_EMBED_URL (deploy modal/pe_embed.py or baseten/pe-embed first)");
    if (!productPhoto) skip("demo-pack/products/*.(jpg|png)");
    const bytes = await readFile(productPhoto);
    const [imgVec] = await embedImages([bytes.toString("base64")]);
    const [matchVec] = await embedTexts(["dress"]);
    const [otherVec] = await embedTexts(["leather motorcycle helmet"]);
    const simMatch = cosineSimilarity(imgVec, matchVec);
    const simOther = cosineSimilarity(imgVec, otherVec);
    if (!(simMatch > simOther)) {
      throw new Error(`self-match assertion failed: dress=${simMatch.toFixed(3)} vs helmet=${simOther.toFixed(3)}`);
    }
    return `1024-dim; cos(photo,"dress")=${simMatch.toFixed(3)} > cos(photo,"helmet")=${simOther.toFixed(3)}`;
  });

  await check("5. Muse Spark Open call with image (zod)", async () => {
    if (!env.BASETEN_API_KEY) skip("BASETEN_API_KEY");
    if (!productPhoto) skip("demo-pack/products/*.(jpg|png)");
    const bytes = await readFile(productPhoto);
    const client = getBasetenLlmClient();
    const completion = await client.chat.completions.create({
      model: env.BASETEN_SPARK_OPEN_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: 'Describe this product in JSON: {"category": string, "color": string}. JSON only.' },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${bytes.toString("base64")}` } },
          ],
        },
      ],
    });
    const parsed = z.object({ category: z.string(), color: z.string() }).parse(
      JSON.parse(completion.choices[0]?.message?.content ?? "{}"),
    );
    return `zod-valid: category="${parsed.category}", color="${parsed.color}"`;
  });

  await check("6. Muse Image generation", async () => {
    if (!env.MODEL_API_KEY) skip("MODEL_API_KEY");
    const img = await generateImage({ prompt: "Plain soft beige studio background, no objects, product photography backdrop" });
    return img.b64Json ? `b64 image (${Math.round(img.b64Json.length / 1024)}KB)` : `image url returned`;
  });

  await check("7. Supabase round trip", async () => {
    if (!hasAdminConfig()) skip("NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY");
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("merchants").select("id").limit(1);
    if (error) throw new Error(`select merchants failed (migration applied?): ${error.message}`);
    return `merchants readable (${data.length} row(s)); migration is live`;
  });

  console.log("\nWassalha smoke results");
  for (const r of results) console.log(`  [${r.status}] ${r.name} — ${r.detail}`);
  const failed = results.filter((r) => r.status === "FAIL");
  const skipped = results.filter((r) => r.status === "SKIP");
  console.log(`\n${results.length - failed.length - skipped.length} passed, ${skipped.length} skipped, ${failed.length} failed.`);
  if (skipped.length) console.log("SKIP = missing key/asset: fill .env.local and demo-pack/, then re-run. FAIL must be fixed before Day 2.");
  process.exit(failed.length ? 1 : 0);
}

void main();
