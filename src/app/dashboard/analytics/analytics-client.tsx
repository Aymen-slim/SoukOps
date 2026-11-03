"use client";

import { BarChartSquare01 as BarChart3 } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import { Table, TableCard } from "@/components/application/table/table";
import { Alert } from "@/components/foundations/alert/alert";
import { Metric } from "@/components/foundations/metric/metric";
import type { AnalyticsPayload, SalesBucket } from "@/lib/dashboard/analytics";
import { money } from "../bits";
import { usePoll } from "../use-poll";

export function AnalyticsClient() {
  const { data, error } = usePoll<AnalyticsPayload>("/api/dashboard/analytics", 5000);
  const totals = data?.totals;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">Overview</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">Sales</h1>
        <p className="mt-0.5 text-sm text-tertiary">This month, this year, and all time. Every number comes from stored orders.</p>
      </div>

      {error ? <Alert color="error">{error}</Alert> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <Period title="This month" bucket={data?.periods.month} />
        <Period title="This year" bucket={data?.periods.year} />
        <Period title="All time" bucket={data?.periods.all} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Orders" value={totals ? String(totals.orders) : "…"} />
        <Metric label="Revenue (totals)" value={totals ? money(totals.revenueMillimes) : "…"} />
        <Metric label="Discounts granted" value={totals ? money(totals.discountMillimes) : "…"} />
        <Metric label="Return rate" value={totals?.returnRatePercent != null ? `${totals.returnRatePercent}%` : "—"} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <TableCard.Root>
          <TableCard.Header
            title="Orders by status"
            badge={`${(data?.ordersByStatus ?? []).reduce((sum, row) => sum + row.count, 0)} orders`}
            description="Including statuses after First Delivery sync."
          />
          <Table aria-label="Orders by status">
            <Table.Header>
              <Table.Head label="Status" isRowHeader />
              <Table.Head label="Count" />
            </Table.Header>
            <Table.Body>
              {(data?.ordersByStatus ?? []).map((row) => (
                <Table.Row key={row.status} id={row.status}>
                  <Table.Cell>
                    <span className="font-mono text-xs text-primary">{row.status}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color="gray" className="font-mono tabular-nums">{row.count}</Badge>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          {data && data.ordersByStatus.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-tertiary">No orders yet.</p>
          ) : null}
        </TableCard.Root>

        <Card>
          <CardHeader className="border-b border-secondary/70">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-4 text-brand-secondary" />
              Risk & activity
            </CardTitle>
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

function Period({ title, bucket }: { title: string; bucket?: SalesBucket }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{bucket ? `${bucket.orders} orders` : "…"}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <Row label="Revenue" value={bucket ? money(bucket.revenueMillimes) : "…"} />
        <Row label="Discounts" value={bucket ? money(bucket.discountMillimes) : "…"} />
        <Row label="Delivery" value={bucket ? money(bucket.deliveryMillimes) : "…"} />
      </CardContent>
    </Card>
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
