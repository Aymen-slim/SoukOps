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
import { cropWithMask } from "../src/lib/media/crop";
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
  if (!env.BASETEN_API_KEY || !env.BASETEN_PE_URL) missing.push("BASETEN_API_KEY + BASETEN_PE_URL");
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
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .insert({ name: "Demo Shop (pilot seller)" })
    .select("id")
    .single();
  if (merchantError || !merchant) throw new Error(`merchant insert failed: ${merchantError?.message}`);

  let seeded = 0;
  for (const item of catalog) {
    const photoPath = path.join("demo-pack", "products", item.file);
    const bytes = await readFile(photoPath);
    const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;

    // SAM receives the short category phrase, never the brand-like product name.
    const sam = await segmentImage({ imageDataUrl: dataUrl, nounPhrase: item.categoryPhrase });
    const crop = sam.objects[0] ? await cropWithMask(bytes, sam.objects[0]) : bytes;
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
