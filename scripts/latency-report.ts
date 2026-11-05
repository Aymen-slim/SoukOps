/**
 * Latency + model-call report from agent_events.
 * Run: npm run latency [--hours=24]
 * Prints per-kind call counts with p50/p95 latency, and model calls per
 * conversation, so speed changes are proven against a baseline.
 */
import "./load-env";
import { createAdminClient, hasAdminConfig } from "../src/lib/supabase/admin";

const MODEL_KINDS = ["spark.json", "spark.text", "sam.segment", "sam.segmentPoint", "asr.transcribe", "pe.embedImages", "pe.embedTexts", "image.generate"];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function main(): Promise<void> {
  if (!hasAdminConfig()) {
    console.log("SKIP: Supabase admin is not configured, so agent_events cannot be read.");
    return;
  }
  const hoursArg = process.argv.find((a) => a.startsWith("--hours="));
  const hours = hoursArg ? Number(hoursArg.split("=")[1]) || 24 : 24;
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("agent_events")
    .select("kind, latency_ms, conversation_id, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) {
    console.log(`No agent_events in the last ${hours}h.`);
    return;
  }

  const byKind = new Map<string, number[]>();
  const callsPerConversation = new Map<string, number>();
  for (const row of rows) {
    const kind = row.kind as string;
    if (typeof row.latency_ms === "number") {
      const list = byKind.get(kind) ?? [];
      list.push(row.latency_ms as number);
      byKind.set(kind, list);
    }
    if (MODEL_KINDS.includes(kind) && row.conversation_id) {
      callsPerConversation.set(row.conversation_id as string, (callsPerConversation.get(row.conversation_id as string) ?? 0) + 1);
    }
  }

  console.log(`agent_events (last ${hours}h, ${rows.length} rows)`);
  console.log("kind                     count   p50ms   p95ms");
  for (const [kind, latencies] of [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const sorted = [...latencies].sort((a, b) => a - b);
    console.log(
      `${kind.padEnd(24)} ${String(sorted.length).padStart(5)} ${String(Math.round(percentile(sorted, 50))).padStart(7)} ${String(Math.round(percentile(sorted, 95))).padStart(7)}`,
    );
  }

  const perConversation = [...callsPerConversation.values()].sort((a, b) => a - b);
  if (perConversation.length > 0) {
    console.log(
      `model calls per conversation: n=${perConversation.length} p50=${percentile(perConversation, 50)} p95=${percentile(perConversation, 95)} max=${perConversation[perConversation.length - 1]}`,
    );
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
