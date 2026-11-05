import { createAdminClient, hasAdminConfig } from "@/lib/supabase/admin";

/** Pipeline-level trace event (the "Behind the scenes" panel reads agent_events). */
export async function logEvent(
  conversationId: string | null,
  kind: string,
  detail: Record<string, unknown>,
  model?: string,
  provider?: string,
): Promise<void> {
  if (!hasAdminConfig()) return;
  try {
    const supabase = createAdminClient();
    // Fire-and-forget: pipeline events are observability, not turn state, so
    // they must not add a round-trip before the buyer's reply is sent.
    void Promise.resolve(
      supabase.from("agent_events").insert({
        conversation_id: conversationId,
        kind,
        model: model ?? null,
        provider: provider ?? null,
        ok: true,
        detail,
      }),
    ).catch(() => undefined);
  } catch {
    // Tracing must never break the turn.
  }
}
