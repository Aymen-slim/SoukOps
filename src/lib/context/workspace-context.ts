import { randomUUID } from "node:crypto";
import { formatCalendarScheduleBlock, listUpcomingBusyEvents } from "@/lib/calendar/calendar-store";
import { formatMillimesForChat } from "@/lib/domain/pricing";
import type { ProProfileRow, ProServiceRow } from "@/lib/pro/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export const CONTEXT_CATEGORIES = [
  "general",
  "policy",
  "hours",
  "pricing_note",
  "promo",
  "faq",
  "location",
  "availability",
  "style",
] as const;

export type ContextCategory = (typeof CONTEXT_CATEGORIES)[number];

export interface WorkspaceContextEntry {
  id: string;
  merchant_id: string;
  category: ContextCategory;
  content: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function isContextCategory(value: unknown): value is ContextCategory {
  return typeof value === "string" && (CONTEXT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Deterministic keyword-based categorization for owner context notes (0 LLM calls).
 */
export function inferContextCategory(content: string): ContextCategory {
  const lower = content.toLowerCase();
  if (
    /\b(?:open|closed|horaire|heures|ouverture|ferm[eé]|dimanche|vendredi|samedi|lundi|mardi|mercredi|jeudi|sunday|friday|saturday|mahloul|msaker|wa9t|9h|10h|17h|18h|19h|20h)\b|ساعات|مفتوح|مسكر|الجمعة|الأحد/i.test(
      lower,
    )
  ) {
    return "hours";
  }
  if (
    /\b(?:booked|disponib|dispo|agenda|cong[eé]|vacances|absent|complet|indisponible|travel|déplacement)\b|محجوز|إجازة|متفرغ|مسافر/i.test(
      lower,
    )
  ) {
    return "availability";
  }
  if (
    /\b(?:promo|promotion|r[eé]duction|remise|soldes|offre\s+sp[eé]ciale|offert|free\s+delivery|livraison\s+gratuite|discount|code\s+promo)\b|تخفيض|عرض|برومو|مجاني/i.test(
      lower,
    )
  ) {
    return "promo";
  }
  if (
    /\b(?:livraison|delivery|retour|[eé]change|exchange|refund|remboursement|paiement|payment|cnam|flouci|konnect|cash|esp[eè]ces|carte\s+bancaire|garantie|d[eé]lai|24h|48h|72h)\b|توصيل|تبديل|استرجاع|دفع|ضمان/i.test(
      lower,
    )
  ) {
    return "policy";
  }
  if (
    /\b(?:adresse|address|parking|[eé]tage|immeuble|showroom|boutique\s+physique|cabinet|studio|point\s+de\s+vente|localisation|maps)\b|عنوان|موقف|محل|عيادة/i.test(
      lower,
    )
  ) {
    return "location";
  }
  if (
    /\b(?:tarif|prix|price|acompte|avance|deposit|devis|budget|gifted|gratuit|floor|minimum)\b|سعر|عربون|تسبيق/i.test(
      lower,
    )
  ) {
    return "pricing_note";
  }
  if (
    /\b(?:tone|style|saluer|greet|toujours\s+dire|always\s+say|never\s+say|ne\s+jamais|tutoyer|vouvoyer|emoji)\b|لهجة|أسلوب/i.test(
      lower,
    )
  ) {
    return "style";
  }
  if (
    /https?:\/\/|www\.|\b(?:showreel|portfolio|instagram|youtube|tiktok|media\s+kit|faq|lien|link)\b|رابط/i.test(
      lower,
    )
  ) {
    return "faq";
  }
  return "general";
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("workspace_context_entries") &&
    (msg.includes("does not exist") || msg.includes("could not find the table") || msg.includes("schema cache"))
  );
}

const CACHE_NAMESPACE = "workspace_context";
function cacheKey(merchantId: string): string {
  return `${CACHE_NAMESPACE}:${merchantId}`;
}

function mapContextRow(row: Record<string, unknown>, merchantId: string): WorkspaceContextEntry {
  return {
    id: String(row.id ?? randomUUID()),
    merchant_id: String(row.merchant_id ?? merchantId),
    category: isContextCategory(row.category) ? row.category : "general",
    content: String(row.content ?? "").trim(),
    active: typeof row.active === "boolean" ? row.active : true,
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  };
}

async function readCacheEntries(supabase: AdminClient, merchantId: string): Promise<WorkspaceContextEntry[]> {
  try {
    const { data, error } = await supabase
      .from("ai_cache")
      .select("value")
      .eq("key", cacheKey(merchantId))
      .maybeSingle();
    if (error || !data) return [];
    const val = (data as { value?: unknown }).value as { entries?: unknown } | null;
    if (!val || !Array.isArray(val.entries)) return [];
    return val.entries
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => mapContextRow(item, merchantId))
      .filter((entry) => entry.content.length > 0);
  } catch {
    return [];
  }
}

async function writeCacheEntries(
  supabase: AdminClient,
  merchantId: string,
  entries: WorkspaceContextEntry[],
): Promise<void> {
  const { error } = await supabase.from("ai_cache").upsert(
    {
      key: cacheKey(merchantId),
      namespace: CACHE_NAMESPACE,
      value: { entries },
    },
    { onConflict: "key" },
  );
  if (error) {
    throw new Error(`context cache save failed: ${error.message}`);
  }
}

/** Lists all context entries for a merchant (active or all). Safe in unit tests & pre-migration DBs. */
export async function listContextEntries(
  supabase: AdminClient,
  merchantId: string,
  opts?: { activeOnly?: boolean },
): Promise<WorkspaceContextEntry[]> {
  try {
    const query = supabase
      .from("workspace_context_entries")
      .select("id, merchant_id, category, content, active, created_at, updated_at")
      .eq("merchant_id", merchantId);
    const ordered =
      typeof (query as { order?: unknown }).order === "function"
        ? await query.order("created_at", { ascending: true })
        : await query;
    if (ordered.error) {
      if (isMissingTableError(ordered.error)) {
        const cached = await readCacheEntries(supabase, merchantId);
        return opts?.activeOnly ? cached.filter((e) => e.active) : cached;
      }
      return [];
    }
    const rows = Array.isArray(ordered.data)
      ? (ordered.data as Array<Record<string, unknown>>)
          .map((row) => mapContextRow(row, merchantId))
          .filter((entry) => entry.content.length > 0)
      : [];
    return opts?.activeOnly ? rows.filter((e) => e.active) : rows;
  } catch {
    const cached = await readCacheEntries(supabase, merchantId);
    return opts?.activeOnly ? cached.filter((e) => e.active) : cached;
  }
}

/** Adds one chat-style context note (0 LLM calls). */
export async function addContextEntry(
  supabase: AdminClient,
  merchantId: string,
  input: { content: string; category?: ContextCategory },
): Promise<WorkspaceContextEntry> {
  const content = input.content.trim().slice(0, 1000);
  const category = input.category ?? inferContextCategory(content);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("workspace_context_entries")
    .insert({
      merchant_id: merchantId,
      category,
      content,
      active: true,
    })
    .select("id, merchant_id, category, content, active, created_at, updated_at")
    .single();

  if (!error && data) {
    return mapContextRow(data as Record<string, unknown>, merchantId);
  }
  if (!isMissingTableError(error)) {
    throw new Error(error?.message ?? "Could not save context entry");
  }

  const existing = await readCacheEntries(supabase, merchantId);
  const entry: WorkspaceContextEntry = {
    id: randomUUID(),
    merchant_id: merchantId,
    category,
    content,
    active: true,
    created_at: now,
    updated_at: now,
  };
  await writeCacheEntries(supabase, merchantId, [...existing, entry]);
  return entry;
}

/** Updates an existing context note (content, category, or active toggle). */
export async function updateContextEntry(
  supabase: AdminClient,
  merchantId: string,
  input: { id: string; content?: string; category?: ContextCategory; active?: boolean },
): Promise<WorkspaceContextEntry | null> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.content !== undefined) patch.content = input.content.trim().slice(0, 1000);
  if (input.category !== undefined) patch.category = input.category;
  if (input.active !== undefined) patch.active = input.active;

  const { data, error } = await supabase
    .from("workspace_context_entries")
    .update(patch)
    .eq("id", input.id)
    .eq("merchant_id", merchantId)
    .select("id, merchant_id, category, content, active, created_at, updated_at")
    .maybeSingle();

  if (!error) {
    return data ? mapContextRow(data as Record<string, unknown>, merchantId) : null;
  }
  if (!isMissingTableError(error)) {
    throw new Error(error.message);
  }

  const existing = await readCacheEntries(supabase, merchantId);
  let updated: WorkspaceContextEntry | null = null;
  const next = existing.map((item) => {
    if (item.id !== input.id) return item;
    updated = {
      ...item,
      ...(input.content !== undefined ? { content: input.content.trim().slice(0, 1000) } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      updated_at: new Date().toISOString(),
    };
    return updated;
  });
  if (!updated) return null;
  await writeCacheEntries(supabase, merchantId, next);
  return updated;
}

/** Deletes a context note. */
export async function deleteContextEntry(
  supabase: AdminClient,
  merchantId: string,
  id: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("workspace_context_entries")
    .delete()
    .eq("id", id)
    .eq("merchant_id", merchantId);

  if (!error) return true;
  if (!isMissingTableError(error)) {
    throw new Error(error.message);
  }

  const existing = await readCacheEntries(supabase, merchantId);
  const next = existing.filter((item) => item.id !== id);
  await writeCacheEntries(supabase, merchantId, next);
  return next.length !== existing.length;
}

function readableMessageBody(kind: string, body: string | null): string {
  if (!body) {
    if (kind === "image") return "(sent an image)";
    if (kind === "audio") return "(sent a voice note)";
    return "";
  }
  if (kind === "buttons" || kind === "pin_link") {
    try {
      const parsed = JSON.parse(body) as { text?: string };
      return (parsed.text ?? body).replace(/\s+/g, " ").trim();
    } catch {
      return body.replace(/\s+/g, " ").trim();
    }
  }
  return body.replace(/\s+/g, " ").trim();
}

/**
 * Loads the last N prior messages of a conversation as deterministic, timestamp-free
 * lines (`Client: ...` / `You: ...`) so Gemini remembers the dialogue without breaking cassette keys.
 */
export async function loadRecentConversationHistory(
  supabase: AdminClient,
  conversationId: string,
  opts?: { beforeIso?: string; limit?: number },
): Promise<string> {
  const limit = opts?.limit ?? 10;
  try {
    let query = supabase
      .from("messages")
      .select("direction, kind, body, created_at")
      .eq("conversation_id", conversationId);
    if (opts?.beforeIso && typeof (query as { lt?: unknown }).lt === "function") {
      query = query.lt("created_at", opts.beforeIso);
    }
    if (typeof (query as { order?: unknown }).order !== "function") return "";
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
    if (error || !Array.isArray(data) || data.length === 0) return "";

    const chronological = [...data].reverse() as Array<{
      direction?: unknown;
      kind?: unknown;
      body?: unknown;
    }>;

    const lines: string[] = [];
    for (const row of chronological) {
      const text = readableMessageBody(
        typeof row.kind === "string" ? row.kind : "text",
        typeof row.body === "string" ? row.body : null,
      );
      if (!text) continue;
      const role = row.direction === "in" ? "Client" : "You";
      lines.push(`${role}: ${text.slice(0, 260)}`);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

export interface CatalogIndexItem {
  id: string;
  name: string;
  category: string;
  priceMillimes: number;
  stock: number;
  description: string;
}

export interface EcommerceKnowledgePacket {
  shopName: string;
  promptBlock: string;
  allowedCatalogMillimes: number[];
  catalogIndex: CatalogIndexItem[];
  activeNotes: WorkspaceContextEntry[];
  autoSummary: {
    productCount: number;
    feeZoneCount: number;
    activeNoteCount: number;
  };
}

function formatDeliveryFeesCompact(
  fees: Array<{ governorate: string; delegation: string | null; fee_millimes: number }>,
): string {
  if (fees.length === 0) return "";
  const byFee = new Map<number, string[]>();
  for (const row of fees) {
    const label = row.delegation ? `${row.governorate} (${row.delegation})` : row.governorate;
    const list = byFee.get(row.fee_millimes) ?? [];
    if (!list.includes(label)) list.push(label);
    byFee.set(row.fee_millimes, list);
  }
  const parts: string[] = [];
  for (const [fee, places] of [...byFee.entries()].sort((a, b) => a[0] - b[0])) {
    const shown = places.length > 8 ? `${places.slice(0, 8).join(", ")} (+${places.length - 8} more)` : places.join(", ");
    parts.push(`${shown}: ${formatMillimesForChat(fee)}`);
  }
  return parts.join(" | ");
}

/**
 * Pure deterministic formatter for E-Commerce knowledge context.
 * Zero timestamps, zero UUIDs, NEVER includes secret `floor_millimes`.
 */
export function formatEcommerceKnowledgeBlock(input: {
  shopName: string;
  businessType?: string | null;
  businessDescription?: string | null;
  aiInstructions?: string | null;
  freeDeliveryThresholdMillimes?: number | null;
  hasPaymentLink?: boolean;
  products: Array<{
    name: string;
    category: string;
    description: string;
    priceMillimes: number;
    stock: number;
    variantsSummary?: string;
  }>;
  fees: Array<{ governorate: string; delegation: string | null; fee_millimes: number }>;
  notes: Array<{ category: ContextCategory; content: string }>;
  calendarBlock?: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`Shop Name: ${input.shopName}`);
  if (input.businessDescription?.trim()) {
    lines.push(`About this shop: ${input.businessDescription.trim().replace(/\s+/g, " ").slice(0, 240)}`);
  } else if (input.businessType && input.businessType !== "general") {
    lines.push(`Shop category: ${input.businessType}`);
  }

  if (input.products.length > 0) {
    lines.push("Active Product Catalog (list prices & stock — NEVER invent other prices):");
    for (const p of input.products.slice(0, 35)) {
      const stockText = p.stock > 0 ? `in stock (${p.stock})` : "out of stock";
      const desc = p.description ? ` — ${p.description.replace(/\s+/g, " ").slice(0, 120)}` : "";
      const variants = p.variantsSummary ? ` [${p.variantsSummary}]` : "";
      lines.push(`- ${p.name} (${p.category}): ${formatMillimesForChat(p.priceMillimes)} · ${stockText}${variants}${desc}`);
    }
  }

  const feeSummary = formatDeliveryFeesCompact(input.fees);
  if (feeSummary) {
    lines.push(`Delivery Fees by Governorate: ${feeSummary}`);
  }
  if (typeof input.freeDeliveryThresholdMillimes === "number" && input.freeDeliveryThresholdMillimes > 0) {
    lines.push(`Free Delivery Threshold: Free delivery on orders from ${formatMillimesForChat(input.freeDeliveryThresholdMillimes)} and up.`);
  }
  if (input.hasPaymentLink) {
    lines.push("Payment: Cash on delivery (COD) standard; online payment link available when needed.");
  }

  if (input.aiInstructions?.trim()) {
    lines.push(`Seller Tone & Guidelines: ${input.aiInstructions.trim().replace(/\s+/g, " ").slice(0, 1600)}`);
  }

  if (input.notes.length > 0) {
    lines.push("Live Owner Knowledge & Updates (treat as authoritative current shop facts):");
    for (const n of input.notes.slice(0, 25)) {
      lines.push(`- [${n.category}] ${n.content.replace(/\s+/g, " ").slice(0, 400)}`);
    }
  }

  if (input.calendarBlock?.trim()) {
    lines.push(input.calendarBlock.trim());
  }

  return lines.join("\n");
}

/**
 * Loads the complete E-Commerce workspace knowledge packet for a turn.
 * Safe in unit tests with partial Supabase mocks.
 */
export async function loadEcommerceKnowledgePacket(
  supabase: AdminClient,
  merchantId: string,
): Promise<EcommerceKnowledgePacket> {
  const [merchantRes, productsRes, feesRes, notes, upcomingEvents] = await Promise.all([
    Promise.resolve(
      supabase
        .from("merchants")
        .select("name, business_type, business_description, ai_instructions, free_delivery_threshold_millimes, payment_link")
        .eq("id", merchantId)
        .maybeSingle(),
    ).catch(() => ({ data: null, error: null })),
    Promise.resolve(
      supabase
        .from("products")
        .select("id, name, category, category_phrase, product_type, description, price_millimes, stock, active, ai_enabled")
        .eq("merchant_id", merchantId)
        .eq("active", true)
        .limit(40),
    ).catch(() => ({ data: null, error: null })),
    Promise.resolve(
      supabase
        .from("delivery_fees")
        .select("governorate, delegation, fee_millimes")
        .eq("merchant_id", merchantId)
        .order("governorate", { ascending: true })
        .limit(60),
    ).catch(() => ({ data: null, error: null })),
    listContextEntries(supabase, merchantId, { activeOnly: true }),
    listUpcomingBusyEvents(supabase, merchantId, 14).catch(() => []),
  ]);

  let rawProducts = Array.isArray(productsRes?.data)
    ? (productsRes.data as Array<Record<string, unknown>>)
    : [];
  if (productsRes?.error && rawProducts.length === 0) {
    const fallbackProducts = await Promise.resolve(
      supabase
        .from("products")
        .select("id, name, category_phrase, price_millimes, stock")
        .eq("merchant_id", merchantId)
        .eq("active", true)
        .limit(40),
    ).catch(() => ({ data: null }));
    rawProducts = Array.isArray(fallbackProducts?.data)
      ? (fallbackProducts.data as Array<Record<string, unknown>>)
      : [];
  }

  const aiProducts = rawProducts.filter((row) => row.ai_enabled !== false);
  const productIds = aiProducts
    .map((row) => (typeof row.id === "string" ? row.id : ""))
    .filter(Boolean);

  const variantsByProduct = new Map<string, Array<{ label: string; stock: number; priceMillimes: number | null }>>();
  const allowedSet = new Set<number>();

  if (productIds.length > 0) {
    try {
      const { data: varRows } = await supabase
        .from("product_variants")
        .select("product_id, size, color, option_values, price_millimes, stock")
        .in("product_id", productIds);
      for (const row of (varRows ?? []) as Array<Record<string, unknown>>) {
        const pid = typeof row.product_id === "string" ? row.product_id : "";
        if (!pid) continue;
        const stock = typeof row.stock === "number" ? row.stock : 0;
        const priceMillimes = typeof row.price_millimes === "number" && row.price_millimes > 0 ? row.price_millimes : null;
        if (priceMillimes !== null) allowedSet.add(priceMillimes);
        const parts: string[] = [];
        if (row.option_values && typeof row.option_values === "object" && !Array.isArray(row.option_values)) {
          for (const [k, v] of Object.entries(row.option_values as Record<string, unknown>)) {
            if (typeof v === "string" && v.trim()) parts.push(`${k}: ${v.trim()}`);
          }
        }
        if (parts.length === 0) {
          if (typeof row.size === "string" && row.size.trim()) parts.push(row.size.trim());
          if (typeof row.color === "string" && row.color.trim()) parts.push(row.color.trim());
        }
        if (parts.length > 0) {
          const list = variantsByProduct.get(pid) ?? [];
          list.push({ label: parts.join("/"), stock, priceMillimes });
          variantsByProduct.set(pid, list);
        }
      }
    } catch {
      // Optional variants table/columns unavailable in stubs
    }
  }

  const m = (merchantRes?.data ?? {}) as Record<string, unknown>;
  const shopName = typeof m.name === "string" && m.name.trim() ? m.name.trim() : "Shop";
  const freeThreshold =
    typeof m.free_delivery_threshold_millimes === "number" && m.free_delivery_threshold_millimes > 0
      ? m.free_delivery_threshold_millimes
      : null;
  if (freeThreshold !== null) allowedSet.add(freeThreshold);

  const fees = (Array.isArray(feesRes?.data) ? (feesRes.data as Array<Record<string, unknown>>) : [])
    .map((f) => ({
      governorate: String(f.governorate ?? ""),
      delegation: typeof f.delegation === "string" ? f.delegation : null,
      fee_millimes: typeof f.fee_millimes === "number" ? f.fee_millimes : 0,
    }))
    .filter((f) => f.governorate.length > 0);
  for (const f of fees) {
    if (f.fee_millimes > 0) allowedSet.add(f.fee_millimes);
  }

  const catalogIndex: CatalogIndexItem[] = [];
  const promptProducts: Array<{
    name: string;
    category: string;
    description: string;
    priceMillimes: number;
    stock: number;
    variantsSummary?: string;
  }> = [];

  for (const row of aiProducts) {
    const id = String(row.id ?? "");
    const name = String(row.name ?? "").trim();
    if (!id || !name) continue;
    const category = String(row.product_type ?? row.category ?? row.category_phrase ?? "general").trim();
    const priceMillimes = typeof row.price_millimes === "number" ? row.price_millimes : 0;
    const stock = typeof row.stock === "number" ? row.stock : 0;
    const description = typeof row.description === "string" ? row.description.trim() : "";
    if (priceMillimes > 0) allowedSet.add(priceMillimes);

    catalogIndex.push({ id, name, category, priceMillimes, stock, description });

    const vars = variantsByProduct.get(id) ?? [];
    const inStockVars = vars.filter((v) => v.stock > 0).slice(0, 8);
    const variantsSummary =
      inStockVars.length > 0
        ? `available: ${inStockVars
            .map((v) =>
              v.priceMillimes && v.priceMillimes !== priceMillimes
                ? `${v.label} (${formatMillimesForChat(v.priceMillimes)})`
                : v.label,
            )
            .join(", ")}`
        : undefined;

    promptProducts.push({ name, category, description, priceMillimes, stock, variantsSummary });
  }

  const promptBlock = formatEcommerceKnowledgeBlock({
    shopName,
    businessType: typeof m.business_type === "string" ? m.business_type : null,
    businessDescription: typeof m.business_description === "string" ? m.business_description : null,
    aiInstructions: typeof m.ai_instructions === "string" ? m.ai_instructions : null,
    freeDeliveryThresholdMillimes: freeThreshold,
    hasPaymentLink: typeof m.payment_link === "string" && Boolean(m.payment_link.trim()),
    products: promptProducts,
    fees,
    notes,
    calendarBlock: formatCalendarScheduleBlock(upcomingEvents),
  });

  return {
    shopName,
    promptBlock,
    allowedCatalogMillimes: [...allowedSet],
    catalogIndex,
    activeNotes: notes,
    autoSummary: {
      productCount: catalogIndex.length,
      feeZoneCount: fees.length,
      activeNoteCount: notes.length,
    },
  };
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, " ")
    .trim();
}

/**
 * Direct catalog product name lookup (0 embedding calls) when the buyer explicitly names
 * an active product or Gemini identifies an exact catalog item name from the knowledge packet.
 */
export function matchCatalogProductDirect(
  buyerText: string,
  catalogIndex: CatalogIndexItem[],
  modelProductNameHint?: string | null,
): CatalogIndexItem | null {
  if (catalogIndex.length === 0) return null;

  if (modelProductNameHint?.trim()) {
    const normHint = normalizeForMatch(modelProductNameHint);
    const exactHint = catalogIndex.find((item) => normalizeForMatch(item.name) === normHint);
    if (exactHint) return exactHint;
    const partialHint = catalogIndex.filter((item) => {
      const n = normalizeForMatch(item.name);
      return n.includes(normHint) || normHint.includes(n);
    });
    if (partialHint.length === 1) return partialHint[0]!;
  }

  const normText = normalizeForMatch(buyerText);
  if (normText.length < 3) return null;

  const exactInText = catalogIndex.filter((item) => {
    const n = normalizeForMatch(item.name);
    return n.length >= 4 && normText.includes(n);
  });
  if (exactInText.length === 1) return exactInText[0]!;

  // Multi-word token overlap when unique
  const textTokens = new Set(normText.split(" ").filter((t) => t.length >= 3));
  const scored: Array<{ item: CatalogIndexItem; ratio: number; hits: number }> = [];
  for (const item of catalogIndex) {
    const nameTokens = normalizeForMatch(item.name)
      .split(" ")
      .filter((t) => t.length >= 3);
    if (nameTokens.length === 0) continue;
    const hits = nameTokens.filter((t) => textTokens.has(t)).length;
    const ratio = hits / nameTokens.length;
    if (hits >= 2 && ratio >= 0.65) {
      scored.push({ item, ratio, hits });
    }
  }
  scored.sort((a, b) => b.ratio - a.ratio || b.hits - a.hits);
  if (scored.length === 1 || (scored.length > 1 && scored[0]!.ratio - scored[1]!.ratio >= 0.25)) {
    return scored[0]!.item;
  }

  return null;
}

export interface ProKnowledgePacket {
  promptBlock: string;
  allowedCatalogServiceMillimes: number[];
  activeNotes: WorkspaceContextEntry[];
}

/**
 * Pure deterministic formatter for Creator & Pro knowledge context.
 * Lists ALL active services (standard rates only, NEVER secret `floor_millimes`)
 * and all active live owner context updates.
 */
export function formatProKnowledgeBlock(input: {
  profile: Pick<ProProfileRow, "display_name" | "headline" | "profession_preset" | "bio" | "location_city" | "clinic_or_studio_address">;
  services: ProServiceRow[];
  notes: Array<{ category: ContextCategory; content: string }>;
  calendarBlock?: string | null;
}): string {
  const lines: string[] = [];

  if (input.services.length > 0) {
    lines.push("All Available Services & Packages (standard rates — NEVER invent prices or go below floor):");
    input.services.forEach((svc, idx) => {
      const rate =
        svc.price_millimes !== null
          ? formatMillimesForChat(svc.price_millimes)
          : svc.price_display || "Sur devis";
      const deliverables = svc.deliverables.length > 0 ? ` | Includes: ${svc.deliverables.join(", ")}` : "";
      const prep = svc.prep_or_details_template
        ? ` | Details: ${svc.prep_or_details_template.replace(/\s+/g, " ").slice(0, 180)}`
        : "";
      const booking = svc.booking_url ? ` | Booking: ${svc.booking_url}` : "";
      lines.push(
        `${idx}: ${svc.title} [${svc.category}] — ${rate}${svc.duration_label ? ` (${svc.duration_label})` : ""}${deliverables}${prep}${booking}`,
      );
    });
  }

  if (input.notes.length > 0) {
    lines.push("Live Owner Context, Availability & FAQs (authoritative current facts):");
    for (const n of input.notes.slice(0, 25)) {
      lines.push(`- [${n.category}] ${n.content.replace(/\s+/g, " ").slice(0, 400)}`);
    }
  }

  if (input.calendarBlock?.trim()) {
    lines.push(input.calendarBlock.trim());
  }

  return lines.join("\n");
}

export async function loadProKnowledgePacket(
  supabase: AdminClient,
  merchantId: string,
  profile: ProProfileRow,
  services: ProServiceRow[],
): Promise<ProKnowledgePacket> {
  const [activeNotes, upcomingEvents] = await Promise.all([
    listContextEntries(supabase, merchantId, { activeOnly: true }),
    listUpcomingBusyEvents(supabase, merchantId, 14).catch(() => []),
  ]);
  const allowedSet = new Set<number>();
  for (const svc of services) {
    const floor = svc.floor_millimes ?? 0;
    if (typeof svc.price_millimes === "number" && svc.price_millimes > 0 && svc.price_millimes >= floor) {
      allowedSet.add(svc.price_millimes);
    }
  }
  return {
    promptBlock: formatProKnowledgeBlock({
      profile,
      services,
      notes: activeNotes,
      calendarBlock: formatCalendarScheduleBlock(upcomingEvents),
    }),
    allowedCatalogServiceMillimes: [...allowedSet],
    activeNotes,
  };
}
