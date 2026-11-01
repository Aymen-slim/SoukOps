"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  MapPin,
  MessageSquare,
  Receipt,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { StaticPinMap } from "@/components/static-pin-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { QueueOrder, TranscriptLine } from "@/lib/dashboard/orders";
import { JOB_LABEL, RiskBadge, money } from "../../bits";
import { usePoll } from "../../use-poll";

export function OrderDetail({ id }: { id: string }) {
  const { data, error, reload } = usePoll<{ order: QueueOrder & { messages: TranscriptLine[] } }>(
    `/api/dashboard/orders/${id}`,
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const order = data?.order;

  async function post(path: string) {
    setBusy(true);
    setActionError(null);
    const res = await fetch(path, { method: "POST" });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res.ok) setActionError(body?.error ?? "Action failed.");
    await reload();
  }

  if (error && !order) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-fg"
      >
        {error}
      </p>
    );
  }
  if (!order) return <p className="text-sm text-muted-foreground">Loading the order…</p>;

  const canApprove = order.status === "CONFIRMED_BY_BUYER" && !order.job && !order.shipment;
  const canConfirm = order.job?.status === "awaiting_confirm";
  const canRetry = order.job?.status === "failed" && !order.shipment;
  const reconfirmStatus = order.dispatchReconfirm?.status ?? null;
  const canRequestReconfirm =
    order.status === "CONFIRMED_BY_BUYER" && !order.job && !order.shipment && reconfirmStatus !== "pending";
  const canSync = Boolean(order.shipment) && !["DELIVERED", "RETURNED", "CANCELLED"].includes(order.status);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/80 pb-5">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span>Orders</span>
          </Link>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {order.customerName ?? "Buyer"}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{order.designation ?? "Order"}</span>
            <span>·</span>
            <span className="font-mono tabular-nums">{order.phone ?? "phone missing"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono">
            {order.status}
          </Badge>
          <RiskBadge level={order.riskLevel} score={order.riskScore} />
        </div>
      </div>

      {actionError ? (
        <p
          role="alert"
          className="rounded-xl border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-fg"
        >
          {actionError}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Amounts & Address Card */}
        <Card>
          <CardHeader className="border-b border-border/70">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-4 text-brand-terracotta" />
              Amounts
            </CardTitle>
            <CardDescription>Deterministic integer millime ledger.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row label="Subtotal" value={money(order.subtotalMillimes)} />
            <Row
              label="Discount"
              value={order.discountMillimes ? `-${money(order.discountMillimes)}` : "—"}
            />
            <Row
              label="Delivery"
              value={order.deliveryFeeMillimes ? money(order.deliveryFeeMillimes) : "free"}
            />
            <div className="my-1 border-t border-border/80 pt-2">
              <Row label="Total" value={money(order.totalMillimes)} strong />
            </div>

            <div className="mt-2 grid gap-1.5 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground sm:grid-cols-2">
              {order.landmark ? (
                <p>
                  <span className="font-medium text-foreground">Landmark:</span> {order.landmark}
                </p>
              ) : null}
              {order.governorate ? (
                <p>
                  <span className="font-medium text-foreground">Governorate:</span> {order.governorate}
                </p>
              ) : null}
              {order.floor ? (
                <p>
                  <span className="font-medium text-foreground">Floor:</span> {order.floor}
                </p>
              ) : null}
              {order.driverNote ? (
                <p>
                  <span className="font-medium text-foreground">Note:</span> {order.driverNote}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Risk & Cutout Card */}
        <Card>
          <CardHeader className="border-b border-border/70">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-brand-terracotta" />
              Risk
            </CardTitle>
            <CardDescription>Delivery history &amp; pin proximity signals.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {order.riskReasons.length === 0 ? (
              <p className="text-muted-foreground">No signals.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 pl-4 list-disc text-xs leading-relaxed">
                {order.riskReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            {order.cropUrl ? (
              <div className="mt-1 flex items-center gap-3 rounded-xl border border-border bg-checkerboard p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={order.cropUrl}
                  alt="Catalog crop"
                  className="size-28 rounded-lg object-contain"
                />
                <div className="text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Matched Cutout</p>
                  <p className="mt-0.5">Verified via SAM 3.1 + PE vector match</p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Confirmed Pin Map */}
      {order.lat != null && order.lng != null ? (
        <Card>
          <CardHeader className="border-b border-border/70">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-4 text-brand-terracotta" />
                Confirmed pin
              </CardTitle>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {order.lat.toFixed(4)}, {order.lng.toFixed(4)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <StaticPinMap lat={order.lat} lng={order.lng} />
          </CardContent>
        </Card>
      ) : null}

      {/* Dispatch & Courier Control */}
      <Card>
        <CardHeader className="border-b border-border/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck className="size-4 text-brand-terracotta" />
                Dispatch
              </CardTitle>
              <CardDescription>
                First Delivery portal read-back &amp; A6 barcode waybill generation.
              </CardDescription>
            </div>
            {order.job ? (
              <Badge variant={order.job.status === "failed" ? "destructive" : "info"}>
                {JOB_LABEL[order.job.status] ?? order.job.status}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3.5 text-sm">
          {order.job ? (
            <p className="font-medium">{JOB_LABEL[order.job.status] ?? order.job.status}</p>
          ) : (
            <p className="text-muted-foreground">Awaiting seller approval to dispatch.</p>
          )}
          {order.job?.error ? <p className="text-status-danger-fg">{order.job.error}</p> : null}
          {order.job?.diffs.length ? (
            <ul className="list-disc pl-4 text-status-danger-fg">
              {order.job.diffs.map((diff) => (
                <li key={diff}>{diff}</li>
              ))}
            </ul>
          ) : null}
          {order.job?.screenshotUrl ? (
            <div className="overflow-hidden rounded-xl border border-border bg-muted/40 p-2">
              <p className="mb-1.5 font-mono text-[11px] text-muted-foreground">
                Playwright Read-back Verification Screenshot
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={order.job.screenshotUrl}
                alt="Agent screenshot"
                className="max-h-80 w-full rounded-lg border border-border object-contain bg-white"
              />
            </div>
          ) : null}
          {reconfirmStatus ? (
            <p className="flex items-center gap-2">
              <span>Reconfirmation avant envoi :</span>
              <Badge variant={reconfirmStatus === "confirmed" ? "success" : reconfirmStatus === "declined" ? "destructive" : "warning"}>
                {reconfirmStatus === "confirmed" ? "Confirmée par l'acheteur" : reconfirmStatus === "declined" ? "Acheteur: attendre" : "En attente de l'acheteur"}
              </Badge>
            </p>
          ) : null}
          {order.shipment ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-status-success-border bg-status-success-bg px-4 py-3 text-status-success-fg">
              <p className="flex items-center gap-2">
                <FileText className="size-4" />
                <span>
                  Code <span className="font-mono font-semibold">{order.shipment.barcode}</span>
                  {order.shipment.fdState != null ? (
                    <span className="ml-2 font-mono text-xs">état FD {order.shipment.fdState}</span>
                  ) : null}
                </span>
              </p>
              <a
                className="inline-flex items-center gap-1 font-semibold underline underline-offset-4"
                href={order.shipment.printUrl}
              >
                <span>Open the waybill</span>
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {canApprove ? (
              <Button type="button" disabled={busy} onClick={() => void post(`/api/orders/${id}/approve`)}>
                Approve
              </Button>
            ) : null}
            {canConfirm ? (
              <Button
                type="button"
                variant="brand"
                disabled={busy}
                onClick={() => void post(`/api/orders/${id}/confirm-dispatch`)}
              >
                Confirm shipment
              </Button>
            ) : null}
            {canRetry ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void post(`/api/orders/${id}/retry`)}
              >
                Retry
              </Button>
            ) : null}
            {canRequestReconfirm ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void post(`/api/orders/${id}/reconfirm`)}
              >
                Demander reconfirmation
              </Button>
            ) : null}
            {canSync ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void post(`/api/orders/${id}/sync-status`)}
              >
                Synchroniser FD
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Conversation Transcript */}
      <Card>
        <CardHeader className="border-b border-border/70">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="size-4 text-brand-terracotta" />
              Conversation
            </CardTitle>
            {order.conversationId ? (
              <Link
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-terracotta underline-offset-4 hover:underline"
                href={`/simulator?conversation=${order.conversationId}`}
              >
                <span>Open in the chat</span>
                <ExternalLink className="size-3" />
              </Link>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex max-h-80 flex-col gap-2 overflow-y-auto text-sm">
          {order.messages.length === 0 ? <p className="text-muted-foreground">No messages.</p> : null}
          {order.messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-xl px-3 py-2 text-xs ${
                message.direction === "in"
                  ? "bg-muted/70 text-foreground"
                  : "border border-border/70 bg-card text-muted-foreground"
              }`}
            >
              <span className="mr-2 font-mono text-[10px] font-semibold uppercase text-brand-terracotta">
                {message.direction === "in" ? "Buyer" : "Shop"}
              </span>
              <span dir="auto">{message.body}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "font-semibold text-foreground" : ""}`}>
      <span className={strong ? "text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
