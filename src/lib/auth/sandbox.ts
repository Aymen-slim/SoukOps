import { randomBytes } from "node:crypto";
import { computeTotals } from "@/lib/domain/pricing";
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
  const { data: products } = await supabase
    .from("products")
    .select("id, name, category_phrase, category, price_millimes, floor_millimes, stock, active, ai_enabled")
    .eq("merchant_id", sourceId);
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
        price_millimes: product.price_millimes,
        floor_millimes: product.floor_millimes,
        stock: product.stock,
        active: product.active,
        ai_enabled: product.ai_enabled !== false,
      })
      .select("id")
      .single();
    if (error || !inserted) continue;
    idMap.set(product.id as string, inserted.id as string);
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
  return idMap;
}

async function seedSampleDesk(supabase: Admin, merchantId: string): Promise<void> {
  const { data: product } = await supabase
    .from("products")
    .select("id, name, price_millimes, floor_millimes")
    .eq("merchant_id", merchantId)
    .limit(1)
    .maybeSingle();
  let productId = product?.id as string | undefined;
  const productName = (product?.name as string | undefined) ?? "Sample hoodie";
  const list = (product?.price_millimes as number | undefined) ?? 120_000;
  const floor = (product?.floor_millimes as number | undefined) ?? 105_000;
  if (!productId) {
    const { data: inserted } = await supabase
      .from("products")
      .insert({
        merchant_id: merchantId,
        name: productName,
        category_phrase: "hoodie",
        category: "Hoodies",
        price_millimes: list,
        floor_millimes: floor,
        stock: 4,
        ai_enabled: true,
      })
      .select("id")
      .single();
    productId = inserted?.id as string | undefined;
  }

  const people = [
    { name: "Amira Ben Ali", phone: "+21655001001", governorate: "Tunis", landmark: "Pharmacie Ibn Sina", lat: 36.8065, lng: 10.1815 },
    { name: "Yassine Trabelsi", phone: "+21655001002", governorate: "Sfax", landmark: "Café de la Paix", lat: 34.7406, lng: 10.7603 },
    { name: "Nour Khelifi", phone: "+21655001003", governorate: "Sousse", landmark: "Mosquée El Fath", lat: 35.8256, lng: 10.6369 },
  ];
  const totals = computeTotals({
    listUnitMillimes: list,
    agreedUnitMillimes: Math.max(floor, list - 5_000),
    quantity: 1,
    feeMillimes: 7_000,
    freeDeliveryThresholdMillimes: null,
  });
  const statuses = ["CONFIRMED_BY_BUYER", "WAYBILL_CREATED", "DELIVERED"] as const;
  const ages = [1, 6, 40];

  for (let i = 0; i < people.length; i++) {
    const person = people[i];
    const { data: customer } = await supabase
      .from("customers")
      .insert({ merchant_id: merchantId, name: person.name, phone: person.phone })
      .select("id")
      .single();
    if (!customer) continue;
    const { data: address } = await supabase
      .from("addresses")
      .insert({
        customer_id: customer.id,
        governorate: person.governorate,
        landmark: person.landmark,
        lat: person.lat,
        lng: person.lng,
        driver_note: i === 0 ? "Call when you arrive" : null,
        confirmed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    const { data: conversation } = await supabase
      .from("conversations")
      .insert({
        merchant_id: merchantId,
        customer_id: customer.id,
        channel: "simulator",
        ai_paused: i === 2,
        slots: { matchedProductName: productName },
      })
      .select("id")
      .single();
    if (conversation) {
      await supabase.from("messages").insert([
        {
          conversation_id: conversation.id,
          direction: "in",
          kind: "text",
          body: `n7eb ${productName}, taille M`,
        },
        {
          conversation_id: conversation.id,
          direction: "out",
          kind: "text",
          body: `Yesss, ${productName} mawjoud. Nkammlou el commande?`,
        },
      ]);
    }
    const createdAt = new Date(Date.now() - ages[i] * 24 * 60 * 60 * 1000).toISOString();
    const { data: order } = await supabase
      .from("orders")
      .insert({
        merchant_id: merchantId,
        customer_id: customer.id,
        conversation_id: conversation?.id ?? null,
        address_id: address?.id ?? null,
        status: statuses[i],
        subtotal_millimes: totals.subtotalMillimes,
        discount_millimes: totals.discountMillimes,
        delivery_fee_millimes: totals.deliveryFeeMillimes,
        total_millimes: totals.totalMillimes,
        risk_score: i === 2 ? 55 : 82,
        risk_level: i === 2 ? "yellow" : "green",
        risk_reasons: ["Sample desk order"],
        created_at: createdAt,
      })
      .select("id")
      .single();
    if (order && productId) {
      await supabase.from("order_items").insert({
        order_id: order.id,
        product_id: productId,
        name_snapshot: productName,
        unit_price_millimes: Math.max(floor, list - 5_000),
        quantity: 1,
      });
    }
  }
}

export async function resetSandboxShop(currentId: string): Promise<DemoMerchant> {
  const supabase = createAdminClient();
  await supabase.from("merchants").delete().eq("id", currentId).eq("is_sandbox", true);
  return createSandboxShop();
}
