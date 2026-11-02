"use client";

import { useState } from "react";
import { ArrowUpRight, CpuChip01 as Bot, LinkExternal01 as ExternalLink, MessageSquare01 as MessageSquare, Package, RefreshCcw01 as RotateCcw, Truck01 as Truck } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import { usePoll } from "../use-poll";

interface DemoPayload {
  courierMode: string;
  workerOnline: boolean;
  lastHeartbeatAt: string | null;
  lastShipment: { barcode: string; printUrl: string; createdAt: string } | null;
  aiMode: string;
  simulatorPublic: boolean;
  links: { simulator: string; courierClone: string };
  error?: string;
}

const MODE_LABEL: Record<string, string> = {
  mock_api: "Mock API",
  browser: "Browser agent",
  real_api: "Real API",
};

export function DemoClient() {
  const { data, error, reload } = usePoll<DemoPayload>("/api/dashboard/demo", 5000);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetNote, setResetNote] = useState<string | null>(null);

  async function resetDemo() {
    if (!window.confirm("Delete all demo conversations and orders? Catalog, landmarks and fees are kept.")) return;
    setResetBusy(true);
    setResetNote(null);
    const res = await fetch("/api/dashboard/demo", { method: "POST" });
    const body = (await res.json().catch(() => null)) as { error?: string; counts?: Record<string, number> } | null;
    setResetBusy(false);
    if (!res.ok) {
      setResetNote(body?.error ?? "Reset failed.");
      return;
    }
    const counts = body?.counts ?? {};
    setResetNote(`Reset done: ${counts.orders ?? 0} orders, ${counts.conversations ?? 0} conversations deleted. Re-run npm run seed:day5 if needed.`);
    await reload();
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">
          Live Stage Control
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
          Demo
        </h1>
        <p className="mt-0.5 text-sm text-tertiary">
          Stage links and courier agent status.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-utility-red-200 bg-error-primary px-4 py-2.5 text-sm text-error-primary">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-secondary/70">
            <CardTitle>Walkthrough</CardTitle>
            <CardDescription>
              Open these three surfaces side by side for the live 3-minute stage walkthrough.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <a
              className="group flex items-center justify-between rounded-xl border border-secondary bg-tertiary/40 p-3.5 transition-colors hover:bg-tertiary"
              href={data?.links.simulator ?? "/simulator"}
            >
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary-solid text-brand-200">
                  <MessageSquare className="size-4" />
                </span>
                <div>
                  <p className="font-semibold text-primary underline-offset-4 group-hover:underline">
                    Buyer chat
                  </p>
                  <p className="text-xs text-tertiary">
                    Public WhatsApp simulator + live AI trace panel
                  </p>
                </div>
              </div>
              <ArrowUpRight className="size-4 text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>

            <a
              className="group flex items-center justify-between rounded-xl border border-secondary bg-tertiary/40 p-3.5 transition-colors hover:bg-tertiary"
              href={data?.links.courierClone ?? "/courier-clone/login"}
            >
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-[#0c4a6e] text-white">
                  <Truck className="size-4" />
                </span>
                <div>
                  <p className="font-semibold text-primary underline-offset-4 group-hover:underline">
                    First Delivery portal
                  </p>
                  <p className="text-xs text-tertiary">
                    Courier portal filled and verified by the Playwright worker
                  </p>
                </div>
              </div>
              <ArrowUpRight className="size-4 text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>

            <a
              className="group flex items-center justify-between rounded-xl border border-secondary bg-tertiary/40 p-3.5 transition-colors hover:bg-tertiary"
              href="/dashboard"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-brand-solid text-white">
                  <Package className="size-4" />
                </span>
                <div>
                  <p className="font-semibold text-primary underline-offset-4 group-hover:underline">
                    Order queue
                  </p>
                  <p className="text-xs text-tertiary">
                    Approve buyer orders, inspect risk, and print A6 waybills
                  </p>
                </div>
              </div>
              <ArrowUpRight className="size-4 text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-secondary/70">
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-4 text-brand-secondary" />
              Courier
            </CardTitle>
            <CardDescription>
              Real-time worker heartbeat and latest generated waybill.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-secondary bg-tertiary/45 p-3">
                <p className="text-[10px] font-semibold tracking-wider text-tertiary uppercase">
                  Dispatch Mode
                </p>
                <p className="mt-1 font-semibold text-primary">
                  Mode: {MODE_LABEL[data?.courierMode ?? ""] ?? data?.courierMode ?? "…"}
                </p>
              </div>
              <div className="rounded-xl border border-secondary bg-tertiary/45 p-3">
                <p className="text-[10px] font-semibold tracking-wider text-tertiary uppercase">
                  Browser Worker
                </p>
                <p className="mt-1 flex items-center gap-2">
                  <span className="font-medium">Agent</span>
                  <Badge color={data?.workerOnline ? "success" : "gray"}>
                    {data?.workerOnline ? "online" : "offline"}
                  </Badge>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-secondary bg-tertiary/45 p-3">
                <p className="text-[10px] font-semibold tracking-wider text-tertiary uppercase">AI mode</p>
                <p className="mt-1 font-mono text-sm font-semibold text-primary">{data?.aiMode ?? "…"}</p>
              </div>
              <div className="rounded-xl border border-secondary bg-tertiary/45 p-3">
                <p className="text-[10px] font-semibold tracking-wider text-tertiary uppercase">Public simulator</p>
                <p className="mt-1 font-semibold text-primary">{data ? (data.simulatorPublic ? "Open" : "Closed") : "…"}</p>
              </div>
            </div>

            <div className="rounded-xl border border-secondary bg-primary p-4">
              {data?.lastShipment ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    Latest waybill:{" "}
                    <span className="font-mono font-semibold">{data.lastShipment.barcode}</span>
                  </p>
                  <a
                    className="inline-flex items-center gap-1 font-medium text-brand-secondary underline underline-offset-4"
                    href={data.lastShipment.printUrl}
                  >
                    <span>open</span>
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              ) : (
                <p className="text-tertiary">No waybill yet.</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button type="button" color="secondary" isDisabled={resetBusy} onClick={() => void resetDemo()}>
                <RotateCcw className="size-4" />
                Reset the demo
              </Button>
              {resetNote ? <p className="text-xs text-tertiary">{resetNote}</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
