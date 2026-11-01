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

      <FacebookConnect />

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
  embedded: { configured: boolean; appId: string | null; configId: string | null };
}

interface FbSdk {
  init: (opts: Record<string, unknown>) => void;
  login: (
    cb: (res: { authResponse?: { code?: string } }) => void,
    opts: Record<string, unknown>,
  ) => void;
}

declare global {
  interface Window {
    FB?: FbSdk;
  }
}

function loadFacebookSdk(appId: string): Promise<FbSdk> {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve(window.FB);
      return;
    }
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.onload = () => {
      if (!window.FB) {
        reject(new Error("Facebook SDK could not load"));
        return;
      }
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version: "v21.0" });
      resolve(window.FB);
    };
    script.onerror = () => reject(new Error("Facebook SDK could not load (network?)"));
    document.body.appendChild(script);
  });
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
      setWaError(body?.error ?? "Could not load WhatsApp status.");
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

  /** The real one-click path: Facebook popup -> pick the WhatsApp number ->
   * Meta hands back a code + ids -> server exchanges and subscribes. */
  async function launchEmbeddedSignup() {
    if (!status?.embedded.appId || !status.embedded.configId) return;
    setBusy(true);
    setWaError(null);
    setNote(null);
    let session: { wabaId: string; phoneNumberId: string } | null = null;
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = (typeof event.data === "string" ? JSON.parse(event.data) : event.data) as {
          type?: string;
          event?: string;
          data?: { waba_id?: string; phone_number_id?: string };
        } | null;
        if (data?.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH" && data.data?.waba_id && data.data.phone_number_id) {
          session = { wabaId: data.data.waba_id, phoneNumberId: data.data.phone_number_id };
        }
      } catch {
        // not an embedded-signup message; ignore
      }
    };
    window.addEventListener("message", onMessage);
    try {
      const FB = await loadFacebookSdk(status.embedded.appId);
      const code = await new Promise<string | null>((resolve) => {
        FB.login(
          (res) => resolve(res.authResponse?.code ?? null),
          {
            config_id: status.embedded.configId,
            response_type: "code",
            override_default_response_type: true,
            extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
          },
        );
      });
      if (!code) throw new Error("Facebook login cancelled.");
      for (let i = 0; i < 20 && !session; i++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!session) throw new Error("Facebook did not return the WhatsApp number. Try again.");
      const found: { wabaId: string; phoneNumberId: string } = session;
      const res = await fetch("/api/dashboard/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", code, ...found }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        displayPhoneNumber?: string | null;
        verifiedName?: string | null;
      } | null;
      if (!res.ok) throw new Error(body?.error ?? "Connection failed.");
      setConnectedName(body?.displayPhoneNumber ?? found.phoneNumberId);
      setNote(
        `WhatsApp linked in one click${body?.displayPhoneNumber ? ` : ${body.displayPhoneNumber}` : ""}${body?.verifiedName ? ` · ${body.verifiedName}` : ""}. Webhook subscribed automatically — paste the Verify Token below into Meta if it asks.`,
      );
      await load();
    } catch (err) {
      setWaError(err instanceof Error ? err.message : "Connection failed.");
    } finally {
      window.removeEventListener("message", onMessage);
      setBusy(false);
    }
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
      setWaError(body?.error ?? "Test failed.");
      return;
    }
    setConnectedName(body?.displayPhoneNumber ?? body?.verifiedName ?? phoneNumberId);
    setNote(
      body?.testSent
        ? `Connected${body.displayPhoneNumber ? ` (${body.displayPhoneNumber})` : ""} — test message sent.`
        : `Connected${body?.displayPhoneNumber ? ` : ${body.displayPhoneNumber}` : ""}${body?.verifiedName ? ` · ${body.verifiedName}` : ""}. Remember to save.`,
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
      setWaError(body?.error ?? "Save failed.");
      return;
    }
    setAccessToken("");
    setNote("WhatsApp saved. Paste the webhook below into Meta, then test from your phone.");
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
              Receive orders on your real WhatsApp Business number (Meta Cloud API).
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={status?.configured ? "success" : "outline"}>
              {status?.configured ? `Connected${connectedName ? ` · ${connectedName}` : ""}` : "Not connected"}
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

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-4">
            <p className="text-sm font-semibold text-foreground">Easiest: one click with Facebook</p>
            <p className="text-sm text-muted-foreground">
              Log in with the shop&apos;s Facebook account, pick the WhatsApp number, confirm.
              No IDs or tokens to copy — Wassalha exchanges the code and subscribes the webhook automatically.
            </p>
            <Button
              type="button"
              className="w-fit bg-[#1877F2] text-white hover:bg-[#1663cc]"
              disabled={busy || !status?.embedded.configured}
              onClick={() => void launchEmbeddedSignup()}
            >
              <Link2 className="size-3.5" />
              Link with Facebook
            </Button>
            {status && !status.embedded.configured ? (
              <p className="text-xs text-muted-foreground">
                Not enabled on this server yet: set <code>META_APP_ID</code>, <code>META_APP_SECRET</code> et{" "}
                <code>WHATSAPP_EMBEDDED_CONFIG_ID</code> dans <code>.env.local</code> (app Meta → Facebook Login for
                Business), or use the manual method below.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">Manual method · 1 · Create your number at Meta</p>
            <p className="text-sm text-muted-foreground">
              Open Meta for Developers, add the WhatsApp product to an app, then copy the{" "}
              <strong>Phone Number ID</strong> et un <strong>Access Token</strong> depuis « API Setup ».
            </p>
            <a
              className="w-fit text-sm font-medium text-brand-terracotta underline underline-offset-4"
              href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
              target="_blank"
              rel="noreferrer"
            >
              Open the WhatsApp Cloud API guide
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
              <Label htmlFor="wa-token">Access Token {status?.tokenSet ? "(already saved — leave empty to keep it)" : ""}</Label>
              <Input id="wa-token" type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} className="font-mono" placeholder="EAA…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-verify">Verify Token (paste it into Meta)</Label>
              <div className="flex gap-2">
                <Input id="wa-verify" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} className="font-mono" placeholder="wassalha-…" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setVerifyToken(`wassalha-${Math.random().toString(36).slice(2, 10)}`)}
                >
                  Generate
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
            <p className="text-sm font-semibold text-foreground">Manual method · 2 · Paste the webhook into Meta</p>
            <p className="text-sm text-muted-foreground">
              In the Meta app: WhatsApp → Configuration → Webhook → Edit. Paste the URL and the Verify Token,
              save, then subscribe to the <code>messages</code>.
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
              Local demo tip: expose this machine temporarily with an HTTPS tunnel and put that public URL
              dans <code>APP_BASE_URL</code>, otherwise Meta cannot call the webhook.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">Manual method · 3 · Get a test message</p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                className="w-56 font-mono"
                placeholder="Your mobile, e.g. 21622123456"
                inputMode="tel"
              />
              <Button type="button" variant="outline" disabled={busy || !testRecipient.trim()} onClick={() => void test(true)}>
                <Send className="size-3.5" />
                Send test message
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Then message your WhatsApp Business number from another phone: the conversation lands
              in Inbox and the agent replies just like in the simulator.
            </p>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

interface FacebookStatus {
  oauthConfigured: boolean;
  appId: string | null;
  webhookUrl: string;
  messenger: { connected: boolean; pageId?: string; pageName?: string | null };
  instagram: { connected: boolean; igUserId?: string; username?: string | null };
}

interface PageOption {
  pageId: string;
  pageName: string;
  instagram: { id: string; username: string | null } | null;
}

const PLATFORM_SCOPES: Record<"messenger" | "instagram", string> = {
  messenger: "pages_messaging,pages_show_list,pages_manage_metadata,pages_read_engagement",
  instagram: "instagram_business_basic,instagram_business_manage_messages,pages_show_list,pages_manage_metadata",
};

/**
 * One-click Messenger / Instagram link: same Facebook popup as WhatsApp,
 * then the seller picks which of his Pages to connect. Page tokens are
 * cached server-side during the pick — the browser never sees a token.
 */
function FacebookConnect() {
  const [status, setStatus] = useState<FacebookStatus | null>(null);
  const [platform, setPlatform] = useState<"messenger" | "instagram" | null>(null);
  const [pages, setPages] = useState<PageOption[] | null>(null);
  const [selectedPage, setSelectedPage] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [fbError, setFbError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/dashboard/facebook");
    const body = (await res.json().catch(() => null)) as (FacebookStatus & { error?: string }) | null;
    if (!res.ok || !body || body.error) {
      setFbError(body?.error ?? "Could not load Messenger/Instagram status.");
      return;
    }
    setStatus(body);
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);

  async function link(target: "messenger" | "instagram") {
    if (!status?.appId) return;
    setBusy(true);
    setFbError(null);
    setNote(null);
    setPages(null);
    setPlatform(target);
    try {
      const FB = await loadFacebookSdk(status.appId);
      const code = await new Promise<string | null>((resolve) => {
        FB.login((res) => resolve(res.authResponse?.code ?? null), {
          scope: PLATFORM_SCOPES[target],
          response_type: "code",
          override_default_response_type: true,
        });
      });
      if (!code) throw new Error("Facebook login cancelled.");
      const res = await fetch("/api/dashboard/facebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exchange", code }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; pages?: PageOption[] } | null;
      if (!res.ok || !body?.pages) throw new Error(body?.error ?? "Could not list your Pages.");
      if (body.pages.length === 0) throw new Error("No Facebook Page found on this account. Create a Page first, then retry.");
      setPages(body.pages);
      setSelectedPage(body.pages[0].pageId);
    } catch (err) {
      setFbError(err instanceof Error ? err.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    if (!platform || !selectedPage) return;
    setBusy(true);
    setFbError(null);
    try {
      const res = await fetch("/api/dashboard/facebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", platform, pageId: selectedPage }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; pageName?: string; username?: string | null } | null;
      if (!res.ok) throw new Error(body?.error ?? "Connection failed.");
      setNote(
        platform === "messenger"
          ? `Messenger connected to ${body?.pageName ?? "your Page"}. Buyers can now DM the Page.`
          : `Instagram connected${body?.username ? ` (@${body.username})` : ""}. Buyers can now DM the account.`,
      );
      setPages(null);
      await load();
    } catch (err) {
      setFbError(err instanceof Error ? err.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(target: "messenger" | "instagram") {
    setBusy(true);
    setFbError(null);
    await fetch("/api/dashboard/facebook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect", platform: target }),
    }).catch(() => undefined);
    setBusy(false);
    await load();
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/70">
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="size-4 text-brand-terracotta" />
          Messenger &amp; Instagram
        </CardTitle>
        <CardDescription>
          Same one-click Facebook link as WhatsApp: pick a Page, buyers DM it, the agent answers.
          Webhook for both objects: <code className="font-mono text-xs">{status?.webhookUrl ?? ""}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {fbError ? (
          <p role="alert" className="rounded-xl border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-fg">
            {fbError}
          </p>
        ) : null}
        {note ? (
          <p className="flex items-center gap-2 rounded-xl border border-status-success-border bg-status-success-bg px-4 py-2.5 text-sm font-medium text-status-success-fg">
            <CheckCircle2 className="size-4" />
            {note}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Messenger</p>
              <Badge variant={status?.messenger.connected ? "success" : "outline"}>
                {status?.messenger.connected ? `Connected · ${status.messenger.pageName ?? status.messenger.pageId}` : "Not connected"}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button type="button" disabled={busy || !status?.oauthConfigured} onClick={() => void link("messenger")}>
                <Link2 className="size-3.5" />
                Link Messenger
              </Button>
              {status?.messenger.connected ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => void disconnect("messenger")}>
                  Disconnect
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Instagram</p>
              <Badge variant={status?.instagram.connected ? "success" : "outline"}>
                {status?.instagram.connected ? `Connected${status.instagram.username ? ` · @${status.instagram.username}` : ""}` : "Not connected"}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button type="button" disabled={busy || !status?.oauthConfigured} onClick={() => void link("instagram")}>
                <Link2 className="size-3.5" />
                Link Instagram
              </Button>
              {status?.instagram.connected ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => void disconnect("instagram")}>
                  Disconnect
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Needs an Instagram Business/Creator account linked to the Facebook Page — personal accounts cannot be connected.
            </p>
          </div>
        </div>

        {status && !status.oauthConfigured ? (
          <p className="text-xs text-muted-foreground">
            Not enabled on this server yet: set <code>META_APP_ID</code> and <code>META_APP_SECRET</code> in{" "}
            <code>.env.local</code> (the same Meta app as WhatsApp), add the Messenger and Instagram products to it,
            and subscribe both the Page and Instagram webhook objects to the URL above.
          </p>
        ) : null}

        {pages && platform ? (
          <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
            <p className="text-sm font-semibold text-foreground">
              Choose the Page to connect for {platform === "messenger" ? "Messenger" : "Instagram"}:
            </p>
            {pages.map((page) => (
              <label key={page.pageId} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="fb-page"
                  value={page.pageId}
                  checked={selectedPage === page.pageId}
                  onChange={() => setSelectedPage(page.pageId)}
                />
                <span className="font-medium text-foreground">{page.pageName}</span>
                {platform === "instagram" ? (
                  <span className="text-xs text-muted-foreground">
                    {page.instagram ? `@${page.instagram.username ?? page.instagram.id}` : "no Instagram linked"}
                  </span>
                ) : null}
              </label>
            ))}
            <Button type="button" className="mt-1 w-fit" disabled={busy} onClick={() => void connect()}>
              <PlugZap className="size-3.5" />
              Connect this Page
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
