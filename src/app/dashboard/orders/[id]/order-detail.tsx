"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, LinkExternal01 as ExternalLink, File01 as FileText, MarkerPin01 as MapPin, MessageSquare01 as MessageSquare, Receipt, ShieldTick as ShieldCheck, Truck01 as Truck } from "@untitledui/icons";
import { StaticPinMap } from "@/components/static-pin-map";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
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
        className="rounded-xl border border-utility-red-200 bg-error-primary px-4 py-2.5 text-sm text-error-primary"
      >
        {error}
      </p>
    );
  }
  if (!order) return <p className="text-sm text-tertiary">Loading the order…</p>;

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
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-secondary/80 pb-5">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-xs font-medium text-tertiary transition-colors hover:text-primary"
          >
            <ArrowLeft className="size-3.5" />
            <span>Orders</span>
          </Link>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
            {order.customerName ?? "Buyer"}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-tertiary">
            <span className="font-medium text-primary">{order.designation ?? "Order"}</span>
            <span>·</span>
            <span className="font-mono tabular-nums">{order.phone ?? "phone missing"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge color="gray" className="font-mono">
            {order.status}
          </Badge>
          <RiskBadge level={order.riskLevel} score={order.riskScore} />
        </div>
      </div>

      {actionError ? (
        <p
          role="alert"
          className="rounded-xl border border-utility-red-200 bg-error-primary px-4 py-2.5 text-sm text-error-primary"
        >
          {actionError}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Amounts & Address Card */}
        <Card>
          <CardHeader className="border-b border-secondary/70">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-4 text-brand-secondary" />
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
            <div className="my-1 border-t border-secondary/80 pt-2">
              <Row label="Total" value={money(order.totalMillimes)} strong />
            </div>

            <div className="mt-2 grid gap-1.5 rounded-xl bg-tertiary/50 p-3 text-xs text-tertiary sm:grid-cols-2">
              {order.landmark ? (
                <p>
                  <span className="font-medium text-primary">Landmark:</span> {order.landmark}
                </p>
              ) : null}
              {order.governorate ? (
                <p>
                  <span className="font-medium text-primary">Governorate:</span> {order.governorate}
                </p>
              ) : null}
              {order.floor ? (
                <p>
                  <span className="font-medium text-primary">Floor:</span> {order.floor}
                </p>
              ) : null}
              {order.driverNote ? (
                <p>
                  <span className="font-medium text-primary">Note:</span> {order.driverNote}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Risk & Cutout Card */}
        <Card>
          <CardHeader className="border-b border-secondary/70">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-brand-secondary" />
              Risk
            </CardTitle>
            <CardDescription>Delivery history &amp; pin proximity signals.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {order.riskReasons.length === 0 ? (
              <p className="text-tertiary">No signals.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 pl-4 list-disc text-xs leading-relaxed">
                {order.riskReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            {order.cropUrl ? (
              <div className="mt-1 flex items-center gap-3 rounded-xl border border-secondary bg-checkerboard p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={order.cropUrl}
                  alt="Catalog crop"
                  className="size-28 rounded-lg object-contain"
                />
                <div className="text-xs text-tertiary">
                  <p className="font-semibold text-primary">Matched Cutout</p>
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
          <CardHeader className="border-b border-secondary/70">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-4 text-brand-secondary" />
                Confirmed pin
              </CardTitle>
              <span className="font-mono text-xs tabular-nums text-tertiary">
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
        <CardHeader className="border-b border-secondary/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck className="size-4 text-brand-secondary" />
                Dispatch
              </CardTitle>
              <CardDescription>
                First Delivery portal read-back &amp; A6 barcode waybill generation.
              </CardDescription>
            </div>
            {order.job ? (
              <Badge color={order.job.status === "failed" ? "error" : "blue"}>
                {JOB_LABEL[order.job.status] ?? order.job.status}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3.5 text-sm">
          {order.job ? (
            <p className="font-medium">{JOB_LABEL[order.job.status] ?? order.job.status}</p>
          ) : (
            <p className="text-tertiary">Awaiting seller approval to dispatch.</p>
          )}
          {order.job?.error ? <p className="text-error-primary">{order.job.error}</p> : null}
          {order.job?.diffs.length ? (
            <ul className="list-disc pl-4 text-error-primary">
              {order.job.diffs.map((diff) => (
                <li key={diff}>{diff}</li>
              ))}
            </ul>
          ) : null}
          {order.job?.screenshotUrl ? (
            <div className="overflow-hidden rounded-xl border border-secondary bg-tertiary/40 p-2">
              <p className="mb-1.5 font-mono text-[11px] text-tertiary">
                Playwright Read-back Verification Screenshot
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={order.job.screenshotUrl}
                alt="Agent screenshot"
                className="max-h-80 w-full rounded-lg border border-secondary object-contain bg-primary"
              />
            </div>
          ) : null}
          {reconfirmStatus ? (
            <p className="flex items-center gap-2">
              <span>Reconfirmation avant envoi :</span>
              <Badge color={reconfirmStatus === "confirmed" ? "success" : reconfirmStatus === "declined" ? "error" : "warning"}>
                {reconfirmStatus === "confirmed" ? "Confirmed by buyer" : reconfirmStatus === "declined" ? "Buyer asked to wait" : "Waiting for buyer"}
              </Badge>
            </p>
          ) : null}
          {order.shipment ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-utility-green-200 bg-success-primary px-4 py-3 text-success-primary">
              <p className="flex items-center gap-2">
                <FileText className="size-4" />
                <span>
                  Code <span className="font-mono font-semibold">{order.shipment.barcode}</span>
                  {order.shipment.fdState != null ? (
                    <span className="ml-2 font-mono text-xs">FD state {order.shipment.fdState}</span>
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
              <Button type="button" isDisabled={busy} onClick={() => void post(`/api/orders/${id}/approve`)}>
                Approve
              </Button>
            ) : null}
            {canConfirm ? (
              <Button
                type="button"
                color="primary"
                isDisabled={busy}
                onClick={() => void post(`/api/orders/${id}/confirm-dispatch`)}
              >
                Confirm shipment
              </Button>
            ) : null}
            {canRetry ? (
              <Button
                type="button"
                color="secondary"
                isDisabled={busy}
                onClick={() => void post(`/api/orders/${id}/retry`)}
              >
                Retry
              </Button>
            ) : null}
            {canRequestReconfirm ? (
              <Button
                type="button"
                color="secondary"
                isDisabled={busy}
                onClick={() => void post(`/api/orders/${id}/reconfirm`)}
              >
                Ask reconfirmation
              </Button>
            ) : null}
            {canSync ? (
              <Button
                type="button"
                color="secondary"
                isDisabled={busy}
                onClick={() => void post(`/api/orders/${id}/sync-status`)}
              >
                Sync FD status
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Conversation Transcript */}
      <Card>
        <CardHeader className="border-b border-secondary/70">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="size-4 text-brand-secondary" />
              Conversation
            </CardTitle>
            {order.conversationId ? (
              <Link
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-secondary underline-offset-4 hover:underline"
                href={`/simulator?conversation=${order.conversationId}`}
              >
                <span>Open in the chat</span>
                <ExternalLink className="size-3" />
              </Link>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex max-h-80 flex-col gap-2 overflow-y-auto text-sm">
          {order.messages.length === 0 ? <p className="text-tertiary">No messages.</p> : null}
          {order.messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-xl px-3 py-2 text-xs ${
                message.direction === "in"
                  ? "bg-tertiary/70 text-primary"
                  : "border border-secondary/70 bg-primary text-tertiary"
              }`}
            >
              <span className="mr-2 font-mono text-[10px] font-semibold uppercase text-brand-secondary">
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
    <div className={`flex justify-between gap-4 ${strong ? "font-semibold text-primary" : ""}`}>
      <span className={strong ? "text-primary" : "text-tertiary"}>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
