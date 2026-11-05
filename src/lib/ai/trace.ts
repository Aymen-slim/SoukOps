import { createAdminClient, hasAdminConfig } from "@/lib/supabase/admin";

export type AiProvider = "meta" | "baseten";

export interface TraceEvent {
  kind: string; // e.g. "spark.json", "sam.segment", "asr.transcribe", "pe.embedImage"
  model: string;
  provider: AiProvider;
  latencyMs: number;
  ok: boolean;
  conversationId?: string;
  detail?: Record<string, unknown>;
}

/**
 * Writes one row to `agent_events` when Supabase admin is configured;
 * otherwise logs to stdout. Trace failures never break the AI call.
 */
export async function trace(event: TraceEvent): Promise<void> {
  const line = `[trace] ${event.kind} ${event.provider}/${event.model} ${event.latencyMs}ms ok=${event.ok}`;
  if (!hasAdminConfig()) {
    console.info(line);
    return;
  }
  try {
    const supabase = createAdminClient();
    await supabase.from("agent_events").insert({
      conversation_id: event.conversationId ?? null,
      kind: event.kind,
      model: event.model,
      provider: event.provider,
      latency_ms: Math.round(event.latencyMs),
      ok: event.ok,
      detail: event.detail ?? {},
    });
  } catch (err) {
    console.warn(`${line} (trace insert failed: ${err instanceof Error ? err.message : String(err)})`);
  }
}

/** Times an async call and traces it, rethrowing any error after tracing. */
export async function traced<T>(
  meta: Omit<TraceEvent, "latencyMs" | "ok">,
  call: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    const result = await call();
    // Tracing must not add a database round-trip to the reply path: the
    // insert runs concurrently with whatever the caller does next.
    void trace({ ...meta, latencyMs: performance.now() - started, ok: true });
    return result;
  } catch (err) {
    void trace({
      ...meta,
      latencyMs: performance.now() - started,
      ok: false,
      detail: { ...meta.detail, error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
