"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bell01,
  Briefcase01,
  ClipboardCheck,
  Inbox01,
  RefreshCw01,
  Stars01,
  Target04,
} from "@untitledui/icons";
import { invalidateDashboardUrl, useDashboardResource } from "@/app/dashboard/use-poll";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/foundations/alert/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import { Metric } from "@/components/foundations/metric/metric";
import { useSessionInfo } from "@/lib/auth/client-session";
import { formatMillimesForChat } from "@/lib/domain/pricing";
import { getProPreset } from "@/lib/pro/presets";

interface BriefingPayload {
  briefing: {
    id: string | null;
    headline: string;
    highlights: string[];
    action_items: string[];
    created_at: string;
    stats: {
      dmsHandled?: number;
      activeInquiries?: number;
      opportunitiesSpotted?: number;
      unreadAlerts?: number;
      criticalAlerts?: number;
    };
  } | null;
  badges: {
    unreadAlerts: number;
    newOpportunities: number;
  };
}

interface AlertsPayload {
  alerts: Array<{
    id: string;
    severity: "info" | "important" | "urgent" | "critical";
    category: string;
    title: string;
    summary: string;
    recommended_action: string;
    draft_reply: string | null;
    conversation_id: string | null;
    status: string;
  }>;
  unreadCount: number;
}

interface OpportunitiesPayload {
  opportunities: Array<{
    id: string;
    fit_score: number;
    urgency: string;
    status: string;
    opportunity: {
      id: string;
      source: string;
      title: string;
      brand_or_client: string;
      compensation_text: string;
      budget_millimes: number | null;
    };
  }>;
}

export default function ProCommandCenterPage() {
  const session = useSessionInfo();
  const preset = getProPreset(session?.proCategory);

  const {
    data: briefingRes,
    error: briefingErr,
    reload: reloadBriefing,
  } = useDashboardResource<BriefingPayload>("/api/pro/briefing");
  const { data: alertsRes, reload: reloadAlerts } = useDashboardResource<AlertsPayload>(
    "/api/pro/alerts?status=unread",
  );
  const { data: oppsRes, reload: reloadOpps } = useDashboardResource<OpportunitiesPayload>(
    "/api/pro/opportunities",
  );

  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [actingAlertId, setActingAlertId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const briefing = briefingRes?.briefing ?? null;
  const stats = briefing?.stats ?? {};
  const urgentAlerts = (alertsRes?.alerts ?? []).filter(
    (a) => a.status === "unread" && (a.severity === "critical" || a.severity === "urgent"),
  );
  const topOpps = (oppsRes?.opportunities ?? [])
    .filter((o) => o.status !== "dismissed")
    .slice(0, 4);

  async function refreshBriefing() {
    setRefreshing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/pro/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowHours: 24 }),
      });
      if (res.ok) {
        invalidateDashboardUrl("/api/pro/briefing");
        await reloadBriefing();
        setNotice("Executive briefing updated with the latest 24-hour activity.");
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function runOpportunityScan() {
    setScanning(true);
    setNotice(null);
    try {
      const res = await fetch("/api/pro/opportunities/scan", { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { newMatches?: number; alertsCreated?: number; error?: string }
        | null;
      if (res.ok) {
        invalidateDashboardUrl("/api/pro/");
        await Promise.all([reloadOpps(), reloadAlerts(), reloadBriefing()]);
        setNotice(
          `Scan complete: ${body?.newMatches ?? 0} new match(es) scored, ${body?.alertsCreated ?? 0} alert(s) created.`,
        );
      } else {
        setNotice(body?.error ?? "Opportunity scan failed.");
      }
    } finally {
      setScanning(false);
    }
  }

  async function quickActAlert(alertId: string, action: "approve_send" | "acknowledge" | "takeover") {
    setActingAlertId(alertId);
    try {
      const res = await fetch(`/api/pro/alerts/${alertId}/act`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        invalidateDashboardUrl("/api/pro/");
        await Promise.all([reloadAlerts(), reloadBriefing()]);
      }
    } finally {
      setActingAlertId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E4E4E7] pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#52525B]">
              Command Center
            </span>
            <Badge color="brand" className="font-mono text-[11px] uppercase">
              {preset.shortLabel}
            </Badge>
          </div>
          <h1 className="mt-2 text-2xl font-medium tracking-[-0.03em] text-[#09090B] sm:text-3xl">
            {session?.name ?? preset.defaultDisplayName}
          </h1>
          <p className="mt-1 text-sm text-[#52525B]">{preset.headline}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            color="secondary"
            size="sm"
            iconLeading={Target04}
            isDisabled={scanning}
            onClick={() => void runOpportunityScan()}
          >
            {scanning ? "Scanning…" : "Scan Opportunities"}
          </Button>
          <Button
            color="primary"
            size="sm"
            iconLeading={RefreshCw01}
            isDisabled={refreshing}
            onClick={() => void refreshBriefing()}
          >
            {refreshing ? "Refreshing…" : "Refresh What's New"}
          </Button>
        </div>
      </div>

      {briefingErr ? <Alert color="error">{briefingErr}</Alert> : null}
      {notice ? <Alert color="success">{notice}</Alert> : null}

      {/* Urgent Alerts Strip */}
      {urgentAlerts.length > 0 ? (
        <section aria-label="Urgent alerts" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#D13C2E]">
              Urgent Action Needed ({urgentAlerts.length})
            </p>
            <Link href="/pro/alerts" className="gs-link-mono">
              <span>All alerts</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {urgentAlerts.slice(0, 2).map((item) => (
              <div
                key={item.id}
                className={`flex flex-col justify-between gap-3 border p-4 ${
                  item.severity === "critical"
                    ? "border-[#D13C2E] bg-[#FBF3F2]"
                    : "border-[#09090B] bg-white"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      color={item.severity === "critical" ? "error" : "warning"}
                      className="font-mono text-[11px] uppercase"
                    >
                      {item.severity} · {item.category.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[#09090B]">{item.title}</p>
                  <p className="mt-1 text-sm text-[#52525B]" dir="auto">
                    {item.summary}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-[#E4E4E7] pt-3">
                  {item.draft_reply && item.conversation_id ? (
                    <Button
                      size="sm"
                      color="primary"
                      isDisabled={actingAlertId === item.id}
                      onClick={() => void quickActAlert(item.id, "approve_send")}
                    >
                      Approve &amp; Send Draft
                    </Button>
                  ) : null}
                  {item.conversation_id ? (
                    <Button
                      size="sm"
                      color="secondary"
                      isDisabled={actingAlertId === item.id}
                      onClick={() => void quickActAlert(item.id, "takeover")}
                    >
                      Take Over DM
                    </Button>
                  ) : (
                    <Button size="sm" color="secondary" href="/pro/alerts">
                      Review in Alerts
                    </Button>
                  )}
                  <Button
                    size="sm"
                    color="tertiary"
                    isDisabled={actingAlertId === item.id}
                    onClick={() => void quickActAlert(item.id, "acknowledge")}
                  >
                    Acknowledge
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* KPI Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="DMs handled (24h)"
          value={stats.dmsHandled ?? 0}
          icon={Inbox01}
        />
        <Metric
          label="Active inquiries"
          value={stats.activeInquiries ?? 0}
          icon={ClipboardCheck}
        />
        <Metric
          label="Opportunities spotted"
          value={briefingRes?.badges.newOpportunities ?? stats.opportunitiesSpotted ?? 0}
          icon={Target04}
        />
        <Metric
          label="Unread alerts"
          value={briefingRes?.badges.unreadAlerts ?? stats.unreadAlerts ?? 0}
          icon={Bell01}
          iconClassName={
            (briefingRes?.badges.unreadAlerts ?? 0) > 0 ? "text-error-primary" : undefined
          }
        />
      </div>

      {/* What's New Briefing + Top Opportunities */}
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Stars01 className="size-4 text-brand-secondary" aria-hidden="true" />
                What&apos;s New — Agent Briefing
              </CardTitle>
              <span className="font-mono text-[11px] uppercase text-[#71717A]">
                {briefing?.created_at
                  ? new Date(briefing.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Live"}
              </span>
            </div>
            <CardDescription className="text-sm font-medium text-[#09090B]">
              {briefing?.headline ?? preset.welcomeBriefing.headline}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 text-sm text-[#52525B]">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#71717A]">
                Highlights
              </p>
              <ul className="mt-2 space-y-2 border-t border-[#E4E4E7] pt-3">
                {(briefing?.highlights ?? preset.welcomeBriefing.highlights).map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="font-mono text-[#1B8A5E]" aria-hidden="true">
                      →
                    </span>
                    <span dir="auto">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#71717A]">
                Recommended Actions
              </p>
              <ul className="mt-2 space-y-2 border-t border-[#E4E4E7] pt-3">
                {(briefing?.action_items ?? preset.welcomeBriefing.actionItems).map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[#09090B]">
                    <span className="font-mono text-[#09090B]" aria-hidden="true">
                      [ ]
                    </span>
                    <span dir="auto">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target04 className="size-4 text-brand-secondary" aria-hidden="true" />
                Top Scored Opportunities
              </CardTitle>
              <Link href="/pro/opportunities" className="gs-link-mono">
                <span>Open radar</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
            <CardDescription>
              Ranked by goal alignment, Tunisia fit &amp; rate floor — never auto-applied.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {topOpps.length === 0 ? (
              <p className="border border-[#E4E4E7] bg-[#FAFAF9] p-4 text-sm text-[#52525B]">
                No scored opportunities yet. Click <strong>Scan Opportunities</strong> or import a brief.
              </p>
            ) : (
              topOpps.map((item) => (
                <Link
                  key={item.id}
                  href="/pro/opportunities"
                  className="flex flex-col gap-1.5 border border-[#E4E4E7] bg-[#FAFAF9] p-3 no-underline transition-colors hover:border-[#09090B]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-[#09090B]">
                      {item.opportunity.brand_or_client}
                    </span>
                    <Badge
                      color={item.fit_score >= 80 ? "success" : "brand"}
                      className="shrink-0 font-mono text-[11px] tabular-nums"
                    >
                      {item.fit_score}% fit
                    </Badge>
                  </div>
                  <p className="line-clamp-1 text-xs text-[#52525B]" dir="auto">
                    {item.opportunity.title}
                  </p>
                  <div className="flex items-center justify-between gap-2 pt-1 font-mono text-[11px] text-[#71717A]">
                    <span className="uppercase">{item.opportunity.source}</span>
                    <span className="font-medium tabular-nums text-[#15704C]">
                      {item.opportunity.budget_millimes != null
                        ? formatMillimesForChat(item.opportunity.budget_millimes)
                        : item.opportunity.compensation_text}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation Strip */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/pro/services"
          className="flex items-center justify-between gap-3 border border-[#E4E4E7] bg-white p-4 no-underline transition-colors hover:border-[#09090B]"
        >
          <div className="flex items-center gap-3">
            <Briefcase01 className="size-4 text-[#1B8A5E]" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-[#09090B]">Service Packages</p>
              <p className="text-xs text-[#52525B]">Rates, floor limits &amp; prep templates</p>
            </div>
          </div>
          <span className="font-mono text-xs text-[#52525B]">→</span>
        </Link>

        <Link
          href="/pro/inquiries"
          className="flex items-center justify-between gap-3 border border-[#E4E4E7] bg-white p-4 no-underline transition-colors hover:border-[#09090B]"
        >
          <div className="flex items-center gap-3">
            <ClipboardCheck className="size-4 text-[#1B8A5E]" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-[#09090B]">Client Inquiries</p>
              <p className="text-xs text-[#52525B]">Dates, locations &amp; package delivery</p>
            </div>
          </div>
          <span className="font-mono text-xs text-[#52525B]">→</span>
        </Link>

        <Link
          href="/pro/persona"
          className="flex items-center justify-between gap-3 border border-[#E4E4E7] bg-white p-4 no-underline transition-colors hover:border-[#09090B]"
        >
          <div className="flex items-center gap-3">
            <Stars01 className="size-4 text-[#1B8A5E]" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-[#09090B]">My Style &amp; AI</p>
              <p className="text-xs text-[#52525B]">Derja/FR voice samples &amp; +216 alerts</p>
            </div>
          </div>
          <span className="font-mono text-xs text-[#52525B]">→</span>
        </Link>
      </div>
    </div>
  );
}
