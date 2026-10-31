"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, CreditCard, MapPin, Save, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "../bits";

interface FeeRow {
  governorate: string;
  delegation: string | null;
  locality_id: number | null;
  fee_millimes: number;
}

interface Settings {
  paymentLink: string | null;
  freeDeliveryThresholdMillimes: number | null;
  courierMode: "mock_api" | "browser" | "real_api";
  fees: FeeRow[];
}

export function SettingsClient() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [paymentLink, setPaymentLink] = useState("");
  const [thresholdDt, setThresholdDt] = useState("");
  const [mode, setMode] = useState<Settings["courierMode"]>("mock_api");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch("/api/dashboard/settings")
        .then((res) => res.json())
        .then((body: Settings & { error?: string }) => {
          if (body.error) {
            setError(body.error);
            return;
          }
          setSettings(body);
          setPaymentLink(body.paymentLink ?? "");
          setThresholdDt(
            body.freeDeliveryThresholdMillimes == null
              ? ""
              : String(body.freeDeliveryThresholdMillimes / 1000),
          );
          setMode(body.courierMode);
        });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    setError(null);
    const threshold = thresholdDt.trim() === "" ? null : Math.round(Number(thresholdDt) * 1000);
    if (threshold != null && !Number.isFinite(threshold)) {
      setError("Invalid threshold.");
      return;
    }
    const res = await fetch("/api/dashboard/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentLink: paymentLink.trim() || null,
        freeDeliveryThresholdMillimes: threshold,
        courierMode: mode,
      }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setError(body?.error ?? "Couldn't save.");
      return;
    }
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-terracotta uppercase">
          Merchant Configuration
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Settings
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Payment link, free delivery, courier mode.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-fg">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="flex items-center gap-2 rounded-xl border border-status-success-border bg-status-success-bg px-4 py-2.5 text-sm font-medium text-status-success-fg">
          <CheckCircle2 className="size-4" />
          Settings saved.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <Card className="h-fit">
          <CardHeader className="border-b border-border/70">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-4 text-brand-terracotta" />
              Shop
            </CardTitle>
            <CardDescription>
              Red-risk buyer payment link, free delivery threshold, and courier adapter.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay">Payment link (Flouci / Konnect)</Label>
                <Input
                  id="pay"
                  value={paymentLink}
                  onChange={(event) => setPaymentLink(event.target.value)}
                  placeholder="https://flouci.com/pay/..."
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="threshold">Free delivery from (DT, empty = never)</Label>
                <Input
                  id="threshold"
                  value={thresholdDt}
                  onChange={(event) => setThresholdDt(event.target.value)}
                  inputMode="decimal"
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mode">Courier mode</Label>
                <select
                  id="mode"
                  value={mode}
                  onChange={(event) => setMode(event.target.value as Settings["courierMode"])}
                  className="h-9 rounded-lg border border-input bg-card px-3 text-sm shadow-2xs outline-none transition-[border-color,box-shadow] focus-visible:border-foreground/45 focus-visible:ring-3 focus-visible:ring-ring/25"
                >
                  <option value="mock_api">API mock</option>
                  <option value="browser">Browser agent</option>
                  <option value="real_api">Real First Delivery API</option>
                </select>
              </div>
              <Button type="submit" className="w-fit">
                <Save className="size-3.5" />
                Save
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border/70">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="size-4 text-brand-terracotta" />
                  Delivery fees
                </CardTitle>
                <CardDescription>
                  Deterministic governorate &amp; First Delivery <code>locality_id</code> mapping.
                </CardDescription>
              </div>
              <Badge variant="outline" className="font-mono tabular-nums">
                {(settings?.fees ?? []).length} zones
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  <th className="py-2.5 pr-3">Governorate</th>
                  <th className="py-2.5 px-3">Delegation</th>
                  <th className="py-2.5 px-3">locality_id</th>
                  <th className="py-2.5 pl-3 text-right">Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(settings?.fees ?? []).map((fee) => (
                  <tr
                    key={`${fee.governorate}-${fee.delegation ?? ""}-${fee.locality_id ?? ""}`}
                    className="hover:bg-muted/40"
                  >
                    <td className="py-2.5 pr-3 font-medium text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-3 text-brand-terracotta" />
                        {fee.governorate}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{fee.delegation ?? "—"}</td>
                    <td className="py-2.5 px-3">
                      {fee.locality_id != null ? (
                        <Badge variant="secondary" className="font-mono tabular-nums">
                          {fee.locality_id}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono font-medium tabular-nums text-foreground">
                      {money(fee.fee_millimes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
