import { expect, test, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: ".env.local" });

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin env missing for e2e DB assertions");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function ordersForPhone(phone: string) {
  const supabase = adminClient();
  const { data: customer } = await supabase.from("customers").select("id").eq("phone", phone).maybeSingle();
  if (!customer) return [];
  const { data: orders } = await supabase
    .from("orders")
    .select("id, status, risk_level, risk_reasons, total_millimes")
    .eq("customer_id", customer.id as string)
    .order("created_at", { ascending: false });
  return orders ?? [];
}

/** Drives a simulator conversation to a matched product, returns when matched. */
async function driveToMatch(page: Page) {
  const input = page.getByPlaceholder("Message...");
  await expect(input).toBeEnabled({ timeout: 30_000 });
  await input.fill("n7eb sweat jaune taille L");
  await page.getByRole("button", { name: "Send" }).click();
  const matchedChip = page.getByText(/matchedProductName:/);
  const choiceButton = page.getByRole("button", { name: /^1 · / }).first();
  await expect
    .poll(
      async () => {
        if (await matchedChip.isVisible().catch(() => false)) return "matched";
        if (await choiceButton.isVisible().catch(() => false)) return "buttons";
        return "waiting";
      },
      { timeout: 240_000, intervals: [2000] },
    )
    .not.toBe("waiting");
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await matchedChip.isVisible().catch(() => false)) break;
    await choiceButton.click();
    await expect(matchedChip).toBeVisible({ timeout: 180_000 });
  }
  await expect(matchedChip).toBeVisible();
}

/** Match -> name -> phone -> landmark -> pin page confirm -> summary visible on the simulator. */
async function driveToSummary(page: Page) {
  await driveToMatch(page);
  const input = page.getByPlaceholder("Message...");
  await input.fill("esmi Aymen");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/customerName:\s*Aymen/)).toBeVisible({ timeout: 180_000 });
  await input.fill("numeri 22123456");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/\+21622123456/)).toBeVisible({ timeout: 180_000 });
  await input.fill("noskon fi Tunis w a9reb landmark howa Pharmacie de Nuit El Manar");
  await page.getByRole("button", { name: "Send" }).click();

  const pinLink = page.getByRole("link", { name: "Confirm my location" });
  const summary = page.getByText(/Récap el commande/);
  // Fresh address -> pin link; returning buyer with a confirmed pin on file
  // is reused and goes straight to the summary.
  const path = await expect
    .poll(
      async () => {
        if (await summary.isVisible().catch(() => false)) return "summary";
        if (await pinLink.isVisible().catch(() => false)) return "pin";
        return "waiting";
      },
      { timeout: 180_000, intervals: [2000] },
    )
    .not.toBe("waiting")
    .then(async () => ((await summary.isVisible().catch(() => false)) ? "summary" : "pin"));
  if (path === "summary") {
    await expect(page.getByRole("button", { name: "Akked" })).toBeVisible();
    return;
  }
  // No summary may exist before the pin is confirmed.
  await expect(summary).toHaveCount(0);

  const href = await pinLink.getAttribute("href");
  if (!href) throw new Error("pin link has no href");
  const pinPage = await page.context().newPage();
  await pinPage.goto(href);
  await expect(pinPage.getByRole("button", { name: "Confirm this spot" })).toBeVisible({ timeout: 30_000 });
  await pinPage.getByRole("button", { name: "Confirm this spot" }).click();
  await expect(pinPage.getByText("Location saved")).toBeVisible({ timeout: 30_000 });
  await pinPage.close();

  await expect(page.getByText(/Récap el commande/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Akked" })).toBeVisible();
}

test("home page loads with Day 1 status", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /wassalha/i })).toBeVisible();
});

// Day 2: simulator shell + text round trip. The 5 acceptance tests
// (docs/SPEC.md) run in replay mode from Day 7.
test("simulator sends a buyer text message", async ({ page }) => {
  await page.goto("/simulator");
  await expect(page.getByText("Demo Shop", { exact: true })).toBeVisible();
  const input = page.getByPlaceholder("Message...");
  await input.fill("Merhba, b9addech el hoodie el noir?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("b9addech el hoodie")).toBeVisible({ timeout: 15_000 });
});

// Acceptance test 1 (SPEC, Day 3): multi-person screenshot + buyer words ->
// correct crop matched (or the disambiguation ladder resolves it) and the
// real crop is shown. The caption plays the role of the ASR transcript —
// post-transcription the pipeline treats them identically. Live AI: slow.
test("acceptance 1: two-person screenshot resolves to a real matched crop", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/simulator");
  await expect(page.getByText("Demo Shop", { exact: true })).toBeVisible();
  // Input enables once hydration + conversation creation have completed.
  await expect(page.getByPlaceholder("Message...")).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Attach image").setInputFiles("demo-pack/screenshots/story-two-people-sweatshirts.jpeg");
  await expect(page.getByPlaceholder("Add text to the image...")).toBeVisible();
  await page.getByPlaceholder("Add text to the image...").fill("n7eb el sweat el jaune elli 3al yasar taille L");
  await page.getByRole("button", { name: "Send" }).click();

  const matchedChip = page.getByText(/matchedProductName:/);
  const choiceButton = page.getByRole("button", { name: /^1 · / }).first();

  // Either the gate proposes directly (matched chip) or the ladder asks the
  // buyer to pick a numbered crop/product (buttons). Resolve buttons by
  // choosing option 1 until the match lands.
  await expect
    .poll(
      async () => {
        if (await matchedChip.isVisible().catch(() => false)) return "matched";
        if (await choiceButton.isVisible().catch(() => false)) return "buttons";
        return "waiting";
      },
      { timeout: 240_000, intervals: [2000] },
    )
    .not.toBe("waiting");

  for (let attempt = 0; attempt < 3; attempt++) {
    if (await matchedChip.isVisible().catch(() => false)) break;
    await choiceButton.click();
    await expect(matchedChip).toBeVisible({ timeout: 180_000 });
  }

  await expect(matchedChip).toBeVisible();
  // The real crop (not a model redraw) is shown as an outbound image.
  await expect(page.locator("div.self-start img").first()).toBeVisible({ timeout: 60_000 });
});

// Day 3, SPEC step 4 voice-only path: a text/voice description (no photo)
// is embedded with the PE text tower into the same catalog index.
test("acceptance 1b: description-only turn matches via text embedding", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/simulator");
  await expect(page.getByText("Demo Shop", { exact: true })).toBeVisible();
  const input = page.getByPlaceholder("Message...");
  await expect(input).toBeEnabled({ timeout: 30_000 });
  await input.fill("n7eb sweat jaune taille L");
  await page.getByRole("button", { name: "Send" }).click();

  const matchedChip = page.getByText(/matchedProductName:/);
  const choiceButton = page.getByRole("button", { name: /^1 · / }).first();
  await expect
    .poll(
      async () => {
        if (await matchedChip.isVisible().catch(() => false)) return "matched";
        if (await choiceButton.isVisible().catch(() => false)) return "buttons";
        return "waiting";
      },
      { timeout: 240_000, intervals: [2000] },
    )
    .not.toBe("waiting");

  for (let attempt = 0; attempt < 3; attempt++) {
    if (await matchedChip.isVisible().catch(() => false)) break;
    await choiceButton.click();
    await expect(matchedChip).toBeVisible({ timeout: 180_000 });
  }
  await expect(matchedChip).toBeVisible();
});

// Acceptance test 2 (SPEC, Day 4): bargaining stops exactly at the floor;
// every amount the buyer sees comes from the deterministic ladder.
function fmtMillimes(millimes: number): string {
  const dinars = Math.floor(millimes / 1000);
  const rest = millimes % 1000;
  return rest === 0 ? `${dinars}DT` : `${dinars},${String(rest).padEnd(3, "0")} DT`;
}

function expectedRung(price: number, floor: number, rung: number): number {
  const fractions = [0.5, 0.8, 1];
  const raw = price - Math.round((price - floor) * fractions[Math.min(rung, 2)]);
  return Math.min(price, Math.max(floor, Math.ceil(raw / 500) * 500));
}

function parseAmountsMillimes(text: string): number[] {
  const amounts: number[] = [];
  for (const m of text.matchAll(/(\d{1,6})(?:[.,](\d{1,3}))?\s*(?:dt|dinar)/gi)) {
    amounts.push(Number(m[1]) * 1000 + (m[2] ? Number(m[2].padEnd(3, "0")) : 0));
  }
  for (const m of text.matchAll(/(\d{1,6})\s*alf\b/gi)) amounts.push(Number(m[1]) * 1000);
  return amounts;
}

async function expectLastOutbound(page: Page, expectedMillimes: number, minOutCount: number) {
  const bubbles = page.locator("div.self-start");
  await expect
    .poll(
      async () => {
        if ((await bubbles.count()) <= minOutCount) return false;
        const text = await bubbles.last().innerText().catch(() => "");
        return text.includes(fmtMillimes(expectedMillimes));
      },
      { timeout: 180_000, intervals: [2000] },
    )
    .toBe(true);
}

test("acceptance 2: bargaining stops exactly at the floor", async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto("/simulator");
  await expect(page.getByText("Demo Shop", { exact: true })).toBeVisible();
  await driveToMatch(page);

  const chip = await page.getByText(/matchedProductName:/).first().textContent();
  const productName = (chip ?? "").split(":").slice(1).join(":").trim();
  const supabase = adminClient();
  const { data: product } = await supabase
    .from("products")
    .select("price_millimes, floor_millimes")
    .eq("name", productName)
    .maybeSingle();
  if (!product) throw new Error(`matched product not in catalog: ${productName}`);
  const price = product.price_millimes as number;
  const floor = product.floor_millimes as number;
  const lowCounterDt = Math.floor((floor - 20_000) / 1000);

  const input = page.getByPlaceholder("Message...");
  const bubbles = page.locator("div.self-start");

  // Rung 1 (50% of max discount): plain discount ask, no counter.
  let outCount = await bubbles.count();
  await input.fill("ghalia barcha, na9esli el soum");
  await page.getByRole("button", { name: "Send" }).click();
  await expectLastOutbound(page, expectedRung(price, floor, 0), outCount);

  // Rung 2 (80%): a counter below the rung is not accepted.
  outCount = await bubbles.count();
  await input.fill(`na3tik ${lowCounterDt} alf`);
  await page.getByRole("button", { name: "Send" }).click();
  await expectLastOutbound(page, expectedRung(price, floor, 1), outCount);

  // Rung 3 (100%): exactly the floor.
  outCount = await bubbles.count();
  await input.fill(`na3tik ${lowCounterDt} alf, akher kelma`);
  await page.getByRole("button", { name: "Send" }).click();
  await expectLastOutbound(page, floor, outCount);

  // Further pressure never goes below the floor.
  outCount = await bubbles.count();
  await input.fill(`na3tik ${lowCounterDt} alf w akked`);
  await page.getByRole("button", { name: "Send" }).click();
  await expectLastOutbound(page, floor, outCount);

  // Firewall, buyer-side: no amount ever shown is below the floor.
  const allText = await bubbles.allInnerTexts();
  for (const text of allText) {
    for (const amount of parseAmountsMillimes(text)) {
      expect(amount).toBeGreaterThanOrEqual(floor);
    }
  }
});

// Acceptance test 3 (SPEC, Day 5): landmark resolves, pin confirmed on
// /pin/[token]; no summary before confirmation.
test("acceptance 3: landmark pin confirmed before any summary", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/simulator");
  await expect(page.getByText("Demo Shop", { exact: true })).toBeVisible();
  await driveToSummary(page);
});

// Acceptance test 4 (SPEC, Day 5): bad buyer gets a red badge with reasons;
// the order exists only after explicit Akked.
test("acceptance 4: bad buyer is red and order exists only after Akked", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/simulator");
  await expect(page.getByText("Demo Shop", { exact: true })).toBeVisible();
  // Wait for the initial "new" conversation, then switch persona (avoids the
  // two conversation creations racing each other).
  await expect(page.getByPlaceholder("Message...")).toBeEnabled({ timeout: 30_000 });
  const created = page.waitForResponse(
    (r) => r.url().includes("/api/sim/conversations") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Bad buyer" }).click();
  await created;

  await driveToSummary(page);

  const before = await ordersForPhone("+21624555666");
  await page.getByRole("button", { name: "Akked" }).click();
  await expect(page.getByText(/Takkdet el commande/)).toBeVisible({ timeout: 120_000 });

  await expect
    .poll(async () => (await ordersForPhone("+21624555666")).length, { timeout: 60_000 })
    .toBe(before.length + 1);
  const orders = await ordersForPhone("+21624555666");
  expect(orders[0].status).toBe("CONFIRMED_BY_BUYER");
  expect(orders[0].risk_level).toBe("red");
  expect(Array.isArray(orders[0].risk_reasons) && orders[0].risk_reasons.length > 0).toBe(true);
});

test("simulator stages an image with a caption before sending", async ({ page }) => {
  await page.goto("/simulator");
  await page.getByRole("button", { name: "en", exact: true }).click();
  await expect(page.getByText("Demo Shop", { exact: true })).toBeVisible();
  await page.getByLabel("Attach image").setInputFiles("demo-pack/products/product-01.jpeg");
  // The image must be staged (preview + caption field), not sent immediately.
  await expect(page.getByPlaceholder("Add text to the image...")).toBeVisible();
  await page.getByPlaceholder("Add text to the image...").fill("n7eb hedha taille L");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("n7eb hedha taille L")).toBeVisible({ timeout: 15_000 });
});

function runCourierJob(jobId: string): Promise<void> {
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, "worker/run-job.ts", jobId], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`courier worker exited ${code}`))));
  });
}

/** Buyer-confirmed order the courier test can approve without re-running SAM. */
async function insertConfirmedOrder(opts: { localityId: number | null; label: string }) {
  const supabase = adminClient();
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id, courier_mode")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (merchantError || !merchant) throw new Error("no merchant (run npm run seed:catalog)");
  const { data: product } = await supabase
    .from("products")
    .select("id, name")
    .eq("merchant_id", merchant.id as string)
    .limit(1)
    .maybeSingle();

  const phone = `+21649${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({ merchant_id: merchant.id, name: opts.label, phone })
    .select("id")
    .single();
  if (customerError || !customer) throw new Error(customerError?.message ?? "customer");

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({ merchant_id: merchant.id, customer_id: customer.id, channel: "simulator" })
    .select("id")
    .single();
  if (convError || !conversation) throw new Error(convError?.message ?? "conversation");

  const { data: address, error: addrError } = await supabase
    .from("addresses")
    .insert({
      customer_id: customer.id,
      governorate: "Tunis",
      delegation: null,
      locality_id: opts.localityId,
      landmark: "Pharmacie de Nuit El Manar",
      lat: 36.8065,
      lng: 10.1815,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (addrError || !address) throw new Error(addrError?.message ?? "address");

  const total = 112_500;
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      merchant_id: merchant.id,
      customer_id: customer.id,
      conversation_id: conversation.id,
      address_id: address.id,
      status: "CONFIRMED_BY_BUYER",
      subtotal_millimes: 105_500,
      discount_millimes: 0,
      delivery_fee_millimes: 7_000,
      total_millimes: total,
      risk_score: 90,
      risk_level: "green",
      risk_reasons: ["Livraisons précédentes propres"],
    })
    .select("id")
    .single();
  if (orderError || !order) throw new Error(orderError?.message ?? "order");

  const { error: itemError } = await supabase.from("order_items").insert({
    order_id: order.id,
    product_id: (product?.id as string | undefined) ?? null,
    name_snapshot: (product?.name as string | undefined) ?? "Sweat bordereau",
    unit_price_millimes: 105_500,
    quantity: 1,
  });
  if (itemError) throw new Error(itemError.message);

  return {
    supabase,
    merchantId: merchant.id as string,
    previousMode: merchant.courier_mode as string,
    orderId: order.id as string,
    conversationId: conversation.id as string,
  };
}

test("acceptance 5: approve, read back, confirm, waybill, buyer message", async ({ page, request }) => {
  test.setTimeout(180_000);
  const fixture = await insertConfirmedOrder({ localityId: 101, label: "Test bordereau" });
  await fixture.supabase.from("merchants").update({ courier_mode: "browser" }).eq("id", fixture.merchantId);
  try {
    await page.goto(`/dashboard/orders/${fixture.orderId}`);
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible({ timeout: 30_000 });
    const started = Date.now();
    await page.getByRole("button", { name: "Approve" }).click();

    let jobId = "";
    await expect
      .poll(async () => {
        const { data } = await fixture.supabase
          .from("courier_jobs")
          .select("id, status")
          .eq("order_id", fixture.orderId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data && (data.status === "queued" || data.status === "claimed")) {
          jobId = data.id as string;
          return "ready";
        }
        return "waiting";
      }, { timeout: 20_000 })
      .toBe("ready");

    const done = runCourierJob(jobId);
    await expect(page.getByRole("button", { name: "Confirm shipment" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Confirm shipment" }).click();
    await done;

    await expect
      .poll(async () => {
        const { data } = await fixture.supabase.from("orders").select("status").eq("id", fixture.orderId).single();
        return data?.status;
      }, { timeout: 30_000 })
      .toBe("WAYBILL_CREATED");

    const { data: shipment } = await fixture.supabase
      .from("shipments")
      .select("barcode")
      .eq("order_id", fixture.orderId)
      .single();
    const barcode = shipment?.barcode as string;
    expect(barcode).toMatch(/^FD\d{10}$/);

    const pdf = await request.get(`/api/fd-mock/v2/waybill/${barcode}`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"] ?? "").toContain("pdf");
    const body = await pdf.body();
    expect(body.byteLength).toBeGreaterThan(500);
    expect(body.subarray(0, 4).toString()).toBe("%PDF");

    await page.goto(`/simulator?conversation=${fixture.conversationId}`);
    await expect(page.getByText(barcode)).toBeVisible({ timeout: 20_000 });
    expect(Date.now() - started).toBeLessThan(180_000);
  } finally {
    await fixture.supabase.from("merchants").update({ courier_mode: fixture.previousMode }).eq("id", fixture.merchantId);
  }
});

test("acceptance 5b: missing locality_id creates neither job nor shipment", async ({ request }) => {
  const fixture = await insertConfirmedOrder({ localityId: null, label: "Test sans locality" });
  const res = await request.post(`/api/orders/${fixture.orderId}/approve`);
  expect(res.status()).toBe(422);
  const body = (await res.json()) as { error?: string };
  expect(body.error ?? "").toMatch(/locality_id/);
  const { data: jobs } = await fixture.supabase.from("courier_jobs").select("id").eq("order_id", fixture.orderId);
  const { data: shipments } = await fixture.supabase.from("shipments").select("id").eq("order_id", fixture.orderId);
  expect(jobs ?? []).toHaveLength(0);
  expect(shipments ?? []).toHaveLength(0);
});

