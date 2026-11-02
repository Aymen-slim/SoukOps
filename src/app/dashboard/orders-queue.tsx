"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, CheckCircle as CheckCircle2, Clock, Package, AlertOctagon as ShieldAlert, Truck01 as Truck } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Card, CardContent } from "@/components/foundations/card/card";
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
          <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">
            Seller Console
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
            Orders
          </h1>
          <p className="mt-0.5 text-sm text-tertiary">
            Approve, check the risk, then send.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2.5 sm:flex sm:items-center">
          <div className="flex items-center gap-2.5 rounded-xl border border-secondary bg-primary px-3.5 py-2 shadow-2xs">
            <Clock className="size-4 text-brand-secondary" />
            <div>
              <p className="font-mono text-sm font-semibold tabular-nums leading-none">
                {awaitingCount}
              </p>
              <p className="mt-0.5 text-[10px] text-tertiary">To approve</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-secondary bg-primary px-3.5 py-2 shadow-2xs">
            <Truck className="size-4 text-utility-green-700" />
            <div>
              <p className="font-mono text-sm font-semibold tabular-nums leading-none">
                {shippedCount}
              </p>
              <p className="mt-0.5 text-[10px] text-tertiary">Waybills</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-secondary bg-primary px-3.5 py-2 shadow-2xs">
            <ShieldAlert className="size-4 text-error-primary" />
            <div>
              <p className="font-mono text-sm font-semibold tabular-nums leading-none">
                {redRiskCount}
              </p>
              <p className="mt-0.5 text-[10px] text-tertiary">Red risk</p>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-utility-red-200 bg-error-primary px-4 py-2.5 text-sm text-error-primary">
          {error}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="rounded-xl border border-utility-red-200 bg-error-primary px-4 py-2.5 text-sm text-error-primary">
          {actionError}
        </p>
      ) : null}

      {data && orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Package className="size-8 text-tertiary/60" />
            <p className="text-sm font-medium text-primary">No orders waiting.</p>
            <p className="text-xs text-tertiary">
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
                    className="size-24 shrink-0 rounded-xl border border-secondary bg-checkerboard object-cover"
                  />
                ) : (
                  <div className="flex size-24 shrink-0 items-center justify-center rounded-xl border border-secondary bg-tertiary text-tertiary">
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
                      className="text-base font-semibold tracking-tight text-primary hover:text-brand-secondary hover:underline"
                    >
                      {order.customerName ?? "Buyer"} — {order.designation ?? "Order"}
                    </Link>
                    <span className="rounded-md bg-tertiary px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary">
                      {money(order.totalMillimes)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <RiskBadge level={order.riskLevel} score={order.riskScore} />
                    {order.job ? (
                      <Badge color={order.job.status === "failed" ? "error" : "blue"}>
                        {JOB_LABEL[order.job.status] ?? order.job.status}
                      </Badge>
                    ) : null}
                    {order.shipment ? (
                      <Badge color="gray" className="font-mono tabular-nums">
                        <CheckCircle2 className="size-3 text-utility-green-600" />
                        Code {order.shipment.barcode}
                      </Badge>
                    ) : null}
                    {order.governorate ? (
                      <span className="text-xs text-tertiary">
                        {order.governorate}
                        {order.landmark ? ` · ${order.landmark}` : ""}
                      </span>
                    ) : null}
                  </div>

                  {order.riskReasons[0] ? (
                    <span className="text-xs text-tertiary">{order.riskReasons[0]}</span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  {canApprove ? (
                    <Button
                      type="button"
                      isDisabled={busy === order.id}
                      onClick={() => void approve(order.id)}
                    >
                      Approve
                    </Button>
                  ) : (
                    <Link
                      href={`/dashboard/orders/${order.id}`}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-secondary bg-primary px-3 text-xs font-medium text-primary shadow-2xs transition-colors hover:bg-tertiary"
                    >
                      <span>Open</span>
                      <ArrowUpRight className="size-3.5 text-tertiary" />
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
