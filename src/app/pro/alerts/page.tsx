"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell01, CheckCircle, PauseCircle, Send01 } from "@untitledui/icons";
import { invalidateDashboardUrl, usePoll } from "@/app/dashboard/use-poll";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { TextArea } from "@/components/base/textarea/textarea";
import { Alert } from "@/components/foundations/alert/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import type { AlertCategory, AlertSeverity, AlertStatus } from "@/lib/pro/types";

interface ProAlertItem {
  id: string;
  conversation_id: string | null;
  opportunity_id: string | null;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  summary: string;
  recommended_action: string;
  draft_reply: string | null;
  status: AlertStatus;
  notified_channels: string[];
  created_at: string;
}

export default function ProAlertsPage() {
  const { data, error, reload } = usePoll<{ alerts: ProAlertItem[]; unreadCount: number }>(
    "/api/pro/alerts",
    6_000,
  );
  const allAlerts = data?.alerts ?? [];
  const [filter, setFilter] = useState<"unread" | "all" | "urgent">("unread");
  const [replyEdits, setReplyEdits] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const alerts = allAlerts.filter((a) => {
    if (filter === "unread") return a.status === "unread";
    if (filter === "urgent") return a.severity === "critical" || a.severity === "urgent";
    return true;
  });

  async function act(
    alertItem: ProAlertItem,
    action: "approve_send" | "takeover" | "acknowledge" | "dismiss",
  ) {
    setBusyId(alertItem.id);
    setFeedback(null);
    try {
      const replyText = (replyEdits[alertItem.id] ?? alertItem.draft_reply ?? "").trim();
      const res = await fetch(`/api/pro/alerts/${alertItem.id}/act`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "approve_send" && replyText ? { replyText } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { sentMessage?: boolean; error?: string }
        | null;
      if (!res.ok) {
        setFeedback({ kind: "error", text: body?.error ?? "Action failed." });
        return;
      }
      invalidateDashboardUrl("/api/pro/");
      await reload();
      setFeedback({
        kind: "success",
        text:
          action === "approve_send"
            ? body?.sentMessage
              ? "Approved reply sent to the client and alert marked as acted."
              : "Alert marked as acted."
            : action === "takeover"
              ? "AI paused on this conversation — ready for your personal reply in Inbox."
              : `Alert marked as ${action === "dismiss" ? "dismissed" : "acknowledged"}.`,
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-[#E4E4E7] pb-5">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#52525B]">
          Human-in-the-Loop Escalations
        </p>
        <h1 className="mt-1.5 text-2xl font-medium tracking-[-0.03em] text-[#09090B] sm:text-3xl">
          Urgent Action Queue
        </h1>
        <p className="mt-1 text-sm text-[#52525B]">
          Medical SAMU 190 red-flags, VIP commercial quotes, angry clients, and closing high-fit opportunities land here first.
        </p>
      </div>

      {error ? <Alert color="error">{error}</Alert> : null}
      {feedback ? <Alert color={feedback.kind}>{feedback.text}</Alert> : null}

      <div className="inline-flex w-fit flex-wrap gap-1 border border-[#E4E4E7] bg-white p-1">
        {(
          [
            { id: "unread", label: "Unread", count: data?.unreadCount ?? 0 },
            {
              id: "urgent",
              label: "Critical & Urgent",
              count: allAlerts.filter((a) => a.severity === "critical" || a.severity === "urgent").length,
            },
            { id: "all", label: "All", count: allAlerts.length },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`inline-flex cursor-pointer items-center gap-1.5 px-3.5 py-2 font-mono text-xs uppercase tracking-[0.06em] transition-colors ${
              filter === tab.id
                ? "bg-[#1D1E1A] text-white"
                : "text-[#52525B] hover:bg-[#FAFAF9] hover:text-[#09090B]"
            }`}
          >
            {tab.label}
            <span className="tabular-nums opacity-75">({tab.count})</span>
          </button>
        ))}
      </div>

      {alerts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[#52525B]">
            All clear — no alerts in this filter.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {alerts.map((item) => {
            const draftVal = replyEdits[item.id] ?? item.draft_reply ?? "";
            const isCritical = item.severity === "critical";
            return (
              <Card
                key={item.id}
                className={isCritical ? "ring-[#D13C2E]" : undefined}
              >
                <CardHeader className={isCritical ? "bg-[#FBF3F2]" : undefined}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          color={
                            item.severity === "critical"
                              ? "error"
                              : item.severity === "urgent"
                                ? "warning"
                                : "brand"
                          }
                          className="font-mono text-[11px] uppercase"
                        >
                          {item.severity}
                        </Badge>
                        <Badge color="gray" className="font-mono text-[11px] uppercase">
                          {item.category.replace(/_/g, " ")}
                        </Badge>
                        <Badge color={item.status === "unread" ? "brand" : "gray"} className="font-mono text-[11px] uppercase">
                          {item.status}
                        </Badge>
                      </div>
                      <CardTitle className="mt-2 flex items-center gap-2 text-base">
                        <Bell01
                          className={`size-4 shrink-0 ${isCritical ? "text-[#D13C2E]" : "text-brand-secondary"}`}
                          aria-hidden="true"
                        />
                        {item.title}
                      </CardTitle>
                      <CardDescription dir="auto">{item.summary}</CardDescription>
                    </div>
                    <div className="text-right font-mono text-[11px] text-[#71717A]">
                      <p>{new Date(item.created_at).toLocaleString()}</p>
                      <p className="mt-1 uppercase">
                        Channels: {(item.notified_channels ?? ["in_app"]).join(" · ")}
                      </p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-col gap-3.5">
                  {item.recommended_action ? (
                    <p className="border-l-2 border-[#09090B] bg-[#FAFAF9] px-3 py-2 text-xs font-medium text-[#09090B]">
                      Recommended: {item.recommended_action}
                    </p>
                  ) : null}

                  {item.draft_reply !== null ? (
                    <TextArea
                      label="Suggested Reply / Pitch Draft"
                      rows={2}
                      value={draftVal}
                      onChange={(val) => setReplyEdits((prev) => ({ ...prev, [item.id]: val }))}
                    />
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E4E4E7] pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {draftVal.trim() ? (
                        <Button
                          size="sm"
                          color="primary"
                          iconLeading={Send01}
                          isDisabled={busyId === item.id}
                          onClick={() => void act(item, "approve_send")}
                        >
                          Approve &amp; Send Draft
                        </Button>
                      ) : null}
                      {item.conversation_id ? (
                        <Button
                          size="sm"
                          color="secondary"
                          iconLeading={PauseCircle}
                          isDisabled={busyId === item.id}
                          onClick={() => void act(item, "takeover")}
                        >
                          Take Over DM
                        </Button>
                      ) : null}
                      {item.opportunity_id ? (
                        <Link href="/pro/opportunities" className="gs-link-mono ml-1">
                          <span>Open Opportunity</span>
                          <span aria-hidden="true">→</span>
                        </Link>
                      ) : null}
                      {item.conversation_id ? (
                        <Link href="/pro/inbox" className="gs-link-mono ml-1">
                          <span>Open Inbox</span>
                          <span aria-hidden="true">→</span>
                        </Link>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {item.status === "unread" ? (
                        <Button
                          size="sm"
                          color="secondary"
                          iconLeading={CheckCircle}
                          isDisabled={busyId === item.id}
                          onClick={() => void act(item, "acknowledge")}
                        >
                          Acknowledge
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        color="tertiary"
                        isDisabled={busyId === item.id}
                        onClick={() => void act(item, "dismiss")}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
