import { createAdminClient } from "@/lib/supabase/admin";
import type { JobResult } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

export async function uploadCourierScreenshot(jobId: string, png: Buffer): Promise<string> {
  const path = `jobs/${jobId}/readback.png`;
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from("waybills").upload(path, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`screenshot upload failed: ${error.message}`);
  return path;
}

export async function markAwaitingConfirm(jobId: string, readback: Record<string, string>, screenshotPath: string): Promise<void> {
  const supabase = createAdminClient();
  const result: JobResult = { readback, diffs: [], sellerConfirmed: false };
  const { error } = await supabase
    .from("courier_jobs")
    .update({ status: "awaiting_confirm", screenshot_path: screenshotPath, result })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

export async function markJobFailed(
  jobId: string,
  input: { diffs: string[]; readback: Record<string, string>; screenshotPath?: string; error?: string; barcode?: string },
): Promise<void> {
  const supabase = createAdminClient();
  const result: JobResult = {
    readback: input.readback,
    diffs: input.diffs,
    error: input.error,
    barcode: input.barcode,
    sellerConfirmed: false,
  };
  const { error } = await supabase
    .from("courier_jobs")
    .update({
      status: "failed",
      screenshot_path: input.screenshotPath ?? null,
      result,
    })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

export async function waitForSellerConfirm(jobId: string, timeoutMs: number): Promise<boolean> {
  const supabase = createAdminClient();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabase.from("courier_jobs").select("result, status").eq("id", jobId).maybeSingle();
    if (!data || data.status === "failed") return false;
    const result = (data.result ?? {}) as JobResult;
    if (result.sellerConfirmed) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

export async function claimQueuedJob(): Promise<{ id: string } | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_courier_job");
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || !("id" in row)) return null;
  return { id: String((row as { id: string }).id) };
}

export async function loadCourierJob(supabase: Admin, jobId: string) {
  const { data } = await supabase
    .from("courier_jobs")
    .select("id, order_id, status, payload")
    .eq("id", jobId)
    .maybeSingle();
  return data;
}
