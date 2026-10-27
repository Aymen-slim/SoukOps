/**
 * Day 1 voice bake-off: Muse Voice Transcribe vs Muse Spark Open audio on
 * the 6 real Derja notes in demo-pack/voice/*.wav.
 * Run: npm run bakeoff   (writes docs/bakeoff-results.md)
 * Score each transcript 1–5 in that file, then set ASR_PROVIDER in .env.local
 * to the winner (transcribe | spark-open) and record the decision in docs/PLAN.md.
 */
import "./load-env";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { transcribeWithMeta, transcribeWithSparkOpen } from "../src/lib/ai/asr";

const KEYWORDS = ["robe", "hamra", "somme", "alf", "adresse"];

async function main(): Promise<void> {
  const dir = path.join("demo-pack", "voice");
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".wav")).sort();
  } catch {
    files = [];
  }
  if (files.length === 0) {
    console.log("No WAV notes found in demo-pack/voice/. Add the 6 Derja notes (WAV mono 16-bit 16/24kHz) and re-run.");
    process.exit(0);
  }

  const rows: string[] = [];
  for (const file of files) {
    const wav = await readFile(path.join(dir, file));
    let meta = "(failed)";
    let open = "(failed)";
    try {
      meta = await transcribeWithMeta({ wav, keywords: KEYWORDS });
    } catch (err) {
      meta = `(failed: ${err instanceof Error ? err.message.split("\n")[0] : String(err)})`;
    }
    try {
      open = await transcribeWithSparkOpen({ wav, keywords: KEYWORDS });
    } catch (err) {
      open = `(failed: ${err instanceof Error ? err.message.split("\n")[0] : String(err)})`;
    }
    console.log(`\n== ${file}\n  transcribe : ${meta}\n  spark-open : ${open}`);
    rows.push(`| ${file} | ${meta.replace(/\|/g, "/")} | ${open.replace(/\|/g, "/")} |  |  |`);
  }

  const doc = `# Voice bake-off results\n\nRun: \`npm run bakeoff\`. Score 1–5 per note (product names, money/numbers, landmarks), then set \`ASR_PROVIDER\` to the winner.\n\n| Note | Muse Voice Transcribe | Muse Spark Open | Score transcribe | Score spark-open |\n|---|---|---|---|---|\n${rows.join("\n")}\n\n**Decision:** _fill in — winner, ASR_PROVIDER value, date._\n`;
  await writeFile(path.join("docs", "bakeoff-results.md"), doc, "utf8");
  console.log("\nWrote docs/bakeoff-results.md — score both columns, pick the winner, set ASR_PROVIDER in .env.local.");
}

void main();
