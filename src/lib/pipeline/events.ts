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
    await supabase.from("agent_events").insert({
      conversation_id: conversationId,
      kind,
      model: model ?? null,
      provider: provider ?? null,
      ok: true,
      detail,
    });
  } catch {
    // Tracing must never break the turn.
  }
}
