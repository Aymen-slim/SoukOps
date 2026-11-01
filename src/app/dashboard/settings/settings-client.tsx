"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Copy, CreditCard, Link2, MapPin, MessageCircle, PlugZap, Save, Send, Truck } from "lucide-react";
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

      <WhatsAppConnect />

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

interface WhatsAppStatus {
  configured: boolean;
  source: "database" | "env" | null;
  phoneNumberId: string | null;
  tokenSet: boolean;
  verifyToken: string | null;
  webhookUrl: string;
}

/**
 * One-button WhatsApp Cloud API link: open the wizard, paste the two values
 * Meta gives you, test, save, then copy the webhook into Meta. The access
 * token is write-only — it is never displayed back.
 */
function WhatsAppConnect() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [waError, setWaError] = useState<string | null>(null);
  const [connectedName, setConnectedName] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/dashboard/whatsapp");
    const body = (await res.json().catch(() => null)) as (WhatsAppStatus & { error?: string }) | null;
    if (!res.ok || !body || body.error) {
      setWaError(body?.error ?? "Statut WhatsApp illisible.");
      return;
    }
    setStatus(body);
    setPhoneNumberId(body.phoneNumberId ?? "");
    setVerifyToken(body.verifyToken ?? "");
    if (body.configured) setConnectedName(body.phoneNumberId);
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text).catch(() => undefined);
  }

  async function test(withRecipient: boolean) {
    setBusy(true);
    setWaError(null);
    setNote(null);
    const res = await fetch("/api/dashboard/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "test",
        phoneNumberId: phoneNumberId.trim() || undefined,
        accessToken: accessToken.trim() || undefined,
        testRecipient: withRecipient ? testRecipient.trim() || undefined : undefined,
      }),
    });
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      displayPhoneNumber?: string | null;
      verifiedName?: string | null;
      testSent?: boolean;
    } | null;
    setBusy(false);
    if (!res.ok) {
      setWaError(body?.error ?? "Test impossible.");
      return;
    }
    setConnectedName(body?.displayPhoneNumber ?? body?.verifiedName ?? phoneNumberId);
    setNote(
      body?.testSent
        ? `Connecté${body.displayPhoneNumber ? ` (${body.displayPhoneNumber})` : ""} — message test envoyé.`
        : `Connecté${body?.displayPhoneNumber ? ` : ${body.displayPhoneNumber}` : ""}${body?.verifiedName ? ` · ${body.verifiedName}` : ""}. Pensez à sauvegarder.`,
    );
  }

  async function save() {
    setBusy(true);
    setWaError(null);
    setNote(null);
    const res = await fetch("/api/dashboard/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phoneNumberId: phoneNumberId.trim(),
        wabaId: wabaId.trim() || null,
        accessToken: accessToken.trim() || undefined,
        verifyToken: verifyToken.trim(),
      }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res.ok) {
      setWaError(body?.error ?? "Sauvegarde impossible.");
      return;
    }
    setAccessToken("");
    setNote("WhatsApp sauvegardé. Collez le webhook ci-dessous dans Meta, puis testez depuis votre téléphone.");
    await load();
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/70">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="size-4 text-brand-terracotta" />
              WhatsApp
            </CardTitle>
            <CardDescription>
              Recevez les commandes sur votre vrai numéro WhatsApp Business (Cloud API Meta).
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={status?.configured ? "success" : "outline"}>
              {status?.configured ? `Connecté${connectedName ? ` · ${connectedName}` : ""}` : "Non connecté"}
            </Badge>
            <Button type="button" onClick={() => setOpen((value) => !value)}>
              <Link2 className="size-3.5" />
              Link WhatsApp
            </Button>
          </div>
        </div>
      </CardHeader>
      {open ? (
        <CardContent className="flex flex-col gap-5">
          {waError ? (
            <p role="alert" className="rounded-xl border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-fg">
              {waError}
            </p>
          ) : null}
          {note ? (
            <p className="flex items-center gap-2 rounded-xl border border-status-success-border bg-status-success-bg px-4 py-2.5 text-sm font-medium text-status-success-fg">
              <CheckCircle2 className="size-4" />
              {note}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">1 · Créez votre numéro chez Meta</p>
            <p className="text-sm text-muted-foreground">
              Ouvrez Meta for Developers, ajoutez le produit WhatsApp à une app, puis copiez le{" "}
              <strong>Phone Number ID</strong> et un <strong>Access Token</strong> depuis « API Setup ».
            </p>
            <a
              className="w-fit text-sm font-medium text-brand-terracotta underline underline-offset-4"
              href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
              target="_blank"
              rel="noreferrer"
            >
              Ouvrir le guide WhatsApp Cloud API
            </a>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-phone">Phone Number ID</Label>
              <Input id="wa-phone" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} className="font-mono" placeholder="1065…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-waba">WhatsApp Business Account ID (optionnel)</Label>
              <Input id="wa-waba" value={wabaId} onChange={(e) => setWabaId(e.target.value)} className="font-mono" placeholder="1098…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-token">Access Token {status?.tokenSet ? "(déjà sauvegardé — laisser vide pour garder)" : ""}</Label>
              <Input id="wa-token" type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} className="font-mono" placeholder="EAA…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-verify">Verify Token (à recopier dans Meta)</Label>
              <div className="flex gap-2">
                <Input id="wa-verify" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} className="font-mono" placeholder="wassalha-…" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setVerifyToken(`wassalha-${Math.random().toString(36).slice(2, 10)}`)}
                >
                  Générer
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void test(false)}>
              <PlugZap className="size-3.5" />
              Test connection
            </Button>
            <Button type="button" variant="secondary" disabled={busy || !phoneNumberId.trim() || !verifyToken.trim()} onClick={() => void save()}>
              <Save className="size-3.5" />
              Save &amp; connect
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">2 · Collez le webhook dans Meta</p>
            <p className="text-sm text-muted-foreground">
              Dans l&apos;app Meta : WhatsApp → Configuration → Webhook → Edit. Collez l&apos;URL et le Verify Token,
              sauvegardez, puis abonnez le champ <code>messages</code>.
            </p>
            <div className="grid gap-2">
              <div className="flex gap-2">
                <Input readOnly value={status?.webhookUrl ?? ""} className="font-mono text-xs" aria-label="Webhook URL" />
                <Button type="button" variant="outline" onClick={() => void copy(status?.webhookUrl ?? "")}>
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              </div>
              <div className="flex gap-2">
                <Input readOnly value={verifyToken} className="font-mono text-xs" aria-label="Verify token" />
                <Button type="button" variant="outline" onClick={() => void copy(verifyToken)}>
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Astuce démo locale : exposez temporairement ce poste avec un tunnel HTTPS et mettez cette URL publique
              dans <code>APP_BASE_URL</code>, sinon Meta ne peut pas appeler le webhook.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">3 · Recevez un message test</p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                className="w-56 font-mono"
                placeholder="Votre mobile, ex. 21622123456"
                inputMode="tel"
              />
              <Button type="button" variant="outline" disabled={busy || !testRecipient.trim()} onClick={() => void test(true)}>
                <Send className="size-3.5" />
                Send test message
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ensuite, écrivez à votre numéro WhatsApp Business depuis un autre téléphone : la conversation arrive
              dans Inbox et l&apos;agent répond comme dans le simulateur.
            </p>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
