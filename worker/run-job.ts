/**
 * One claimed-or-queued job, then exit. The acceptance test spawns this so it
 * runs the same fill/read-back code as `npm run worker` (tsx resolves `@/`).
 */
import "../scripts/load-env";
import { chromium } from "playwright";
import { executeCourierJob } from "./fillParcel";

async function main(): Promise<void> {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error("usage: tsx worker/run-job.ts <jobId>");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
  try {
    await executeCourierJob(page, jobId);
  } finally {
    await browser.close();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
