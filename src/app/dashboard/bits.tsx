"use client";

import { Badge } from "@/components/base/badges/badges";
import { formatMillimesForChat } from "@/lib/domain/pricing";
import { osmTilePin } from "@/lib/couriers/osmTile";

export function money(millimes: number): string {
  return formatMillimesForChat(millimes);
}

export function RiskBadge({ level, score }: { level: string | null; score: number | null }) {
  const color =
    level === "red"
      ? "error"
      : level === "yellow"
        ? "warning"
        : level === "green"
          ? "success"
          : "gray";
  const dotColor =
    level === "red"
      ? "bg-utility-red-600"
      : level === "yellow"
        ? "bg-utility-yellow-600"
        : level === "green"
          ? "bg-utility-green-600"
          : "bg-neutral-400";
  const label = level === "green" ? "Green" : level === "yellow" ? "Amber" : level === "red" ? "Red" : "—";
  return (
    <Badge color={color} className="font-mono tabular-nums">
      <span className={`size-1.5 rounded-full ${dotColor}`} />
      {score == null ? label : `${label} ${score}`}
    </Badge>
  );
}

export function OsmThumb({ lat, lng }: { lat: number; lng: number }) {
  const pin = osmTilePin(lat, lng);
  return (
    <div className="relative size-24 shrink-0 overflow-hidden rounded-xl border border-secondary bg-tertiary shadow-2xs">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pin.url} alt="" className="h-full w-full object-cover" />
      <span
        className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-solid ring-2 ring-brand-300 shadow-sm"
        style={{ left: `${pin.leftPct}%`, top: `${pin.topPct}%` }}
      />
    </div>
  );
}

export const JOB_LABEL: Record<string, string> = {
  queued: "Queued",
  claimed: "Agent on the portal",
  awaiting_confirm: "Readback ok — confirm",
  failed: "Readback failed",
  done: "Waybill created",
};
