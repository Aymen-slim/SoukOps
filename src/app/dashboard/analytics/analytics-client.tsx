"use client";

import { BarChartSquare01 as BarChart3 } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import type { AnalyticsPayload } from "@/lib/dashboard/analytics";
import { money } from "../bits";
import { usePoll } from "../use-poll";

export function AnalyticsClient() {
  const { data, error } = usePoll<AnalyticsPayload>("/api/dashboard/analytics", 5000);
  const totals = data?.totals;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">Overview</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">Analytics</h1>
        <p className="mt-0.5 text-sm text-tertiary">Numbers computed from stored orders and events.</p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-utility-red-200 bg-error-primary px-4 py-2.5 text-sm text-error-primary">{error}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Orders" value={totals ? String(totals.orders) : "…"} />
        <Kpi label="Revenue (totals)" value={totals ? money(totals.revenueMillimes) : "…"} />
        <Kpi label="Discounts granted" value={totals ? money(totals.discountMillimes) : "…"} />
        <Kpi label="Return rate" value={totals?.returnRatePercent != null ? `${totals.returnRatePercent}%` : "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-secondary/70">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-4 text-brand-secondary" />
              Orders by status
            </CardTitle>
            <CardDescription>Including statuses after First Delivery sync.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {data && data.ordersByStatus.length === 0 ? <p className="text-tertiary">No orders yet.</p> : null}
            {(data?.ordersByStatus ?? []).map((row) => (
              <div key={row.status} className="flex items-center justify-between gap-4">
                <span className="font-mono text-xs">{row.status}</span>
                <Badge color="gray" className="font-mono tabular-nums">{row.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-secondary/70">
            <CardTitle>Risk & activity</CardTitle>
            <CardDescription>Deliveries, returns and signals feeding the score.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {(data?.ordersByRisk ?? []).map((row) => (
                <Badge key={row.level} color={row.level === "red" ? "error" : row.level === "yellow" ? "warning" : row.level === "green" ? "success" : "gray"}>
                  {row.level}: {row.count}
                </Badge>
              ))}
            </div>
            <Row label="Delivered (events)" value={String(totals?.delivered ?? 0)} />
            <Row label="Returns (events)" value={String(totals?.returned ?? 0)} />
            <Row label="Cancellations (events)" value={String(totals?.cancelled ?? 0)} />
            <Row label="Conversations" value={String(data?.activity.conversations ?? 0)} />
            <Row label="Seller handovers" value={String(data?.activity.handovers ?? 0)} />
            <Row label="Unmatched demands" value={String(data?.activity.unmatchedDemands ?? 0)} />
            <Row label="Landmark misses" value={String(data?.activity.landmarkMisses ?? 0)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-secondary bg-primary px-3.5 py-3 shadow-2xs">
      <p className="font-mono text-base font-semibold tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-[10px] text-tertiary">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-tertiary">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
