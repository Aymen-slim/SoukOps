import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDemoMerchant, mapMerchant, SHOP_COLUMNS, type DemoMerchant } from "@/lib/dashboard/merchant";

type Admin = ReturnType<typeof createAdminClient>;

function slugToken(): string {
  return randomBytes(4).toString("hex");
}

async function uniqueSlug(supabase: Admin, base: string): Promise<string> {
  const root = base.slice(0, 40) || "shop";
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? root : `${root}-${slugToken()}`;
    const { data } = await supabase.from("merchants").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
  }
  return `${root}-${slugToken()}`;
}

export async function slugFromEmail(supabase: Admin, email: string): Promise<string> {
  const local = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return uniqueSlug(supabase, local || "shop");
}

export async function shopNameFromEmail(email: string): Promise<string> {
  const local = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  return (local || "My shop").slice(0, 80);
}

/** Drop demo copies older than two days so try-outs do not pile up. */
export async function sweepOldSandboxes(supabase: Admin): Promise<void> {
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("merchants").delete().eq("is_sandbox", true).lt("created_at", cutoff);
}

export async function createSandboxShop(): Promise<DemoMerchant> {
  const supabase = createAdminClient();
  await sweepOldSandboxes(supabase);
  const source = await getDemoMerchant(supabase);
  const slug = await uniqueSlug(supabase, `try-${slugToken()}`);
  const { data: created, error } = await supabase
    .from("merchants")
    .insert({
      name: "Demo shop",
      slug,
      is_sandbox: true,
      reply_language: "derja",
      ai_instructions: "",
      courier_mode: source?.courier_mode ?? "mock_api",
      payment_link: source?.payment_link ?? null,
      free_delivery_threshold_millimes: source?.free_delivery_threshold_millimes ?? null,
    })
    .select(SHOP_COLUMNS)
    .single();
  if (error || !created) throw new Error(error?.message ?? "Could not open a demo account");
  const shop = mapMerchant(created as Record<string, unknown>);
  await copyCatalog(supabase, source?.id ?? null, shop.id);
  await seedSampleDesk(supabase, shop.id);
  return shop;
}

async function copyCatalog(supabase: Admin, sourceId: string | null, merchantId: string): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();
  if (!sourceId) return idMap;
  const rich =
    "id, name, category_phrase, category, product_type, description, size_policy, price_millimes, floor_millimes, stock, active, ai_enabled";
  const plain = "id, name, category_phrase, category, price_millimes, floor_millimes, stock, active, ai_enabled";
  let { data: products, error: listError } = await supabase.from("products").select(rich).eq("merchant_id", sourceId);
  if (listError && /product_type|size_policy|description/i.test(listError.message)) {
    const retry = await supabase.from("products").select(plain).eq("merchant_id", sourceId);
    products = retry.data as typeof products;
  }
  for (const product of products ?? []) {
    const category =
      (typeof product.category === "string" && product.category) ||
      (product.category_phrase as string) ||
      "general";
    const { data: inserted, error } = await supabase
      .from("products")
      .insert({
        merchant_id: merchantId,
        name: product.name,
        category_phrase: product.category_phrase,
        category,
        product_type: (product.product_type as string | null) ?? null,
        description: (product.description as string | null) ?? null,
        size_policy: product.size_policy === "none" || product.size_policy === "options" ? product.size_policy : "required",
        price_millimes: product.price_millimes,
        floor_millimes: product.floor_millimes,
        stock: product.stock,
        active: product.active,
        ai_enabled: product.ai_enabled !== false,
      })
      .select("id")
      .single();
    const insertedRow =
      error && /product_type|size_policy|description/i.test(error.message)
        ? (
            await supabase
              .from("products")
              .insert({
                merchant_id: merchantId,
                name: product.name,
                category_phrase: product.category_phrase,
                category,
                price_millimes: product.price_millimes,
                floor_millimes: product.floor_millimes,
                stock: product.stock,
                active: product.active,
                ai_enabled: product.ai_enabled !== false,
              })
              .select("id")
              .single()
          ).data
        : inserted;
    if (!insertedRow) continue;
    idMap.set(product.id as string, insertedRow.id as string);
  }
  if (idMap.size === 0) return idMap;
  const { data: images } = await supabase
    .from("product_images")
    .select("product_id, source_path, crop_path, embedding, is_primary")
    .eq("merchant_id", sourceId);
  const rows = (images ?? [])
    .map((image) => {
      const productId = idMap.get(image.product_id as string);
      if (!productId) return null;
      return {
        product_id: productId,
        merchant_id: merchantId,
        source_path: image.source_path,
        crop_path: image.crop_path,
        embedding: image.embedding,
        is_primary: image.is_primary,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  if (rows.length > 0) await supabase.from("product_images").insert(rows);
  const sourceIds = [...idMap.keys()];
  const { data: options } = await supabase
    .from("product_options")
    .select("product_id, name, position")
    .in("product_id", sourceIds);
  if (options && options.length > 0) {
    await supabase.from("product_options").insert(
      options.flatMap((option) => {
        const productId = idMap.get(option.product_id as string);
        if (!productId) return [];
        return [{ product_id: productId, name: option.name, position: option.position }];
      }),
    );
  }
  const { data: variants } = await supabase
    .from("product_variants")
    .select("product_id, size, color, stock, option_values, price_millimes, sku")
    .in("product_id", sourceIds);
  if (variants && variants.length > 0) {
    await supabase.from("product_variants").insert(
      variants.flatMap((variant) => {
        const productId = idMap.get(variant.product_id as string);
        if (!productId) return [];
        return [
          {
            product_id: productId,
            size: variant.size,
            color: variant.color,
            stock: variant.stock,
            option_values: variant.option_values,
            price_millimes: variant.price_millimes,
            sku: variant.sku,
          },
        ];
      }),
    );
  }
  return idMap;
}

async function seedSampleDesk(supabase: Admin, merchantId: string): Promise<void> {
  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("merchant_id", merchantId)
    .limit(1)
    .maybeSingle();
  if (product?.id) return;
  await supabase.from("products").insert({
    merchant_id: merchantId,
    name: "Sample hoodie",
    category_phrase: "hoodie",
    category: "Hoodies",
    price_millimes: 120_000,
    floor_millimes: 105_000,
    stock: 4,
    ai_enabled: true,
  });
}

export async function resetSandboxShop(currentId: string): Promise<DemoMerchant> {
  const supabase = createAdminClient();
  await supabase.from("merchants").delete().eq("id", currentId).eq("is_sandbox", true);
  return createSandboxShop();
}
