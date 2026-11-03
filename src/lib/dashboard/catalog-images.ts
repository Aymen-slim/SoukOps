import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { embedImages } from "@/lib/ai/embeddings";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

const SIGNED_URL_TTL_SECONDS = 3600;
const SIGNED_URL_CACHE_MS = 15 * 60 * 1000;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

function getCachedSignedUrl(bucket: string, path: string): string | null {
  const hit = signedUrlCache.get(`${bucket}:${path}`);
  if (hit && hit.expiresAt > Date.now()) return hit.url;
  return null;
}

function setCachedSignedUrl(bucket: string, path: string, url: string): void {
  signedUrlCache.set(`${bucket}:${path}`, { url, expiresAt: Date.now() + SIGNED_URL_CACHE_MS });
}

export function decodeImage(input: string): Buffer {
  const match = input.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
  return Buffer.from(match ? match[1] : input, "base64");
}

/** Uploads one catalog photo, embeds the crop, and stores the row. */
export async function saveCatalogImage(args: {
  supabase: Admin;
  merchantId: string;
  productId: string;
  original: Buffer;
  crop: Buffer;
  primary: boolean;
}): Promise<void> {
  await saveCatalogImagesBatch({
    supabase: args.supabase,
    merchantId: args.merchantId,
    productId: args.productId,
    items: [{ original: args.original, crop: args.crop, primary: args.primary }],
  });
}

/**
 * Batches embeddings into a single PE call, encodes images and uploads to
 * Supabase Storage in parallel, and inserts all product_images rows in one query.
 */
export async function saveCatalogImagesBatch(args: {
  supabase: Admin;
  merchantId: string;
  productId: string;
  items: Array<{ original: Buffer; crop: Buffer; primary?: boolean }>;
}): Promise<{ primaryImageUrl: string | null }> {
  if (args.items.length === 0) return { primaryImageUrl: null };

  const [vectors, encoded] = await Promise.all([
    embedImages(args.items.map((item) => item.crop.toString("base64"))),
    Promise.all(
      args.items.map(async (item, index) => {
        const id = randomUUID();
        const cropPath = `catalog/${id}.png`;
        const sourcePath = `catalog/${id}-source.jpg`;
        const [sourceJpeg, cropPng] = await Promise.all([
          sharp(item.original)
            .rotate()
            .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer(),
          sharp(item.crop).png({ compressionLevel: 8 }).toBuffer(),
        ]);
        return {
          index,
          cropPath,
          sourcePath,
          sourceJpeg,
          cropPng,
          primary: item.primary ?? index === 0,
        };
      }),
    ),
  ]);

  if (vectors.length !== args.items.length || vectors.some((v) => !v)) {
    throw new Error("Embedding vide.");
  }

  await Promise.all(
    encoded.flatMap((entry) => [
      args.supabase.storage
        .from("crops")
        .upload(entry.cropPath, entry.cropPng, { contentType: "image/png", upsert: false })
        .then(({ error }) => {
          if (error) throw new Error(error.message);
        }),
      args.supabase.storage
        .from("product-media")
        .upload(entry.sourcePath, entry.sourceJpeg, { contentType: "image/jpeg", upsert: false })
        .then(({ error }) => {
          if (error) throw new Error(error.message);
        }),
    ]),
  );

  const rows = encoded.map((entry, idx) => ({
    product_id: args.productId,
    merchant_id: args.merchantId,
    source_path: entry.sourcePath,
    crop_path: entry.cropPath,
    embedding: vectors[idx]!,
    is_primary: entry.primary,
  }));

  const { error: imageError } = await args.supabase.from("product_images").insert(rows);
  if (imageError) throw new Error(imageError.message);

  const primaryEntry = encoded.find((e) => e.primary) ?? encoded[0];
  const primaryImageUrl = primaryEntry
    ? await signProductPhoto(args.supabase, primaryEntry.sourcePath, primaryEntry.cropPath)
    : null;

  return { primaryImageUrl };
}

export async function signProductPhoto(
  supabase: Admin,
  sourcePath: string | null,
  cropPath: string | null,
): Promise<string | null> {
  if (sourcePath) {
    const cached = getCachedSignedUrl("product-media", sourcePath);
    if (cached) return cached;
    const { data } = await supabase.storage.from("product-media").createSignedUrl(sourcePath, SIGNED_URL_TTL_SECONDS);
    if (data?.signedUrl) {
      setCachedSignedUrl("product-media", sourcePath, data.signedUrl);
      return data.signedUrl;
    }
  }
  if (cropPath) {
    const cached = getCachedSignedUrl("crops", cropPath);
    if (cached) return cached;
    const { data } = await supabase.storage.from("crops").createSignedUrl(cropPath, SIGNED_URL_TTL_SECONDS);
    if (data?.signedUrl) {
      setCachedSignedUrl("crops", cropPath, data.signedUrl);
      return data.signedUrl;
    }
  }
  return null;
}

/**
 * Signs an entire catalog's product photos in at most 1–2 batched Storage calls
 * (and 0 calls when warm in the 15-minute server signed-URL cache).
 */
export async function signProductPhotosBatch(
  supabase: Admin,
  items: Array<{ key: string; sourcePath: string | null; cropPath: string | null }>,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (items.length === 0) return result;

  const missingSources = new Set<string>();
  const missingCrops = new Set<string>();

  for (const item of items) {
    if (item.sourcePath) {
      const hit = getCachedSignedUrl("product-media", item.sourcePath);
      if (hit) {
        result.set(item.key, hit);
        continue;
      }
      missingSources.add(item.sourcePath);
    } else if (item.cropPath) {
      const hit = getCachedSignedUrl("crops", item.cropPath);
      if (hit) {
        result.set(item.key, hit);
        continue;
      }
      missingCrops.add(item.cropPath);
    } else {
      result.set(item.key, null);
    }
  }

  const [signedSources, signedCrops] = await Promise.all([
    missingSources.size > 0
      ? supabase.storage.from("product-media").createSignedUrls([...missingSources], SIGNED_URL_TTL_SECONDS)
      : Promise.resolve({ data: null }),
    missingCrops.size > 0
      ? supabase.storage.from("crops").createSignedUrls([...missingCrops], SIGNED_URL_TTL_SECONDS)
      : Promise.resolve({ data: null }),
  ]);

  const sourceMap = new Map<string, string>();
  for (const row of signedSources.data ?? []) {
    if (row.path && row.signedUrl) {
      sourceMap.set(row.path, row.signedUrl);
      setCachedSignedUrl("product-media", row.path, row.signedUrl);
    }
  }

  const cropMap = new Map<string, string>();
  for (const row of signedCrops.data ?? []) {
    if (row.path && row.signedUrl) {
      cropMap.set(row.path, row.signedUrl);
      setCachedSignedUrl("crops", row.path, row.signedUrl);
    }
  }

  // Fallback for items whose source_path wasn't found in product-media but have crop_path
  const fallbackCropPaths = new Set<string>();
  for (const item of items) {
    if (result.has(item.key)) continue;
    if (item.sourcePath && sourceMap.has(item.sourcePath)) {
      result.set(item.key, sourceMap.get(item.sourcePath)!);
    } else if (item.cropPath) {
      const cachedCrop = getCachedSignedUrl("crops", item.cropPath) ?? cropMap.get(item.cropPath);
      if (cachedCrop) {
        result.set(item.key, cachedCrop);
      } else {
        fallbackCropPaths.add(item.cropPath);
      }
    } else {
      result.set(item.key, null);
    }
  }

  if (fallbackCropPaths.size > 0) {
    const { data: extraCrops } = await supabase.storage
      .from("crops")
      .createSignedUrls([...fallbackCropPaths], SIGNED_URL_TTL_SECONDS);
    const extraMap = new Map<string, string>();
    for (const row of extraCrops ?? []) {
      if (row.path && row.signedUrl) {
        extraMap.set(row.path, row.signedUrl);
        setCachedSignedUrl("crops", row.path, row.signedUrl);
      }
    }
    for (const item of items) {
      if (!result.has(item.key)) {
        result.set(item.key, (item.cropPath ? extraMap.get(item.cropPath) : null) ?? null);
      }
    }
  }

  return result;
}
