"use client";

import { useState } from "react";
import { CheckCircle, Plus, RefreshCw01, Send01, Target04 } from "@untitledui/icons";
import { invalidateDashboardUrl, useDashboardResource } from "@/app/dashboard/use-poll";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { Alert } from "@/components/foundations/alert/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import { Modal } from "@/components/foundations/modal/modal";
import { formatMillimesForChat } from "@/lib/domain/pricing";
import type { OpportunityCategory, OpportunityMatchStatus } from "@/lib/pro/types";

interface OpportunityMatchItem {
  id: string;
  opportunity_id: string;
  fit_score: number;
  urgency: "low" | "medium" | "high" | "critical";
  fit_reasons: string[];
  draft_pitch: string;
  status: OpportunityMatchStatus;
  opportunity: {
    id: string;
    source: "dm" | "comment" | "board" | "manual";
    conversation_id: string | null;
    title: string;
    brand_or_client: string;
    category: OpportunityCategory;
    description: string;
    compensation_text: string;
    budget_millimes: number | null;
    deadline_at: string | null;
    apply_url: string | null;
  };
}

interface OpportunitiesResponse {
  opportunities: OpportunityMatchItem[];
  counts: { total: number; dm: number; board: number };
}

export default function ProOpportunitiesPage() {
  const { data, error, reload } = useDashboardResource<OpportunitiesResponse>("/api/pro/opportunities");
  const items = data?.opportunities ?? [];

  const [tab, setTab] = useState<"all" | "dm" | "board">("all");
  const [pitchDrafts, setPitchDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const [briefForm, setBriefForm] = useState({
    title: "",
    brandOrClient: "",
    category: "sponsorship" as OpportunityCategory,
    description: "",
    budgetDt: "",
    compensationText: "",
    applyUrl: "",
  });

  const filtered = items.filter((item) => {
    if (tab === "dm") return item.opportunity.source === "dm" || item.opportunity.source === "comment";
    if (tab === "board") return item.opportunity.source === "board" || item.opportunity.source === "manual";
    return true;
  });

  async function scanOpportunities() {
    setScanning(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/pro/opportunities/scan", { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { newMatches?: number; alertsCreated?: number; error?: string }
        | null;
      if (!res.ok) {
        setFeedback({ kind: "error", text: body?.error ?? "Scan failed." });
        return;
      }
      invalidateDashboardUrl("/api/pro/");
      await reload();
      setFeedback({
        kind: "success",
        text: `Radar scan finished: ${body?.newMatches ?? 0} new match(es), ${body?.alertsCreated ?? 0} alert(s) triggered.`,
      });
    } finally {
      setScanning(false);
    }
  }

  async function ingestBrief() {
    setImporting(true);
    setFeedback(null);
    try {
      const dtNum = Number(briefForm.budgetDt.trim().replace(",", "."));
      const budgetMillimes =
        briefForm.budgetDt.trim() && Number.isFinite(dtNum) && dtNum >= 0
          ? Math.round(dtNum * 1000)
          : null;
      const res = await fetch("/api/pro/opportunities/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "board",
          title: briefForm.title.trim(),
          brandOrClient: briefForm.brandOrClient.trim() || "External Brief",
          category: briefForm.category,
          description: briefForm.description.trim(),
          budgetMillimes,
          compensationText: briefForm.compensationText.trim() || undefined,
          applyUrl: briefForm.applyUrl.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { evaluation?: { fitScore?: number }; error?: string }
        | null;
      if (!res.ok) {
        setFeedback({ kind: "error", text: body?.error ?? "Could not ingest brief." });
        return;
      }
      setImportOpen(false);
      setBriefForm({
        title: "",
        brandOrClient: "",
        category: "sponsorship",
        description: "",
        budgetDt: "",
        compensationText: "",
        applyUrl: "",
      });
      invalidateDashboardUrl("/api/pro/");
      await reload();
      setFeedback({
        kind: "success",
        text: `Brief scored at ${body?.evaluation?.fitScore ?? 0}% match and drafted in your voice.`,
      });
    } finally {
      setImporting(false);
    }
  }

  async function applyToOpportunity(item: OpportunityMatchItem) {
    setBusyId(item.id);
    setFeedback(null);
    try {
      const pitchText = (pitchDrafts[item.id] ?? item.draft_pitch).trim();
      const res = await fetch(`/api/pro/opportunities/${item.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitchText, sendViaDm: true }),
      });
      const body = (await res.json().catch(() => null)) as
        | { dmSent?: boolean; error?: string }
        | null;
      if (!res.ok) {
        setFeedback({ kind: "error", text: body?.error ?? "Could not apply." });
        return;
      }
      invalidateDashboardUrl("/api/pro/");
      await reload();
      setFeedback({
        kind: "success",
        text: body?.dmSent
          ? "Approved pitch sent directly to the client DM and marked as Applied."
          : "Pitch approved and marked as Applied.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function updateMatch(matchId: string, patch: { status?: "new" | "shortlisted" | "dismissed"; draftPitch?: string }) {
    setBusyId(matchId);
    setFeedback(null);
    try {
      const res = await fetch("/api/pro/opportunities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, ...patch }),
      });
      if (res.ok) {
        invalidateDashboardUrl("/api/pro/");
        await reload();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E4E4E7] pb-5">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#52525B]">
            Opportunity Radar &amp; Board
          </p>
          <h1 className="mt-1.5 text-2xl font-medium tracking-[-0.03em] text-[#09090B] sm:text-3xl">
            Scored Deals, Bookings &amp; Briefs
          </h1>
          <p className="mt-1 text-sm text-[#52525B]">
            AI scores inbound DMs and external briefs against your goals &amp; rate floor, drafting pitches for your explicit 1-click approval.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button color="secondary" size="sm" iconLeading={Plus} onClick={() => setImportOpen(true)}>
            Add / Import Brief
          </Button>
          <Button
            color="primary"
            size="sm"
            iconLeading={RefreshCw01}
            isDisabled={scanning}
            onClick={() => void scanOpportunities()}
          >
            {scanning ? "Scanning…" : "Scan DMs & Board"}
          </Button>
        </div>
      </div>

      {error ? <Alert color="error">{error}</Alert> : null}
      {feedback ? <Alert color={feedback.kind}>{feedback.text}</Alert> : null}

      {/* Source Tabs */}
      <div role="tablist" aria-label="Opportunity source filter" className="inline-flex w-fit flex-wrap gap-1 border border-[#E4E4E7] bg-white p-1">
        {(
          [
            { id: "all", label: "All", count: data?.counts.total ?? items.length },
            { id: "dm", label: "Detected in DMs", count: data?.counts.dm ?? 0 },
            { id: "board", label: "Opportunity Board", count: data?.counts.board ?? 0 },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex cursor-pointer items-center gap-1.5 px-3.5 py-2 font-mono text-xs uppercase tracking-[0.06em] transition-colors ${
              tab === t.id
                ? "bg-[#1D1E1A] text-white"
                : "text-[#52525B] hover:bg-[#FAFAF9] hover:text-[#09090B]"
            }`}
          >
            {t.label}
            <span className="tabular-nums opacity-75">({t.count})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[#52525B]">
            No opportunities in this tab yet. Run <strong>Scan DMs &amp; Board</strong> or click <strong>Add / Import Brief</strong>.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((item) => {
            const pitchValue = pitchDrafts[item.id] ?? item.draft_pitch;
            const applied = item.status === "applied";
            return (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          color={item.fit_score >= 80 ? "success" : "brand"}
                          className="font-mono text-[11px] tabular-nums uppercase"
                        >
                          {item.fit_score}% Fit
                        </Badge>
                        <Badge
                          color={item.urgency === "critical" || item.urgency === "high" ? "warning" : "gray"}
                          className="font-mono text-[11px] uppercase"
                        >
                          {item.urgency}
                        </Badge>
                        <Badge color="gray" className="font-mono text-[11px] uppercase">
                          {item.opportunity.source} · {item.opportunity.category.replace(/_/g, " ")}
                        </Badge>
                        {applied ? (
                          <Badge color="success" className="font-mono text-[11px] uppercase">
                            Applied
                          </Badge>
                        ) : null}
                      </div>
                      <CardTitle className="mt-2 flex items-center gap-2 text-base" dir="auto">
                        <Target04 className="size-4 shrink-0 text-brand-secondary" aria-hidden="true" />
                        {item.opportunity.title}
                      </CardTitle>
                      <CardDescription>
                        {item.opportunity.brand_or_client}
                        {item.opportunity.deadline_at
                          ? ` · Deadline: ${new Date(item.opportunity.deadline_at).toLocaleDateString()}`
                          : ""}
                      </CardDescription>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <p className="text-base font-semibold text-[#15704C]">
                        {item.opportunity.budget_millimes != null
                          ? formatMillimesForChat(item.opportunity.budget_millimes)
                          : item.opportunity.compensation_text || "Negotiable"}
                      </p>
                      <p className="mt-0.5 text-[11px] uppercase text-[#71717A]">{item.status}</p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-col gap-4">
                  <p className="text-sm text-[#27272A]" dir="auto">
                    {item.opportunity.description}
                  </p>

                  {item.fit_reasons.length > 0 ? (
                    <div className="border border-[#E4E4E7] bg-[#FAFAF9] p-3">
                      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#71717A]">
                        Why it fits your profile
                      </p>
                      <ul className="mt-1.5 space-y-1 text-xs text-[#27272A]">
                        {item.fit_reasons.map((r) => (
                          <li key={r} className="flex items-start gap-2">
                            <span className="font-mono text-[#1B8A5E]">→</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <TextArea
                    label="Style-Matched Pitch Draft (editable before sending)"
                    rows={3}
                    value={pitchValue}
                    onChange={(val) => setPitchDrafts((prev) => ({ ...prev, [item.id]: val }))}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E4E4E7] pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        color="primary"
                        iconLeading={applied ? CheckCircle : Send01}
                        isDisabled={busyId === item.id || !pitchValue.trim()}
                        onClick={() => void applyToOpportunity(item)}
                      >
                        {applied
                          ? "Re-Send / Update Pitch"
                          : item.opportunity.conversation_id
                            ? "Approve & Send to DM"
                            : "Approve & Mark Applied"}
                      </Button>
                      {!applied ? (
                        <Button
                          size="sm"
                          color="secondary"
                          isDisabled={busyId === item.id}
                          onClick={() =>
                            void updateMatch(item.id, {
                              status: "shortlisted",
                              draftPitch: pitchValue.trim(),
                            })
                          }
                        >
                          Shortlist &amp; Save Draft
                        </Button>
                      ) : null}
                      {item.opportunity.apply_url ? (
                        <a
                          href={item.opportunity.apply_url}
                          target="_blank"
                          rel="noreferrer"
                          className="gs-link-mono ml-1"
                        >
                          <span>External brief</span>
                          <span aria-hidden="true">→</span>
                        </a>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      color="tertiary"
                      isDisabled={busyId === item.id}
                      onClick={() => void updateMatch(item.id, { status: "dismissed" })}
                    >
                      Dismiss
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Import Brief Modal */}
      <Modal
        isOpen={importOpen}
        onOpenChange={setImportOpen}
        title="Add / Import Opportunity Brief"
        description="Paste a brand brief, event invite, or client RFP — AI will score fit and draft a pitch in your voice."
        className="max-w-lg"
        footer={
          <>
            <Button size="sm" color="secondary" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              color="primary"
              isDisabled={importing || briefForm.title.trim().length < 3 || briefForm.description.trim().length < 5}
              onClick={() => void ingestBrief()}
            >
              {importing ? "Scoring…" : "Score & Add Brief"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <Input
            label="Brief Title"
            placeholder="e.g. Campagne Lancement Fintech — 2 Reels Derja"
            value={briefForm.title}
            onChange={(val) => setBriefForm((f) => ({ ...f, title: val }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Brand / Client"
              placeholder="e.g. PayTunisia"
              value={briefForm.brandOrClient}
              onChange={(val) => setBriefForm((f) => ({ ...f, brandOrClient: val }))}
            />
            <NativeSelect
              label="Category"
              value={briefForm.category}
              onChange={(e) =>
                setBriefForm((f) => ({ ...f, category: e.target.value as OpportunityCategory }))
              }
              options={[
                { value: "sponsorship", label: "Sponsorship" },
                { value: "shoot", label: "Shoot / Production" },
                { value: "medical_talk", label: "Medical Talk / Workshop" },
                { value: "partnership", label: "Partnership / Retainer" },
                { value: "vip_client", label: "VIP Client" },
                { value: "custom", label: "Custom" },
              ]}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Budget (DT, optional)"
              placeholder="e.g. 2400"
              value={briefForm.budgetDt}
              onChange={(val) => setBriefForm((f) => ({ ...f, budgetDt: val }))}
            />
            <Input
              label="Compensation Note"
              placeholder="e.g. 2400DT + hébergement"
              value={briefForm.compensationText}
              onChange={(val) => setBriefForm((f) => ({ ...f, compensationText: val }))}
            />
          </div>
          <TextArea
            label="Brief Description"
            rows={3}
            placeholder="Deliverables, city, dates, audience requirements..."
            value={briefForm.description}
            onChange={(val) => setBriefForm((f) => ({ ...f, description: val }))}
          />
          <Input
            label="External Apply URL (optional)"
            placeholder="https://..."
            value={briefForm.applyUrl}
            onChange={(val) => setBriefForm((f) => ({ ...f, applyUrl: val }))}
          />
        </div>
      </Modal>
    </div>
  );
}
