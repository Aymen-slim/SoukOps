/**
 * Day 1 catalog seed: demo-pack/products/* -> SAM crop -> PE embedding -> Supabase.
 * Run: npm run seed:catalog
 *
 * Product metadata comes from demo-pack/products.json:
 * [{ "file": "robe-lina.jpg", "name": "Robe Lina", "categoryPhrase": "dress",
 *    "priceMillimes": 180000, "floorMillimes": 165000, "stock": 4 }]
 * Without that file (or without keys), the script explains what is missing and exits 0.
 */
import "./load-env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { embedImages } from "../src/lib/ai/embeddings";
import { segmentImage } from "../src/lib/ai/sam";
import { cropToBox, expandBox, imageSize } from "../src/lib/media/crop";
import { createAdminClient, hasAdminConfig } from "../src/lib/supabase/admin";
import { getServerEnv } from "../src/lib/env";

const catalogSchema = z.array(
  z.object({
    file: z.string(),
    name: z.string(),
    categoryPhrase: z.string(),
    priceMillimes: z.number().int().nonnegative(),
    floorMillimes: z.number().int().nonnegative(),
    stock: z.number().int().nonnegative().default(0),
  }),
);

async function main(): Promise<void> {
  const env = getServerEnv();
  const missing: string[] = [];
  if (!env.MODEL_API_KEY) missing.push("MODEL_API_KEY");
  if (!env.peEmbedUrl) missing.push("PE_EMBED_URL (deploy modal/pe_embed.py first)");
  if (!hasAdminConfig()) missing.push("Supabase URL + SUPABASE_SECRET_KEY (and migration applied)");

  let catalog: z.infer<typeof catalogSchema> = [];
  try {
    catalog = catalogSchema.parse(JSON.parse(await readFile(path.join("demo-pack", "products.json"), "utf8")));
  } catch {
    console.log("demo-pack/products.json not found or invalid — nothing to seed.");
    console.log('Expected: [{ "file": "robe-lina.jpg", "name": "Robe Lina", "categoryPhrase": "dress", "priceMillimes": 180000, "floorMillimes": 165000, "stock": 4 }]');
    console.log("with the photos in demo-pack/products/.");
    process.exit(0);
  }
  if (catalog.length === 0) {
    console.log("demo-pack/products.json is empty — add the 20 pilot products (see demo-pack/README.md) and re-run.");
    process.exit(0);
  }
  if (missing.length) {
    console.log(`Catalog has ${catalog.length} entries, but seeding needs: ${missing.join(", ")}.`);
    console.log("Fill .env.local (and deploy baseten/pe-embed + apply the migration), then re-run: npm run seed:catalog");
    process.exit(0);
  }

  const supabase = createAdminClient();
  // Idempotent: reuse the demo merchant and replace its catalog on re-runs,
  // so fixing prices in products.json and re-seeding never duplicates data.
  const merchantName = "Demo Shop (pilot seller)";
  const { data: existing } = await supabase
    .from("merchants")
    .select("id")
    .eq("name", merchantName)
    .maybeSingle();
  let merchant = existing;
  if (!merchant) {
    const { data, error: merchantError } = await supabase
      .from("merchants")
      .insert({ name: merchantName })
      .select("id")
      .single();
    if (merchantError || !data) throw new Error(`merchant insert failed: ${merchantError?.message}`);
    merchant = data;
  } else {
    const { error: clearError } = await supabase.from("products").delete().eq("merchant_id", merchant.id);
    if (clearError) throw new Error(`catalog clear failed: ${clearError.message}`);
    console.log(`Re-seeding existing merchant ${merchant.id} (previous catalog cleared)`);
  }

  let seeded = 0;
  for (const item of catalog) {
    const photoPath = path.join("demo-pack", "products", item.file);
    const bytes = await readFile(photoPath);
    const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;

    // SAM receives the short category phrase, never the brand-like product name.
    const sam = await segmentImage({ imageDataUrl: dataUrl, nounPhrase: item.categoryPhrase });
    // Box crop keeps the model in frame (no mask cut-out), matching the buyer side.
    let crop: Buffer = bytes;
    if (sam.objects[0]) {
      const size = await imageSize(bytes);
      crop = await cropToBox(bytes, expandBox(sam.objects[0].box, size.width, size.height));
    }
    const [embedding] = await embedImages([crop.toString("base64")]);

    const cropName = `${item.file.replace(/\.[^.]+$/, "")}-crop.png`;
    const { error: uploadError } = await supabase.storage.from("crops").upload(cropName, crop, { contentType: "image/png", upsert: true });
    if (uploadError) throw new Error(`crop upload failed for ${item.file}: ${uploadError.message}`);
    await supabase.storage.from("product-media").upload(item.file, bytes, { upsert: true });

    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        merchant_id: merchant.id,
        name: item.name,
        category_phrase: item.categoryPhrase,
        price_millimes: item.priceMillimes,
        floor_millimes: item.floorMillimes,
        stock: item.stock,
      })
      .select("id")
      .single();
    if (productError || !product) throw new Error(`product insert failed for ${item.file}: ${productError?.message}`);

    const { error: imageError } = await supabase.from("product_images").insert({
      product_id: product.id,
      merchant_id: merchant.id,
      source_path: item.file,
      crop_path: cropName,
      embedding,
      is_primary: true,
    });
    if (imageError) throw new Error(`product_image insert failed for ${item.file}: ${imageError.message}`);
    seeded++;
    console.log(`seeded ${item.name} (SAM objects: ${sam.objects.length})`);
  }
  console.log(`Done: ${seeded}/${catalog.length} products cropped + embedded for merchant ${merchant.id}.`);
}

void main();
