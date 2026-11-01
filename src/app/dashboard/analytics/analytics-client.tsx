"use client";

import { BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsPayload } from "@/lib/dashboard/analytics";
import { money } from "../bits";
import { usePoll } from "../use-poll";

export function AnalyticsClient() {
  const { data, error } = usePoll<AnalyticsPayload>("/api/dashboard/analytics", 5000);
  const totals = data?.totals;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-terracotta uppercase">Vue d&apos;ensemble</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Analytics</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Chiffres calculés depuis les commandes et événements stockés.</p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-fg">{error}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Commandes" value={totals ? String(totals.orders) : "…"} />
        <Kpi label="Chiffre (totaux)" value={totals ? money(totals.revenueMillimes) : "…"} />
        <Kpi label="Remises accordées" value={totals ? money(totals.discountMillimes) : "…"} />
        <Kpi label="Taux de retour" value={totals?.returnRatePercent != null ? `${totals.returnRatePercent}%` : "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-border/70">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-4 text-brand-terracotta" />
              Commandes par statut
            </CardTitle>
            <CardDescription>Y compris les statuts après synchronisation First Delivery.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {data && data.ordersByStatus.length === 0 ? <p className="text-muted-foreground">Aucune commande.</p> : null}
            {(data?.ordersByStatus ?? []).map((row) => (
              <div key={row.status} className="flex items-center justify-between gap-4">
                <span className="font-mono text-xs">{row.status}</span>
                <Badge variant="outline" className="font-mono tabular-nums">{row.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border/70">
            <CardTitle>Risque & activité</CardTitle>
            <CardDescription>Livraisons, retours et signaux qui alimentent le score.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {(data?.ordersByRisk ?? []).map((row) => (
                <Badge key={row.level} variant={row.level === "red" ? "destructive" : row.level === "yellow" ? "warning" : row.level === "green" ? "success" : "outline"}>
                  {row.level}: {row.count}
                </Badge>
              ))}
            </div>
            <Row label="Livrées (événements)" value={String(totals?.delivered ?? 0)} />
            <Row label="Retours (événements)" value={String(totals?.returned ?? 0)} />
            <Row label="Annulations (événements)" value={String(totals?.cancelled ?? 0)} />
            <Row label="Conversations" value={String(data?.activity.conversations ?? 0)} />
            <Row label="Passages vendeur (handover)" value={String(data?.activity.handovers ?? 0)} />
            <Row label="Demandes sans produit" value={String(data?.activity.unmatchedDemands ?? 0)} />
            <Row label="Repères introuvables" value={String(data?.activity.landmarkMisses ?? 0)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-2xs">
      <p className="font-mono text-base font-semibold tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
