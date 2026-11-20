"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarPlus01, ClipboardCheck, MarkerPin01, Send01 } from "@untitledui/icons";
import { invalidateDashboardUrl, useDashboardResource } from "@/app/dashboard/use-poll";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { Alert } from "@/components/foundations/alert/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import { parseRequestedDateToSlot } from "@/lib/calendar/date-parser";
import { formatMillimesForChat } from "@/lib/domain/pricing";
import type { ServiceInquiryStatus } from "@/lib/pro/types";

interface InquiryRow {
  id: string;
  conversation_id: string | null;
  service_id: string | null;
  serviceTitle: string | null;
  client_name: string | null;
  client_phone: string | null;
  requested_date: string | null;
  location_text: string | null;
  budget_millimes: number | null;
  scope_summary: string;
  status: ServiceInquiryStatus;
  ai_summary: string;
  updated_at: string;
}

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "discussing", label: "Discussing" },
  { value: "details_sent", label: "Details Sent" },
  { value: "needs_approval", label: "Needs Approval" },
  { value: "confirmed", label: "Confirmed" },
  { value: "declined", label: "Declined" },
];

function badgeColorForStatus(status: ServiceInquiryStatus): "brand" | "success" | "warning" | "error" | "gray" {
  if (status === "confirmed") return "success";
  if (status === "details_sent") return "brand";
  if (status === "needs_approval") return "warning";
  if (status === "declined") return "error";
  return "gray";
}

export default function ProInquiriesPage() {
  const { data, error, reload } = useDashboardResource<{ inquiries: InquiryRow[] }>("/api/pro/inquiries");
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const allInquiries = data?.inquiries ?? [];
  const inquiries = filter === "all" ? allInquiries : allInquiries.filter((i) => i.status === filter);

  async function updateInquiry(
    id: string,
    patch: { status?: ServiceInquiryStatus; sendDetailsToClient?: boolean },
  ) {
    setBusyId(id);
    setFeedback(null);
    try {
      const res = await fetch("/api/pro/inquiries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const body = (await res.json().catch(() => null)) as
        | { detailsDispatched?: boolean; error?: string }
        | null;
      if (!res.ok) {
        setFeedback({ kind: "error", text: body?.error ?? "Could not update inquiry." });
        return;
      }
      invalidateDashboardUrl("/api/pro/inquiries");
      await reload();
      setFeedback({
        kind: "success",
        text: body?.detailsDispatched
          ? "Service package details & location pin sent to the client."
          : "Inquiry status updated.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function addInquiryToCalendar(inq: InquiryRow) {
    setBusyId(inq.id);
    setFeedback(null);
    try {
      const parsedSlot = parseRequestedDateToSlot(inq.requested_date ?? undefined, { durationMinutes: 60 });
      const fallbackStart = new Date(Date.now() + 24 * 3_600_000);
      fallbackStart.setUTCHours(9, 0, 0, 0); // 10:00 Africa/Tunis
      const startAt = parsedSlot?.startAt ?? fallbackStart.toISOString();
      const endAt = parsedSlot?.endAt ?? new Date(fallbackStart.getTime() + 60 * 60_000).toISOString();

      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: [inq.serviceTitle ?? inq.scope_summary ?? "Client Booking", inq.client_name ? `— ${inq.client_name}` : null]
            .filter(Boolean)
            .join(" "),
          description: [
            inq.scope_summary ? `Scope: ${inq.scope_summary}` : null,
            inq.budget_millimes != null ? `Rate: ${formatMillimesForChat(inq.budget_millimes)}` : null,
            inq.requested_date ? `Requested: ${inq.requested_date}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          start_at: startAt,
          end_at: endAt,
          location: inq.location_text ?? "",
          event_type: "appointment",
          status: inq.status === "confirmed" ? "confirmed" : "tentative",
          source: "inquiry",
          conversation_id: inq.conversation_id,
          inquiry_id: inq.id,
          client_name: inq.client_name,
          client_phone: inq.client_phone,
          pushToGoogle: true,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        event?: { google_event_id?: string | null };
        conflicts?: Array<{ title: string }>;
        error?: string;
      } | null;
      if (!res.ok) {
        setFeedback({ kind: "error", text: body?.error ?? "Could not add booking to calendar." });
        return;
      }
      const conflictNote = body?.conflicts?.length ? ` (Overlaps with "${body.conflicts[0]!.title}")` : "";
      const gNote = body?.event?.google_event_id ? " & pushed to Google Calendar" : "";
      setFeedback({
        kind: "success",
        text: `Added straight to your Calendar${gNote}${parsedSlot ? ` (${parsedSlot.label})` : ""}${conflictNote}.`,
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-[#E4E4E7] pb-5">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#52525B]">
          Structured Intake
        </p>
        <h1 className="mt-1.5 text-2xl font-medium tracking-[-0.03em] text-[#09090B] sm:text-3xl">
          Client Service Inquiries
        </h1>
        <p className="mt-1 text-sm text-[#52525B]">
          Every client DM discussion is structured into dates, locations, budgets, and package delivery status.
        </p>
      </div>

      {error ? <Alert color="error">{error}</Alert> : null}
      {feedback ? <Alert color={feedback.kind}>{feedback.text}</Alert> : null}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-1 border border-[#E4E4E7] bg-white p-1">
        {STATUS_FILTERS.map((tab) => {
          const active = filter === tab.value;
          const count =
            tab.value === "all"
              ? allInquiries.length
              : allInquiries.filter((i) => i.status === tab.value).length;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              className={`inline-flex cursor-pointer items-center gap-1.5 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.06em] transition-colors ${
                active ? "bg-[#1D1E1A] text-white" : "text-[#52525B] hover:bg-[#FAFAF9] hover:text-[#09090B]"
              }`}
            >
              {tab.label}
              <span className="tabular-nums opacity-75">({count})</span>
            </button>
          );
        })}
      </div>

      {inquiries.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[#52525B]">
            No inquiries in this view yet. Incoming client DMs will appear here automatically.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {inquiries.map((inq) => (
            <Card key={inq.id}>
              <CardHeader className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color={badgeColorForStatus(inq.status)} className="font-mono text-[11px] uppercase">
                      {inq.status.replace(/_/g, " ")}
                    </Badge>
                    {inq.serviceTitle ? (
                      <span className="font-mono text-xs text-[#15704C]">{inq.serviceTitle}</span>
                    ) : null}
                  </div>
                  <CardTitle className="mt-2 flex items-center gap-2 text-base" dir="auto">
                    <ClipboardCheck className="size-4 shrink-0 text-brand-secondary" aria-hidden="true" />
                    {inq.client_name ?? "New Client"}
                    {inq.client_phone ? (
                      <span className="font-mono text-xs font-normal text-[#52525B]">{inq.client_phone}</span>
                    ) : null}
                  </CardTitle>
                  <CardDescription dir="auto">{inq.scope_summary}</CardDescription>
                </div>

                <div className="text-right font-mono tabular-nums">
                  {inq.budget_millimes != null ? (
                    <p className="text-base font-semibold text-[#09090B]">
                      {formatMillimesForChat(inq.budget_millimes)}
                    </p>
                  ) : (
                    <p className="text-xs text-[#71717A]">Rate TBD</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-[#71717A]">
                    {new Date(inq.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </CardHeader>

              <CardContent className="flex flex-wrap items-center justify-between gap-4 border-t border-[#E4E4E7] pt-3.5 text-sm">
                <div className="flex flex-wrap items-center gap-4 text-xs text-[#52525B]">
                  {inq.requested_date ? (
                    <span>
                      <strong className="font-mono uppercase text-[#09090B]">Date:</strong> {inq.requested_date}
                    </span>
                  ) : null}
                  {inq.location_text ? (
                    <span className="inline-flex items-center gap-1">
                      <MarkerPin01 className="size-3.5 text-[#1B8A5E]" aria-hidden="true" />
                      {inq.location_text}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <NativeSelect
                    aria-label={`Status for ${inq.client_name ?? "client"}`}
                    size="sm"
                    className="w-40"
                    value={inq.status}
                    disabled={busyId === inq.id}
                    onChange={(e) =>
                      void updateInquiry(inq.id, { status: e.target.value as ServiceInquiryStatus })
                    }
                    options={[
                      { value: "discussing", label: "Discussing" },
                      { value: "details_sent", label: "Details Sent" },
                      { value: "needs_approval", label: "Needs Approval" },
                      { value: "confirmed", label: "Confirmed" },
                      { value: "declined", label: "Declined" },
                    ]}
                  />
                  <Button
                    size="sm"
                    color="secondary"
                    iconLeading={CalendarPlus01}
                    isDisabled={busyId === inq.id}
                    onClick={() => void addInquiryToCalendar(inq)}
                  >
                    Add to Calendar
                  </Button>
                  {inq.conversation_id ? (
                    <>
                      <Button
                        size="sm"
                        color="primary"
                        iconLeading={Send01}
                        isDisabled={busyId === inq.id}
                        onClick={() => void updateInquiry(inq.id, { sendDetailsToClient: true })}
                      >
                        Send Details to Client
                      </Button>
                      <Link href="/pro/inbox" className="gs-link-mono ml-1">
                        <span>Open DM</span>
                        <span aria-hidden="true">→</span>
                      </Link>
                    </>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
