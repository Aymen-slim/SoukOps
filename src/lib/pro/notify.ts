import { buildTextPayload, resolveWhatsAppConfig, type WhatsAppConfig } from "@/lib/channels/whatsapp";
import { normalizeTunisianPhone } from "@/lib/domain/derja";
import { getServerEnv } from "@/lib/env";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { AlertCategory, AlertSeverity, ProProfileRow } from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export interface ProAlertNotificationInput {
  id?: string | null;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  summary: string;
  recommended_action: string;
  draft_reply?: string | null;
}

export interface DispatchNotificationResult {
  notifiedChannels: string[];
  errors: string[];
}

export function shouldPushExternalAlert(severity: AlertSeverity): boolean {
  return severity === "urgent" || severity === "critical";
}

export function formatAlertWhatsAppText(
  alert: ProAlertNotificationInput,
  displayName?: string,
  appBaseUrl?: string,
): string {
  const base = (appBaseUrl ?? getServerEnv().APP_BASE_URL).replace(/\/$/, "");
  const badge = alert.severity === "critical" ? "🚨 CRITICAL ALERT" : "⚡ URGENT ALERT";
  const header = displayName ? `${badge} — ${displayName}` : badge;
  const lines = [
    header,
    `• ${alert.title}`,
    alert.summary ? alert.summary : null,
    alert.recommended_action ? `Next step: ${alert.recommended_action}` : null,
    `Open Wassalha Pro: ${base}/pro/alerts`,
  ].filter(Boolean);
  return lines.join("\n");
}

export function formatAlertEmailPayload(
  alert: ProAlertNotificationInput,
  displayName?: string,
  appBaseUrl?: string,
): { subject: string; text: string } {
  const prefix = alert.severity === "critical" ? "[CRITICAL]" : "[URGENT]";
  const subject = `${prefix} ${alert.title} — Wassalha Pro`;
  const text = formatAlertWhatsAppText(alert, displayName, appBaseUrl);
  return { subject, text };
}

/**
 * Sends a WhatsApp text notification to a Tunisian `+216` phone via Meta Cloud API.
 */
export async function sendWhatsAppAlertMessage(
  config: WhatsAppConfig,
  rawPhone: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const normalized = normalizeTunisianPhone(rawPhone);
  const digits = (normalized ?? rawPhone).replace(/\D/g, "");
  if (digits.length < 8) {
    throw new Error("Invalid WhatsApp alert phone number");
  }
  const res = await fetchImpl(`${GRAPH_BASE}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildTextPayload(digits, text)),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WhatsApp alert push failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return true;
}

/**
 * Sends an email notification via Resend (`RESEND_API_KEY`).
 */
export async function sendEmailAlert(
  to: string,
  subject: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const env = getServerEnv();
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const from = env.RESEND_FROM_EMAIL?.trim() || "Wassalha Alerts <alerts@wassalha.tn>";
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend email failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return true;
}

/**
 * Dispatches external push notifications (WhatsApp `+216` and/or Email via Resend)
 * for `urgent` and `critical` alerts. Never throws — logs failures and records every
 * succeeded channel in `pro_alerts.notified_channels`.
 */
export async function dispatchProAlertNotifications(
  supabase: AdminClient,
  merchantId: string,
  alert: ProAlertNotificationInput,
  opts?: {
    profile?: Pick<ProProfileRow, "display_name" | "alert_whatsapp_phone" | "alert_email"> | null;
    fetchImpl?: typeof fetch;
  },
): Promise<DispatchNotificationResult> {
  const notifiedChannels: string[] = ["in_app"];
  const errors: string[] = [];

  if (!shouldPushExternalAlert(alert.severity)) {
    return { notifiedChannels, errors };
  }

  let profile = opts?.profile ?? null;
  if (!profile) {
    try {
      const { data } = await supabase
        .from("pro_profiles")
        .select("display_name, alert_whatsapp_phone, alert_email")
        .eq("merchant_id", merchantId)
        .maybeSingle();
      if (data) {
        const row = data as Record<string, unknown>;
        profile = {
          display_name: String(row.display_name ?? "Wassalha Pro"),
          alert_whatsapp_phone:
            typeof row.alert_whatsapp_phone === "string" ? row.alert_whatsapp_phone : null,
          alert_email: typeof row.alert_email === "string" ? row.alert_email : null,
        };
      }
    } catch {
      // Missing profile row: keep in_app notification only.
    }
  }

  const fetchImpl = opts?.fetchImpl ?? fetch;

  // 1. WhatsApp +216 push
  if (profile?.alert_whatsapp_phone) {
    try {
      const waConfig = await resolveWhatsAppConfig(supabase, merchantId);
      if (waConfig) {
        const body = formatAlertWhatsAppText(alert, profile.display_name);
        await sendWhatsAppAlertMessage(waConfig, profile.alert_whatsapp_phone, body, fetchImpl);
        notifiedChannels.push("whatsapp");
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // 2. Email push via Resend
  const env = getServerEnv();
  if (profile?.alert_email && env.RESEND_API_KEY) {
    try {
      const email = formatAlertEmailPayload(alert, profile.display_name);
      await sendEmailAlert(profile.alert_email, email.subject, email.text, fetchImpl);
      notifiedChannels.push("email");
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Persist notified channels on the alert row if an ID was provided
  if (alert.id && notifiedChannels.length > 1) {
    try {
      await supabase
        .from("pro_alerts")
        .update({ notified_channels: notifiedChannels, updated_at: new Date().toISOString() })
        .eq("id", alert.id)
        .eq("merchant_id", merchantId);
    } catch {
      // Non-fatal persistence miss
    }
  }

  return { notifiedChannels, errors };
}

export interface CreateProAlertInput {
  merchantId: string;
  conversationId?: string | null;
  opportunityId?: string | null;
  inquiryId?: string | null;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  summary: string;
  recommendedAction: string;
  draftReply?: string | null;
  profile?: Pick<ProProfileRow, "display_name" | "alert_whatsapp_phone" | "alert_email"> | null;
  fetchImpl?: typeof fetch;
}

/**
 * Inserts a new `pro_alerts` row and dispatches WhatsApp `+216` / Email push
 * when severity is `urgent` or `critical`.
 */
export async function createProAlert(
  supabase: AdminClient,
  input: CreateProAlertInput,
): Promise<{ id: string | null; notifiedChannels: string[]; errors: string[] }> {
  const { data, error } = await supabase
    .from("pro_alerts")
    .insert({
      merchant_id: input.merchantId,
      conversation_id: input.conversationId ?? null,
      opportunity_id: input.opportunityId ?? null,
      inquiry_id: input.inquiryId ?? null,
      severity: input.severity,
      category: input.category,
      title: input.title,
      summary: input.summary,
      recommended_action: input.recommendedAction,
      draft_reply: input.draftReply ?? null,
      status: "unread",
      notified_channels: ["in_app"],
    })
    .select("id")
    .maybeSingle();

  if (error) {
    return { id: null, notifiedChannels: [], errors: [error.message] };
  }

  const alertId =
    data && typeof (data as { id?: unknown }).id === "string"
      ? (data as { id: string }).id
      : null;

  const dispatch = await dispatchProAlertNotifications(
    supabase,
    input.merchantId,
    {
      id: alertId,
      severity: input.severity,
      category: input.category,
      title: input.title,
      summary: input.summary,
      recommended_action: input.recommendedAction,
      draft_reply: input.draftReply ?? null,
    },
    { profile: input.profile, fetchImpl: input.fetchImpl },
  );

  return { id: alertId, ...dispatch };
}
