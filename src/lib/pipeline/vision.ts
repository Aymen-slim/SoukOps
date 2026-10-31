import { createHash } from "node:crypto";
import { z } from "zod";
import { embedImages, embedTexts } from "@/lib/ai/embeddings";
import { segmentImage, segmentImageAtPoint, type SamBox } from "@/lib/ai/sam";
import { sparkJson } from "@/lib/ai/spark";
import { getServerEnv } from "@/lib/env";
import { clampBox, cropWithMask, drawNumberedBoxes, imageSize } from "@/lib/media/crop";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Day 3 — vision & matching (SPEC steps 3–4).
 *
 * Pipeline: SAM concept prompt -> mask crops on white -> PE embedding ->
 * `match_products` pgvector top-k -> Spark re-rank -> confidence gate.
 * Voice-only turns embed Spark's short English description (PE text tower)
 * into the same index. The model proposes; the gate here decides.
 */

export const GATE_PROPOSE = 0.85;
export const GATE_BUTTONS = 0.6;

export interface MatchCandidate {
  productId: string;
  productImageId: string | null;
  name: string;
  categoryPhrase: string;
  priceMillimes: number;
  floorMillimes: number;
  stock: number;
  cropPath: string | null;
  /** Original catalog photo (model still in frame), in the product-media bucket. */
  sourcePath: string | null;
  /** Cosine similarity in [-1, 1] (converted from pgvector cosine distance). */
  similarity: number;
}

/** Buyer-facing catalog photo: the original with the model, crop only as fallback. */
export function catalogPhotoPath(item: { sourcePath?: string | null; cropPath?: string | null }): string | null {
  if (item.sourcePath) return `product-media:${item.sourcePath}`;
  if (item.cropPath) return `crops:${item.cropPath}`;
  return null;
}

export type GateDecision = "propose" | "buttons" | "unmatched";

export interface MatchResult {
  decision: GateDecision;
  chosen: MatchCandidate | null;
  /** Up to 3 candidates for the buttons gate (chosen first). */
  top: MatchCandidate[];
  candidates: MatchCandidate[];
  score: number;
  scoreSource: "spark" | "vector";
  /** Nearest in-stock product when the chosen one is out of stock. */
  alternative: MatchCandidate | null;
}

/** pgvector `<=>` returns cosine distance; for normalized vectors similarity = 1 - distance. */
export function distanceToSimilarity(distance: number): number {
  return Math.max(-1, Math.min(1, 1 - distance));
}

export function gateForScore(score: number): GateDecision {
  if (score >= GATE_PROPOSE) return "propose";
  if (score >= GATE_BUTTONS) return "buttons";
  return "unmatched";
}

export function findInStockAlternative(
  candidates: MatchCandidate[],
  chosenProductId: string,
): MatchCandidate | null {
  return candidates.find((c) => c.productId !== chosenProductId && c.stock > 0) ?? null;
}

function topForButtons(candidates: MatchCandidate[], chosen: MatchCandidate): MatchCandidate[] {
  const seen = new Set<string>();
  const out: MatchCandidate[] = [];
  for (const c of [chosen, ...candidates]) {
    if (seen.has(c.productId)) continue;
    seen.add(c.productId);
    out.push(c);
    if (out.length === 3) break;
  }
  return out;
}

interface RpcRow {
  product_image_id: string;
  product_id: string;
  distance: number;
}

async function fetchCandidates(
  supabase: AdminClient,
  merchantId: string,
  embedding: number[],
  k: number,
): Promise<MatchCandidate[]> {
  const { data, error } = await supabase.rpc("match_products", {
    p_merchant: merchantId,
    p_embedding: embedding,
    p_k: k,
  });
  if (error) throw new Error(`match_products failed: ${error.message}`);
  const rows = (data ?? []) as RpcRow[];
  if (rows.length === 0) return [];

  const productIds = [...new Set(rows.map((r) => r.product_id))];
  const imageIds = rows.map((r) => r.product_image_id);
  const [{ data: products }, { data: images }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, category_phrase, price_millimes, floor_millimes, stock")
      .in("id", productIds),
    supabase.from("product_images").select("id, crop_path, source_path").in("id", imageIds),
  ]);
  const productById = new Map((products ?? []).map((p) => [p.id as string, p]));
  const photoByImageId = new Map(
    (images ?? []).map((i) => [
      i.id as string,
      { cropPath: i.crop_path as string | null, sourcePath: i.source_path as string | null },
    ]),
  );

  const byProduct = new Map<string, MatchCandidate>();
  for (const row of rows) {
    const product = productById.get(row.product_id);
    if (!product) continue;
    const candidate: MatchCandidate = {
      productId: row.product_id,
      productImageId: row.product_image_id,
      name: product.name as string,
      categoryPhrase: product.category_phrase as string,
      priceMillimes: product.price_millimes as number,
      floorMillimes: product.floor_millimes as number,
      stock: product.stock as number,
      cropPath: photoByImageId.get(row.product_image_id)?.cropPath ?? null,
      sourcePath: photoByImageId.get(row.product_image_id)?.sourcePath ?? null,
      similarity: distanceToSimilarity(row.distance),
    };
    const existing = byProduct.get(candidate.productId);
    if (!existing || candidate.similarity > existing.similarity) byProduct.set(candidate.productId, candidate);
  }
  return [...byProduct.values()].sort((a, b) => b.similarity - a.similarity);
}

const rerankSchema = z.object({
  bestProductId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const rerankJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["bestProductId", "confidence", "reason"],
  properties: {
    bestProductId: { type: ["string", "null"] },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
};

async function downloadCropDataUrls(
  supabase: AdminClient,
  candidates: MatchCandidate[],
  limit: number,
): Promise<string[]> {
  const urls: string[] = [];
  for (const candidate of candidates.slice(0, limit)) {
    if (!candidate.cropPath || urls.length >= limit) continue;
    const { data } = await supabase.storage.from("crops").download(candidate.cropPath);
    if (data) {
      const bytes = Buffer.from(await data.arrayBuffer());
      urls.push(`data:image/png;base64,${bytes.toString("base64")}`);
    }
  }
  return urls;
}

/**
 * Spark re-rank over the vector top-5. Returns null on any failure (transport,
 * validation, unknown id) so the caller falls back to the vector order —
 * the model proposes, this module decides.
 */
async function rerankWithSpark(req: {
  supabase: AdminClient;
  candidates: MatchCandidate[];
  cropPng?: Buffer;
  descriptionEn?: string | null;
  conversationId?: string;
}): Promise<{ candidate: MatchCandidate; confidence: number } | null> {
  const top = req.candidates.slice(0, 5);
  if (top.length === 0) return null;
  try {
    const images: string[] = [];
    if (req.cropPng) {
      images.push(`data:image/png;base64,${req.cropPng.toString("base64")}`);
    } else {
      // Voice-only: Spark compares the description against the real catalog crops.
      images.push(...(await downloadCropDataUrls(req.supabase, top, 5)));
    }
    const listing = top
      .map(
        (c, i) =>
          `${i + 1}. productId=${c.productId} name="${c.name}" category="${c.categoryPhrase}" vectorSimilarity=${c.similarity.toFixed(3)}`,
      )
      .join("\n");
    const result = await sparkJson({
      schema: rerankSchema,
      jsonSchema: rerankJsonSchema,
      schemaName: "match_rerank",
      system:
        "You re-rank catalog matches for a clothing seller. The first attached image (if any) is the buyer's garment crop on a white background; following images (if any) are catalog crops in candidate order. Pick the product that is visually the same garment (type, color, print). Return its productId exactly as listed, a confidence from 0 to 1, and a one-line reason. If none matches, return bestProductId null with low confidence. Never invent a productId.",
      user: [
        req.descriptionEn ? `Buyer description: ${req.descriptionEn}` : "Buyer sent a garment photo (first image).",
        "Candidates:",
        listing,
      ].join("\n"),
      images,
      conversationId: req.conversationId,
    });
    if (!result.bestProductId) return null;
    const candidate = top.find((c) => c.productId === result.bestProductId);
    if (!candidate) return null;
    return { candidate, confidence: result.confidence };
  } catch {
    return null;
  }
}

const rankAllSchema = z.object({
  rankedProductIds: z.array(z.string()).max(3),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const rankAllJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["rankedProductIds", "confidence", "reason"],
  properties: {
    rankedProductIds: { type: "array", items: { type: "string" }, maxItems: 3 },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
};

/** MATCHER=all fallback: Spark ranks the whole catalog (no vector search). */
async function matchAllCatalog(req: {
  supabase: AdminClient;
  merchantId: string;
  cropPng?: Buffer;
  descriptionEn?: string | null;
  conversationId?: string;
}): Promise<MatchResult> {
  const { data: products } = await req.supabase
    .from("products")
    .select("id, name, category_phrase, price_millimes, floor_millimes, stock")
    .eq("merchant_id", req.merchantId)
    .eq("active", true)
    .limit(50);
  const catalog = (products ?? []).map((p) => ({
    productId: p.id as string,
    productImageId: null,
    name: p.name as string,
    categoryPhrase: p.category_phrase as string,
    priceMillimes: p.price_millimes as number,
    floorMillimes: p.floor_millimes as number,
    stock: p.stock as number,
    cropPath: null,
    sourcePath: null,
    similarity: 0,
  })) as MatchCandidate[];
  if (catalog.length === 0) {
    return { decision: "unmatched", chosen: null, top: [], candidates: [], score: 0, scoreSource: "vector", alternative: null };
  }
  const { data: images } = await req.supabase
    .from("product_images")
    .select("product_id, crop_path, source_path")
    .eq("merchant_id", req.merchantId)
    .eq("is_primary", true);
  const photoByProduct = new Map(
    (images ?? []).map((i) => [
      i.product_id as string,
      { cropPath: i.crop_path as string | null, sourcePath: i.source_path as string | null },
    ]),
  );
  for (const c of catalog) {
    const photo = photoByProduct.get(c.productId);
    c.cropPath = photo?.cropPath ?? null;
    c.sourcePath = photo?.sourcePath ?? null;
  }

  const listing = catalog
    .map((c, i) => `${i + 1}. productId=${c.productId} name="${c.name}" category="${c.categoryPhrase}"`)
    .join("\n");
  const result = await sparkJson({
    schema: rankAllSchema,
    jsonSchema: rankAllJsonSchema,
    schemaName: "match_rank_all",
    system:
      "You match a buyer's garment to a clothing catalog. The attached image (if any) is the buyer's garment crop. Return up to 3 productIds from the list, best first, a confidence from 0 to 1 for the best one, and a one-line reason. Never invent a productId.",
    user: [
      req.descriptionEn ? `Buyer description: ${req.descriptionEn}` : "Buyer sent a garment photo (attached).",
      "Catalog:",
      listing,
    ].join("\n"),
    images: req.cropPng ? [`data:image/png;base64,${req.cropPng.toString("base64")}`] : [],
    conversationId: req.conversationId,
  });
  const byId = new Map(catalog.map((c) => [c.productId, c]));
  const ranked = result.rankedProductIds
    .map((id) => byId.get(id))
    .filter((c): c is MatchCandidate => Boolean(c));
  const chosen = ranked[0] ?? null;
  const score = chosen ? result.confidence : 0;
  const decision = gateForScore(score);
  return {
    decision,
    chosen,
    top: chosen ? topForButtons(ranked.length ? ranked : catalog, chosen) : [],
    candidates: catalog,
    score,
    scoreSource: "spark",
    alternative: chosen ? findInStockAlternative(ranked.length ? ranked : catalog, chosen.productId) : null,
  };
}

/**
 * Core matcher: embedding -> pgvector top-k -> Spark re-rank -> gate.
 * With MATCHER=all, Spark ranks the whole catalog instead.
 */
export async function matchProduct(req: {
  supabase: AdminClient;
  merchantId: string;
  embedding: number[];
  cropPng?: Buffer;
  descriptionEn?: string | null;
  conversationId?: string;
}): Promise<MatchResult> {
  if (getServerEnv().MATCHER === "all") {
    return matchAllCatalog(req);
  }
  const candidates = await fetchCandidates(req.supabase, req.merchantId, req.embedding, 10);
  if (candidates.length === 0) {
    return { decision: "unmatched", chosen: null, top: [], candidates: [], score: 0, scoreSource: "vector", alternative: null };
  }
  const rerank = await rerankWithSpark({
    supabase: req.supabase,
    candidates,
    cropPng: req.cropPng,
    descriptionEn: req.descriptionEn,
    conversationId: req.conversationId,
  });
  const chosen = rerank?.candidate ?? candidates[0];
  const score = rerank?.confidence ?? chosen.similarity;
  const decision = gateForScore(score);
  return {
    decision,
    chosen,
    top: topForButtons(candidates, chosen),
    candidates,
    score,
    scoreSource: rerank ? "spark" : "vector",
    alternative: chosen && chosen.stock <= 0 ? findInStockAlternative(candidates, chosen.productId) : null,
  };
}

/** Voice-only path: PE text embedding of the English description, same index. */
export async function matchByDescription(req: {
  supabase: AdminClient;
  merchantId: string;
  descriptionEn: string;
  conversationId?: string;
}): Promise<{ match: MatchResult; embedding: number[] }> {
  const [embedding] = await embedTexts([req.descriptionEn], req.conversationId);
  const match = await matchProduct({
    supabase: req.supabase,
    merchantId: req.merchantId,
    embedding,
    descriptionEn: req.descriptionEn,
    conversationId: req.conversationId,
  });
  return { match, embedding };
}

// ---------------------------------------------------------- disambiguation

export interface CropOption {
  index: number;
  objectId: string;
  box: SamBox;
  samConfidence?: number;
  cropPng: Buffer;
  embedding: number[];
  best: MatchCandidate | null;
  bestSimilarity: number;
}

export type ScreenshotOutcome =
  | { status: "matched"; option: CropOption; match: MatchResult }
  | { status: "needs_choice"; options: CropOption[]; overlayPng: Buffer }
  | { status: "no_garment"; objects: number }
  | { status: "unmatched"; option: CropOption | null; match: MatchResult; embedding: number[] | null };

const COLOR_SYNONYMS: Array<{ words: string[]; catalogWords: string[] }> = [
  { words: ["jaune", "yellow", "asfar", "اصفر", "أصفر"], catalogWords: ["jaune", "yellow"] },
  { words: ["rose", "pink", "wardi", "وردي"], catalogWords: ["rose", "pink"] },
  { words: ["noir", "black", "aswad", "akhal", "اسود", "أسود", "اكحل"], catalogWords: ["noir", "black"] },
  { words: ["bleu", "blue", "azra9", "ازرق", "أزرق"], catalogWords: ["bleu", "blue"] },
  { words: ["vert", "green", "a5dar", "akhdar", "اخضر", "أخضر"], catalogWords: ["vert", "green"] },
  { words: ["blanc", "white", "abyad", "ابيض", "أبيض"], catalogWords: ["blanc", "white"] },
  { words: ["rouge", "red", "a7mar", "ahmar", "احمر", "أحمر"], catalogWords: ["rouge", "red"] },
  { words: ["beige", "بيج"], catalogWords: ["beige"] },
];

function containsWord(text: string, word: string): boolean {
  if (/^[a-z0-9]+$/.test(word)) return new RegExp(`\\b${word}\\b`).test(text);
  return text.includes(word);
}

function centerX(box: SamBox): number {
  return (box.left + box.right) / 2;
}

/**
 * Ladder step (b): resolve the buyer's words (spatial hint, free text, color)
 * to exactly one crop. Returns the option index or null when ambiguous.
 */
export function pickByHint(
  options: Array<{ box: SamBox; best: MatchCandidate | null }>,
  hintText: string,
): number | null {
  if (options.length === 0) return null;
  if (options.length === 1) return 0;
  const text = ` ${hintText.toLowerCase()} `;

  // Color: exactly one crop whose best catalog match carries that color.
  for (const color of COLOR_SYNONYMS) {
    if (!color.words.some((w) => containsWord(text, w))) continue;
    const hits = options
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => {
        const name = (o.best?.name ?? "").toLowerCase();
        return color.catalogWords.some((w) => name.includes(w));
      });
    if (hits.length === 1) return hits[0].i;
  }

  // Product name / category tokens mentioned by buyer.
  const nameHits = options
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => {
      const tokens = `${o.best?.name ?? ""} ${o.best?.categoryPhrase ?? ""}`
        .toLowerCase()
        .split(/[^a-z0-9àâçéèêëîïôûùüÿñæœ]+/)
        .filter((t) => t.length >= 4);
      return tokens.some((t) => containsWord(text, t));
    });
  if (nameHits.length === 1) return nameHits[0].i;

  const byCenter = options.map((o, i) => ({ i, cx: centerX(o.box) })).sort((a, b) => a.cx - b.cx);
  if (["left", "gauche", "yasar", "يسار", "شمال"].some((w) => containsWord(text, w))) {
    return byCenter[0].i;
  }
  if (["right", "droite", "ymin", "yamin", "يمين"].some((w) => containsWord(text, w))) {
    return byCenter[byCenter.length - 1].i;
  }
  if (["middle", "center", "centre", "milieu", "west", "noss", "وسط", "النص"].some((w) => containsWord(text, w))) {
    return byCenter[Math.floor(byCenter.length / 2)].i;
  }
  return null;
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (ch) => {
    const a = ARABIC_INDIC.indexOf(ch);
    if (a >= 0) return String(a);
    const b = EXTENDED_ARABIC_INDIC.indexOf(ch);
    return b >= 0 ? String(b) : ch;
  });
}

const WORD_NUMBERS: Record<string, number> = {
  premier: 1,
  "première": 1,
  first: 1,
  awel: 1,
  "الأول": 1,
  deuxieme: 2,
  "deuxième": 2,
  second: 2,
  "الثاني": 2,
  troisieme: 3,
  "troisième": 3,
  third: 3,
  "الثالث": 3,
};

/** Parses a buyer's crop/product choice ("1", "produit 2", "2 · Sweat…"). */
export function parseChoice(text: string, optionCount: number): number | null {
  const normalized = normalizeDigits(text.toLowerCase());
  const numeric =
    normalized.match(/^\s*(\d{1,2})\b/) ??
    normalized.match(/(?:produit|ra9m|numero|numéro|n°|#)\s*(\d{1,2})/);
  let value: number | null = numeric ? Number(numeric[1]) : null;
  if (value === null) {
    for (const [word, n] of Object.entries(WORD_NUMBERS)) {
      if (normalized.includes(word)) {
        value = n;
        break;
      }
    }
  }
  if (value === null || value < 1 || value > optionCount) return null;
  return value - 1;
}

/**
 * Screenshot resolution: SAM -> crops -> per-crop catalog probe -> ladder.
 * (a) only one crop matches the catalog, (b) buyer's words pick one,
 * (c) otherwise numbered options for reply buttons, (d) point prompt on tap
 * (see resolvePointSelection).
 */
export async function resolveScreenshot(req: {
  supabase: AdminClient;
  merchantId: string;
  image: Buffer;
  mime: string;
  samNounPhrase: string;
  spatialHint?: string | null;
  buyerText?: string;
  color?: string | null;
  conversationId?: string;
}): Promise<ScreenshotOutcome> {
  const dataUrl = `data:${req.mime};base64,${req.image.toString("base64")}`;
  let sam = await segmentImage({
    imageDataUrl: dataUrl,
    nounPhrase: req.samNounPhrase,
    conversationId: req.conversationId,
  });
  if (sam.objects.length === 0 && req.samNounPhrase.toLowerCase() !== "clothing") {
    sam = await segmentImage({
      imageDataUrl: dataUrl,
      nounPhrase: "clothing",
      conversationId: req.conversationId,
    });
  }

  const size = await imageSize(req.image);
  const clamped = sam.objects
    .map((object) => ({ object, box: clampBox(object.box, size.width, size.height) }))
    .filter((entry): entry is { object: (typeof sam.objects)[number]; box: SamBox } => entry.box !== null)
    .slice(0, 6)
    .sort((a, b) => centerX(a.box) - centerX(b.box)); // stable left-to-right numbering

  const options: CropOption[] = [];
  for (const { object, box } of clamped) {
    try {
      const cropPng = await cropWithMask(req.image, { ...object, box });
      options.push({
        index: options.length,
        objectId: object.objectId,
        box,
        samConfidence: object.confidence,
        cropPng,
        embedding: [],
        best: null,
        bestSimilarity: 0,
      });
    } catch {
      // A single bad mask must not kill the turn; the other crops still count.
    }
  }

  // Fallback when SAM finds no mask: embed the full image directly so clean
  // catalog/product photos still match instead of returning no_garment.
  if (options.length === 0) {
    try {
      const [fullEmbedding] = await embedImages([req.image.toString("base64")], req.conversationId);
      if (fullEmbedding && fullEmbedding.length > 0) {
        const match = await matchProduct({
          supabase: req.supabase,
          merchantId: req.merchantId,
          embedding: fullEmbedding,
          cropPng: req.image,
          conversationId: req.conversationId,
        });
        const fullOption: CropOption = {
          index: 0,
          objectId: "full",
          box: { left: 0, top: 0, right: size.width, bottom: size.height },
          cropPng: req.image,
          embedding: fullEmbedding,
          best: match.chosen,
          bestSimilarity: match.score,
        };
        if (match.decision !== "unmatched") {
          return { status: "matched", option: fullOption, match };
        }
        return { status: "unmatched", option: fullOption, match, embedding: fullEmbedding };
      }
    } catch {
      // Fall through to no_garment if direct embedding also fails.
    }
    return { status: "no_garment", objects: sam.objects.length };
  }

  const embeddings = await embedImages(
    options.map((o) => o.cropPng.toString("base64")),
    req.conversationId,
  );
  for (let i = 0; i < options.length; i++) {
    options[i].embedding = embeddings[i] ?? [];
    const candidates = await fetchCandidates(req.supabase, req.merchantId, options[i].embedding, 5);
    options[i].best = candidates[0] ?? null;
    options[i].bestSimilarity = candidates[0]?.similarity ?? 0;
  }

  const finishWith = async (option: CropOption): Promise<ScreenshotOutcome> => {
    const match = await matchProduct({
      supabase: req.supabase,
      merchantId: req.merchantId,
      embedding: option.embedding,
      cropPng: option.cropPng,
      conversationId: req.conversationId,
    });
    if (match.decision === "unmatched") {
      return { status: "unmatched", option, match, embedding: option.embedding };
    }
    return { status: "matched", option, match };
  };

  // (a) Exactly one crop matches the catalog.
  const matching = options.filter((o) => o.bestSimilarity >= GATE_BUTTONS);
  if (matching.length === 1) return finishWith(matching[0]);

  // (b) The buyer's words pick one crop.
  const hintText = [req.spatialHint ?? "", req.buyerText ?? "", req.color ?? ""].join(" ");
  const hinted = pickByHint(options, hintText);
  if (hinted !== null && options.length > 1) return finishWith(options[hinted]);

  // If multiple crops matched the catalog, but they all resolve to the SAME
  // catalog product (e.g. SAM segmented two overlapping boxes on one garment),
  // pick the highest-similarity crop instead of asking the buyer to disambiguate
  // identical items.
  const distinctMatchedProductIds = new Set(matching.map((o) => o.best?.productId).filter(Boolean));
  if (matching.length > 1 && distinctMatchedProductIds.size === 1) {
    const bestCrop = [...matching].sort((a, b) => b.bestSimilarity - a.bestSimilarity)[0];
    return finishWith(bestCrop);
  }

  // Single crop that simply did not probe well: full match decides.
  if (options.length === 1) return finishWith(options[0]);

  // (c) Numbered crops as reply buttons (max 3, WhatsApp limit).
  const topOptions = options.slice(0, 3);
  topOptions.forEach((o, i) => {
    o.index = i;
  });
  const overlayPng = await drawNumberedBoxes(
    req.image,
    topOptions.map((o) => o.box),
  );
  return { status: "needs_choice", options: topOptions, overlayPng };
}

/**
 * Ladder step (d): the buyer tapped/chose a numbered crop — re-segment that
 * garment with a SAM point prompt at the box centre, then match it. Returns
 * null when the point prompt finds nothing (caller falls back to the stored
 * concept-prompt crop).
 */
export async function resolvePointSelection(req: {
  supabase: AdminClient;
  merchantId: string;
  image: Buffer;
  mime: string;
  box: SamBox;
  conversationId?: string;
}): Promise<{ match: MatchResult; cropPng: Buffer } | null> {
  const size = await imageSize(req.image);
  const dataUrl = `data:${req.mime};base64,${req.image.toString("base64")}`;
  const sam = await segmentImageAtPoint({
    imageDataUrl: dataUrl,
    imageWidth: size.width,
    imageHeight: size.height,
    point: { x: centerX(req.box), y: (req.box.top + req.box.bottom) / 2 },
    box: req.box,
    conversationId: req.conversationId,
  });
  const object = sam.objects[0];
  if (!object) return null;
  const cropPng = await cropWithMask(req.image, object);
  const [embedding] = await embedImages([cropPng.toString("base64")], req.conversationId);
  const match = await matchProduct({
    supabase: req.supabase,
    merchantId: req.merchantId,
    embedding,
    cropPng,
    conversationId: req.conversationId,
  });
  return { match, cropPng };
}

/** Uploads a PNG buffer and returns its storage path (deterministic name). */
export async function uploadPng(
  supabase: AdminClient,
  bucket: "buyer-media" | "crops",
  prefix: string,
  buffer: Buffer,
): Promise<string> {
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const path = `${prefix}/${hash}.png`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`upload to ${bucket} failed: ${error.message}`);
  return path;
}
