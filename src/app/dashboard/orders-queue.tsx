"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, CheckCircle2, Clock, Package, ShieldAlert, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { QueueOrder } from "@/lib/dashboard/orders";
import { JOB_LABEL, OsmThumb, RiskBadge, money } from "./bits";
import { usePoll } from "./use-poll";

export function OrdersQueue() {
  const router = useRouter();
  const { data, error } = usePoll<{ orders: QueueOrder[] }>("/api/dashboard/orders");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const orders = data?.orders ?? [];

  async function approve(id: string) {
    setBusy(id);
    setActionError(null);
    const res = await fetch(`/api/orders/${id}/approve`, { method: "POST" });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    setBusy(null);
    if (!res.ok) setActionError(body?.error ?? "Couldn't approve.");
    else router.push(`/dashboard/orders/${id}`);
  }

  const awaitingCount = orders.filter(
    (o) => o.status === "CONFIRMED_BY_BUYER" && !o.job && !o.shipment,
  ).length;
  const shippedCount = orders.filter((o) => Boolean(o.shipment)).length;
  const redRiskCount = orders.filter((o) => o.riskLevel === "red").length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header & KPI Strip */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-terracotta uppercase">
            Seller Console
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Orders
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Approve, check the risk, then send.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2.5 sm:flex sm:items-center">
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2 shadow-2xs">
            <Clock className="size-4 text-brand-terracotta" />
            <div>
              <p className="font-mono text-sm font-semibold tabular-nums leading-none">
                {awaitingCount}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">To approve</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2 shadow-2xs">
            <Truck className="size-4 text-emerald-700" />
            <div>
              <p className="font-mono text-sm font-semibold tabular-nums leading-none">
                {shippedCount}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Waybills</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2 shadow-2xs">
            <ShieldAlert className="size-4 text-status-danger-fg" />
            <div>
              <p className="font-mono text-sm font-semibold tabular-nums leading-none">
                {redRiskCount}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Red risk</p>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-fg">
          {error}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="rounded-xl border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-fg">
          {actionError}
        </p>
      ) : null}

      {data && orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Package className="size-8 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">No orders waiting.</p>
            <p className="text-xs text-muted-foreground">
              Buyer orders confirmed with Akked in the simulator will appear here automatically.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3">
        {orders.map((order) => {
          const canApprove = order.status === "CONFIRMED_BY_BUYER" && !order.job && !order.shipment;
          return (
            <Card key={order.id} className="transition-shadow hover:shadow-md">
              <CardContent className="flex flex-wrap items-center gap-4">
                {order.cropUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={order.cropUrl}
                    alt=""
                    className="size-24 shrink-0 rounded-xl border border-border bg-checkerboard object-cover"
                  />
                ) : (
                  <div className="flex size-24 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
                    <Package className="size-6 opacity-40" />
                  </div>
                )}

                {order.lat != null && order.lng != null ? (
                  <OsmThumb lat={order.lat} lng={order.lng} />
                ) : null}

                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/orders/${order.id}`}
                      className="text-base font-semibold tracking-tight text-foreground hover:text-brand-terracotta hover:underline"
                    >
                      {order.customerName ?? "Buyer"} — {order.designation ?? "Order"}
                    </Link>
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
                      {money(order.totalMillimes)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <RiskBadge level={order.riskLevel} score={order.riskScore} />
                    {order.job ? (
                      <Badge variant={order.job.status === "failed" ? "destructive" : "info"}>
                        {JOB_LABEL[order.job.status] ?? order.job.status}
                      </Badge>
                    ) : null}
                    {order.shipment ? (
                      <Badge variant="outline" className="font-mono tabular-nums">
                        <CheckCircle2 className="size-3 text-emerald-600" />
                        Code {order.shipment.barcode}
                      </Badge>
                    ) : null}
                    {order.governorate ? (
                      <span className="text-xs text-muted-foreground">
                        {order.governorate}
                        {order.landmark ? ` · ${order.landmark}` : ""}
                      </span>
                    ) : null}
                  </div>

                  {order.riskReasons[0] ? (
                    <span className="text-xs text-muted-foreground">{order.riskReasons[0]}</span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  {canApprove ? (
                    <Button
                      type="button"
                      disabled={busy === order.id}
                      onClick={() => void approve(order.id)}
                    >
                      Approve
                    </Button>
                  ) : (
                    <Link
                      href={`/dashboard/orders/${order.id}`}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-muted"
                    >
                      <span>Open</span>
                      <ArrowUpRight className="size-3.5 text-muted-foreground" />
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
