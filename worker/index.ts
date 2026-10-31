import "../scripts/load-env";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { claimQueuedJob, markJobFailed } from "../src/lib/couriers/jobs";
import { createAdminClient } from "../src/lib/supabase/admin";
import { executeCourierJob } from "./fillParcel";

const statePath = "worker/.auth/state.json";
let stop = false;

async function beat(): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("agent_events").insert({
    conversation_id: null,
    kind: "courier.heartbeat",
    ok: true,
    detail: {},
  });
}

async function main(): Promise<void> {
  mkdirSync("worker/.auth", { recursive: true });
  const headed = process.env.COURIER_HEADED === "1";
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1400 },
    ...(existsSync(statePath) ? { storageState: statePath } : {}),
  });

  process.on("SIGINT", () => {
    stop = true;
  });
  process.on("SIGTERM", () => {
    stop = true;
  });

  void (async () => {
    while (!stop) {
      try {
        await beat();
      } catch (err) {
        console.error("[worker] heartbeat", err);
      }
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  })();

  console.log(`[worker] courier agent ${headed ? "headed" : "headless"} — waiting for jobs`);
  while (!stop) {
    let job: { id: string } | null = null;
    try {
      job = await claimQueuedJob();
    } catch (err) {
      console.error("[worker] claim", err);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      continue;
    }
    if (!job) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      continue;
    }
    const page = await context.newPage();
    try {
      await executeCourierJob(page, job.id);
      console.log(`[worker] job ${job.id} done`);
    } catch (err) {
      console.error(`[worker] job ${job.id}`, err);
      try {
        const supabase = createAdminClient();
        const { data } = await supabase.from("courier_jobs").select("status").eq("id", job.id).maybeSingle();
        if (data && (data.status === "claimed" || data.status === "queued")) {
          await markJobFailed(job.id, {
            diffs: [],
            readback: {},
            error: err instanceof Error ? err.message : "agent interrompu",
          });
        }
      } catch (markErr) {
        console.error("[worker] mark failed", markErr);
      }
    } finally {
      await page.close();
      await context.storageState({ path: statePath }).catch(() => undefined);
    }
  }
  await browser.close();
}

void main();
