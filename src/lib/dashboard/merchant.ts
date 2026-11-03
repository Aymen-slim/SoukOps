import { createAdminClient } from "@/lib/supabase/admin";
import { isReplyLanguage, type ReplyLanguage } from "@/lib/pipeline/seller-voice";

type Admin = ReturnType<typeof createAdminClient>;

export interface DemoMerchant {
  id: string;
  name: string;
  slug: string | null;
  payment_link: string | null;
  free_delivery_threshold_millimes: number | null;
  courier_mode: "mock_api" | "browser" | "real_api";
  reply_language: ReplyLanguage;
  ai_instructions: string;
  is_sandbox: boolean;
}

export const SHOP_COLUMNS =
  "id, name, slug, payment_link, free_delivery_threshold_millimes, courier_mode, reply_language, ai_instructions, is_sandbox";

const LEGACY_COLUMNS = "id, name, payment_link, free_delivery_threshold_millimes, courier_mode";

export function mapMerchant(row: Record<string, unknown>): DemoMerchant {
  const mode = row.courier_mode;
  return {
    id: String(row.id),
    name: String(row.name ?? "Shop"),
    slug: typeof row.slug === "string" ? row.slug : null,
    payment_link: (row.payment_link as string | null) ?? null,
    free_delivery_threshold_millimes: (row.free_delivery_threshold_millimes as number | null) ?? null,
    courier_mode: mode === "browser" || mode === "real_api" || mode === "mock_api" ? mode : "mock_api",
    reply_language: isReplyLanguage(row.reply_language) ? row.reply_language : "derja",
    ai_instructions: typeof row.ai_instructions === "string" ? row.ai_instructions : "",
    is_sandbox: Boolean(row.is_sandbox),
  };
}

async function oldestShop(supabase: Admin, sandbox: "exclude" | "any"): Promise<DemoMerchant | null> {
  let query = supabase.from("merchants").select(SHOP_COLUMNS).order("created_at", { ascending: true }).limit(1);
  if (sandbox === "exclude") query = query.eq("is_sandbox", false);
  const { data, error } = await query.maybeSingle();
  if (!error && data) return mapMerchant(data as Record<string, unknown>);
  const legacy = await supabase
    .from("merchants")
    .select(LEGACY_COLUMNS)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (legacy.error || !legacy.data) return null;
  return mapMerchant(legacy.data as Record<string, unknown>);
}

/** Oldest real shop — the one `npm run seed:catalog` already uses. Sandboxes are skipped. */
export async function getDemoMerchant(supabase: Admin): Promise<DemoMerchant | null> {
  return oldestShop(supabase, "exclude");
}

export async function getShopBySlug(supabase: Admin, slug: string): Promise<DemoMerchant | null> {
  const { data, error } = await supabase.from("merchants").select(SHOP_COLUMNS).eq("slug", slug).maybeSingle();
  if (error || !data) return null;
  return mapMerchant(data as Record<string, unknown>);
}

function safeId(value: string): boolean {
  return /^[0-9A-Za-z._-]{1,80}$/.test(value);
}

async function shopByColumn(supabase: Admin, column: string, value: string): Promise<DemoMerchant | null> {
  if (!safeId(value)) return null;
  const { data, error } = await supabase.from("merchants").select(SHOP_COLUMNS).eq(column, value).limit(1).maybeSingle();
  if (error || !data) return null;
  return mapMerchant(data as Record<string, unknown>);
}

export async function merchantForWhatsAppPhone(supabase: Admin, phoneNumberId: string | null): Promise<DemoMerchant | null> {
  if (phoneNumberId) {
    const match = await shopByColumn(supabase, "whatsapp_phone_number_id", phoneNumberId);
    if (match) return match;
  }
  return getDemoMerchant(supabase);
}

export async function merchantForFacebookPage(supabase: Admin, pageId: string | null): Promise<DemoMerchant | null> {
  if (pageId) {
    const messenger = await shopByColumn(supabase, "messenger_page_id", pageId);
    if (messenger) return messenger;
    const instagramPage = await shopByColumn(supabase, "instagram_page_id", pageId);
    if (instagramPage) return instagramPage;
    const instagram = await shopByColumn(supabase, "instagram_business_id", pageId);
    if (instagram) return instagram;
  }
  return getDemoMerchant(supabase);
}

export function whatsAppPhoneNumberId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const id = (change as { value?: { metadata?: { phone_number_id?: unknown } } }).value?.metadata?.phone_number_id;
      if (typeof id === "string" && id) return id;
    }
  }
  return null;
}
