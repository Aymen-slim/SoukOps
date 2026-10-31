import { diffParcel, formValue } from "../src/lib/couriers/readback";
import { markAwaitingConfirm, markJobFailed, uploadCourierScreenshot, waitForSellerConfirm } from "../src/lib/couriers/jobs";
import { recordWaybill } from "../src/lib/couriers/dispatch";
import { parcelFieldsSchema, PARCEL_FIELD_KEYS, type CourierJobPayload, type ParcelFields } from "../src/lib/couriers/types";
import { getServerEnv } from "../src/lib/env";
import { logEvent } from "../src/lib/pipeline/events";
import { createAdminClient } from "../src/lib/supabase/admin";

/** Structural page so the worker and the e2e driver share one fill/read-back path. */
export interface PortalPage {
  goto(url: string, options?: { waitUntil?: "domcontentloaded" | "load" | "networkidle"; timeout?: number }): Promise<unknown>;
  locator(selector: string): {
    fill(value: string): Promise<void>;
    inputValue(): Promise<string>;
    textContent(): Promise<string | null>;
    waitFor(options?: { state?: "visible" | "attached" | "hidden"; timeout?: number }): Promise<void>;
    isVisible(): Promise<boolean>;
  };
  getByRole(role: "button", options?: { name?: string | RegExp }): { click(): Promise<void> };
  waitForURL(url: string | RegExp, options?: { timeout?: number }): Promise<void>;
  screenshot(options?: { type?: "png"; fullPage?: boolean }): Promise<Buffer>;
  url(): string;
}

const CONFIRM_TIMEOUT_MS = 10 * 60 * 1000;

async function openForm(page: PortalPage, base: string, user: string, password: string): Promise<void> {
  await page.goto(`${base}/courier-clone/nouveau`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await Promise.race([
    page.locator('[name="user"]').waitFor({ state: "visible", timeout: 20_000 }),
    page.locator('[name="clientName"]').waitFor({ state: "visible", timeout: 20_000 }),
  ]);
  if (await page.locator('[name="user"]').isVisible()) {
    await page.locator('[name="user"]').fill(user);
    await page.locator('[name="password"]').fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.locator('[name="clientName"]').waitFor({ state: "visible", timeout: 20_000 });
  }
}

async function readFields(page: PortalPage): Promise<Record<string, string>> {
  const readback: Record<string, string> = {};
  for (const key of PARCEL_FIELD_KEYS) {
    readback[key] = await page.locator(`[name="${key}"]`).inputValue();
  }
  return readback;
}

/**
 * Fill the clone, read every field back, wait for the seller, then submit.
 * A mismatch never submits. Called by `npm run worker` and by the one-shot test driver.
 */
export async function executeCourierJob(page: PortalPage, jobId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: job } = await supabase.from("courier_jobs").select("id, status, payload").eq("id", jobId).maybeSingle();
  if (!job) throw new Error(`job ${jobId} introuvable`);

  if (job.status === "queued") {
    const { data: claimed, error } = await supabase
      .from("courier_jobs")
      .update({ status: "claimed", claimed_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (error || !claimed) throw new Error("job déjà pris");
  } else if (job.status !== "claimed") {
    throw new Error(`job non lançable (${job.status})`);
  }

  const payload = job.payload as CourierJobPayload | null;
  const parsed = parcelFieldsSchema.safeParse(payload?.parcel);
  if (!parsed.success) {
    await markJobFailed(jobId, { diffs: [], readback: {}, error: "Payload colis invalide." });
    throw new Error("payload invalide");
  }
  const parcel: ParcelFields = parsed.data;
  const conversationId = payload?.conversationId ?? null;
  const env = getServerEnv();
  const base = env.APP_BASE_URL.replace(/\/$/, "");

  await openForm(page, base, env.COURIER_CLONE_USER, env.COURIER_CLONE_PASSWORD);
  for (const key of PARCEL_FIELD_KEYS) {
    await page.locator(`[name="${key}"]`).fill(formValue(parcel, key));
  }
  const readback = await readFields(page);
  const png = Buffer.from(await page.screenshot({ type: "png", fullPage: true }));
  const screenshotPath = await uploadCourierScreenshot(jobId, png);
  const diffs = diffParcel(parcel, readback);

  if (diffs.length) {
    await markJobFailed(jobId, { diffs, readback, screenshotPath, error: "Relecture différente du colis." });
    await logEvent(conversationId, "courier.mismatch", { orderId: parcel.orderId, diffs });
    throw new Error(`read-back: ${diffs.join(" | ")}`);
  }

  await markAwaitingConfirm(jobId, readback, screenshotPath);
  await logEvent(conversationId, "courier.readback", { orderId: parcel.orderId });

  const confirmed = await waitForSellerConfirm(jobId, CONFIRM_TIMEOUT_MS);
  if (!confirmed) {
    await markJobFailed(jobId, {
      diffs: [],
      readback,
      screenshotPath,
      error: "Le vendeur n'a pas confirmé l'envoi.",
    });
    throw new Error("confirmation vendeur absente");
  }

  await page.getByRole("button", { name: "Créer le colis" }).click();
  const deadline = Date.now() + 30_000;
  let barcode: string | undefined;
  while (Date.now() < deadline) {
    barcode = page.url().match(/\/courier-clone\/colis\/(FD\d{10})/)?.[1];
    if (barcode) break;
    const formAlert = page.locator('form [role="alert"]');
    if (await formAlert.isVisible()) {
      const alertText = (await formAlert.textContent())?.trim();
      if (alertText) {
        await markJobFailed(jobId, { diffs: [], readback, screenshotPath, error: alertText });
        throw new Error(alertText);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!barcode) {
    await markJobFailed(jobId, { diffs: [], readback, screenshotPath, error: "Bordereau sans code-barres." });
    throw new Error("barcode missing");
  }

  await recordWaybill({
    orderId: parcel.orderId,
    conversationId,
    barcode,
    waybillPath: `${barcode}.pdf`,
    mode: "browser",
    totalMillimes: parcel.prixMillimes,
    jobId,
  });
}
