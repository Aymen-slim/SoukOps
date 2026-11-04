"use client";

import { FormEvent, useEffect, useState } from "react";
import { Copy01 as Copy, CreditCard01 as CreditCard, Link02 as Link2, MarkerPin01 as MapPin, MessageCircle01 as MessageCircle, Zap as PlugZap, Save01 as Save, Send01 as Send, Truck01 as Truck } from "@untitledui/icons";
import { InstagramIcon, MessengerIcon, WhatsAppIcon } from "@/components/brand-icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import { Input } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { NativeSelect } from "@/components/base/select/select-native";
import { RadioButton, RadioGroup } from "@/components/base/radio-buttons/radio-buttons";
import { Table, TableCard } from "@/components/application/table/table";
import { Alert } from "@/components/foundations/alert/alert";
import { Modal } from "@/components/foundations/modal/modal";
import { invalidateClientSession } from "@/lib/auth/client-session";
import { money } from "../bits";
import { getCachedDashboard, setCachedDashboard } from "../use-poll";

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
  businessType?: string;
  businessDescription?: string;
  suggestedBusinessType?: string;
  fees: FeeRow[];
}

const BUSINESS_OPTIONS = [
  { value: "clothing", label: "Clothing" },
  { value: "shoes", label: "Shoes" },
  { value: "beauty", label: "Beauty & cosmetics" },
  { value: "food", label: "Food & groceries" },
  { value: "electronics", label: "Electronics" },
  { value: "home", label: "Home goods" },
  { value: "general", label: "General / mixed" },
];

export function SettingsClient() {
  const cached = getCachedDashboard<Settings & { shopName?: string }>("/api/dashboard/settings");
  const [settings, setSettings] = useState<Settings | null>(cached);
  const [shopName, setShopName] = useState(cached?.shopName ?? "");
  const [paymentLink, setPaymentLink] = useState(cached?.paymentLink ?? "");
  const [thresholdDt, setThresholdDt] = useState(cached?.freeDeliveryThresholdMillimes == null ? "" : String(cached.freeDeliveryThresholdMillimes / 1000));
  const [mode, setMode] = useState<Settings["courierMode"]>(cached?.courierMode ?? "mock_api");
  const [businessType, setBusinessType] = useState(cached?.businessType ?? "general");
  const [businessDescription, setBusinessDescription] = useState(cached?.businessDescription ?? "");
  const [suggestedBusinessType, setSuggestedBusinessType] = useState<string | null>(cached?.suggestedBusinessType ?? null);




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
          setCachedDashboard("/api/dashboard/settings", body);
          setSettings(body);
          setShopName((body as Settings & { shopName?: string }).shopName ?? "");
          setPaymentLink(body.paymentLink ?? "");
          setThresholdDt(
            body.freeDeliveryThresholdMillimes == null
              ? ""
              : String(body.freeDeliveryThresholdMillimes / 1000),
          );
          setMode(body.courierMode);
          setBusinessType(body.businessType ?? "general");
          setBusinessDescription(body.businessDescription ?? "");
          setSuggestedBusinessType(body.suggestedBusinessType ?? null);
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
        shopName: shopName.trim() || undefined,
        paymentLink: paymentLink.trim() || null,
        freeDeliveryThresholdMillimes: threshold,
        courierMode: mode,
        businessType,
        businessDescription: businessDescription.trim(),
      }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setError(body?.error ?? "Couldn't save.");
      return;
    }
    invalidateClientSession();
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">
          Merchant Configuration
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
          Settings
        </h1>
        <p className="mt-0.5 text-sm text-tertiary">
          Payment link, free delivery, courier mode.
        </p>
      </div>

      {error ? <Alert color="error">{error}</Alert> : null}
      {saved ? <Alert color="success">Settings saved.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <Card className="h-fit">
          <CardHeader className="border-b border-secondary/70">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-4 text-brand-secondary" />
              Shop
            </CardTitle>
            <CardDescription>
              Red-risk buyer payment link, free delivery threshold, and courier adapter.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="shop-name">Shop name</Label>
                <Input id="shop-name" aria-label="Shop name" value={shopName} onChange={setShopName} />
              </div>
              <div className="flex flex-col gap-1.5">
                <NativeSelect
                  label="What kind of business is this?"
                  value={businessType}
                  onChange={(event) => setBusinessType(event.target.value)}
                  options={BUSINESS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                />
                <p className="text-xs text-tertiary">
                  The AI asks only what fits your products (no clothing size for food or beauty) and uses your words.
                  {suggestedBusinessType && suggestedBusinessType !== businessType
                    ? ` Suggested from your catalog: ${BUSINESS_OPTIONS.find((o) => o.value === suggestedBusinessType)?.label ?? suggestedBusinessType}.`
                    : ""}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sells">What we sell (one line)</Label>
                <Input
                  id="sells"
                  aria-label="What we sell (one line)"
                  value={businessDescription}
                  onChange={setBusinessDescription}
                  placeholder="e.g. Women's clothing, hoodies and dresses"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay">Payment link (Flouci / Konnect)</Label>
                <Input aria-label="Payment link (Flouci / Konnect)"
                  id="pay"
                  value={paymentLink}
                  onChange={setPaymentLink}
                  placeholder="https://flouci.com/pay/..."
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="threshold">Free delivery from (DT, empty = never)</Label>
                <Input aria-label="Free delivery from (DT, empty = never)"
                  id="threshold"
                  value={thresholdDt}
                  onChange={setThresholdDt}
                  inputMode="decimal"
                  inputClassName="font-mono tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <NativeSelect
                  label="Courier mode"
                  value={mode}
                  onChange={(event) => setMode(event.target.value as Settings["courierMode"])}
                  options={[
                    { value: "mock_api", label: "API mock" },
                    { value: "browser", label: "Browser agent" },
                    { value: "real_api", label: "Real First Delivery API" },
                  ]}
                />
              </div>
              <Button type="submit" className="w-fit">
                <Save className="size-3.5" />
                Save
              </Button>
            </form>
          </CardContent>
        </Card>

        <TableCard.Root>
          <TableCard.Header
            title="Delivery fees"
            badge={`${(settings?.fees ?? []).length} zones`}
            description="Deterministic governorate & First Delivery locality_id mapping."
            contentTrailing={<Truck className="size-5 text-brand-secondary" aria-hidden="true" />}
          />
          <Table aria-label="Delivery fees" size="sm">
            <Table.Header>
              <Table.Head label="Governorate" isRowHeader />
              <Table.Head label="Delegation" />
              <Table.Head label="locality_id" />
              <Table.Head label="Fee" />
            </Table.Header>
            <Table.Body>
              {(settings?.fees ?? []).map((fee) => (
                <Table.Row
                  key={`${fee.governorate}-${fee.delegation ?? ""}-${fee.locality_id ?? ""}`}
                  id={`${fee.governorate}-${fee.delegation ?? ""}-${fee.locality_id ?? ""}`}
                >
                  <Table.Cell>
                    <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                      <MapPin className="size-3 text-brand-secondary" />
                      {fee.governorate}
                    </span>
                  </Table.Cell>
                  <Table.Cell>{fee.delegation ?? "—"}</Table.Cell>
                  <Table.Cell>
                    {fee.locality_id != null ? (
                      <Badge color="gray" className="font-mono tabular-nums">
                        {fee.locality_id}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <span className="font-mono font-medium tabular-nums text-primary">
                      {money(fee.fee_millimes)}
                    </span>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </TableCard.Root>
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

/**
 * One-button WhatsApp Cloud API link: open the wizard, paste the two values
 * Meta gives you, test, save, then copy the webhook into Meta. The access
 * token is write-only — it is never displayed back.
 */
export function WhatsAppConnect() {
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
    const params = new URLSearchParams(window.location.search);
    const timer = setTimeout(() => {
      void load();
      if (params.get("platform") === "whatsapp") {
      if (params.get("social") === "connected") {
        setOpen(true);
        setNote(`WhatsApp linked: ${params.get("name") ?? "connected"}. Webhook subscribed automatically.`);
        } else if (params.get("social") === "error") {
          setOpen(true);
          setWaError(params.get("msg") ?? "Connection failed.");
        }
      }
    }, 0);
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
      <CardHeader className="border-b border-secondary/70">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-[#25D366] text-white">
                <WhatsAppIcon className="size-4" />
              </span>
              WhatsApp
            </CardTitle>
            <CardDescription>
              Receive orders on your real WhatsApp Business number (Meta Cloud API).
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge color={status?.configured ? "success" : "gray"}>
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
            <Alert color="error">{waError}</Alert>
          ) : null}
          {note ? (
            <Alert color="success">{note}</Alert>
          ) : null}

          <div className="flex flex-col gap-2 rounded-xl border border-secondary bg-tertiary/40 p-4">
            <p className="text-sm font-semibold text-primary">Easiest: one click with Facebook</p>
            <p className="text-sm text-tertiary">
              Log in with the shop&apos;s Facebook account, pick the WhatsApp number, confirm.
              No IDs or tokens to copy — Wassalha exchanges the code and subscribes the webhook automatically.
            </p>
            <a
              className={`inline-flex w-fit items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 ${status?.embedded.configured ? "" : "pointer-events-none opacity-50"}`}
              href="/api/meta/oauth/start?platform=whatsapp"
            >
              <WhatsAppIcon className="size-4" />
              Link WhatsApp
            </a>
            {status && !status.embedded.configured ? (
              <p className="text-xs text-tertiary">
                Not enabled on this server yet: set <code>META_APP_ID</code>, <code>META_APP_SECRET</code> and{" "}
                <code>WHATSAPP_EMBEDDED_CONFIG_ID</code> in <code>.env.local</code> (Meta app → Facebook Login for
                Business), or use the manual method below.
              </p>
            ) : null}
          </div>

          <p className="text-sm font-semibold text-primary">Manual method: paste your credentials</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-phone">Phone Number ID</Label>
              <Input aria-label="Phone Number ID" id="wa-phone" value={phoneNumberId} onChange={setPhoneNumberId} inputClassName="font-mono" placeholder="1065…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-waba">WhatsApp Business Account ID (optional)</Label>
              <Input aria-label="WhatsApp Business Account ID (optional)" id="wa-waba" value={wabaId} onChange={setWabaId} inputClassName="font-mono" placeholder="1098…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-token">Access Token {status?.tokenSet ? "(already saved — leave empty to keep it)" : ""}</Label>
              <Input id="wa-token" type="password" value={accessToken} onChange={setAccessToken} inputClassName="font-mono" placeholder="EAA…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-verify">Verify Token (paste it into Meta)</Label>
              <div className="flex gap-2">
                <Input aria-label="Verify Token (paste it into Meta)" id="wa-verify" value={verifyToken} onChange={setVerifyToken} inputClassName="font-mono" placeholder="wassalha-…" />
                <Button
                  type="button"
                  color="secondary"
                  onClick={() => setVerifyToken(`wassalha-${Math.random().toString(36).slice(2, 10)}`)}
                >
                  Generate
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" isDisabled={busy} onClick={() => void test(false)}>
              <PlugZap className="size-3.5" />
              Test connection
            </Button>
            <Button type="button" color="secondary" isDisabled={busy || !phoneNumberId.trim() || !verifyToken.trim()} onClick={() => void save()}>
              <Save className="size-3.5" />
              Save &amp; connect
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-primary">Manual method: paste the webhook into Meta</p>
            <p className="text-sm text-tertiary">
              In the Meta app: WhatsApp → Configuration → Webhook → Edit. Paste the URL and the Verify Token,
              save, then subscribe to the <code>messages</code>.
            </p>
            <div className="grid gap-2">
              <div className="flex gap-2">
                <Input isReadOnly value={status?.webhookUrl ?? ""} inputClassName="font-mono text-xs" aria-label="Webhook URL" />
                <Button type="button" color="secondary" onClick={() => void copy(status?.webhookUrl ?? "")}>
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              </div>
              <div className="flex gap-2">
                <Input isReadOnly value={verifyToken} inputClassName="font-mono text-xs" aria-label="Verify token" />
                <Button type="button" color="secondary" onClick={() => void copy(verifyToken)}>
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              </div>
            </div>
            <p className="text-xs text-tertiary">
              Local demo tip: expose this machine temporarily with an HTTPS tunnel and put that public URL
              dans <code>APP_BASE_URL</code>, otherwise Meta cannot call the webhook.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-primary">Manual method: get a test message</p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={testRecipient}
                onChange={setTestRecipient}
                inputClassName="w-56 font-mono"
                placeholder="Your mobile, e.g. 21622123456"
                inputMode="tel"
              />
              <Button type="button" color="secondary" isDisabled={busy || !testRecipient.trim()} onClick={() => void test(true)}>
                <Send className="size-3.5" />
                Send test message
              </Button>
            </div>
            <p className="text-xs text-tertiary">
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

/**
 * One-click Messenger / Instagram link: same Facebook popup as WhatsApp,
 * then the seller picks which of his Pages to connect. Page tokens are
 * cached server-side during the pick — the browser never sees a token.
 */
export function FacebookConnect() {
  const [status, setStatus] = useState<FacebookStatus | null>(null);
  const [platform, setPlatform] = useState<"messenger" | "instagram" | null>(null);
  const [pages, setPages] = useState<PageOption[] | null>(null);
  const [selectedPage, setSelectedPage] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState<"messenger" | "instagram" | null>(null);
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
    const params = new URLSearchParams(window.location.search);
    const social = params.get("social");
    const paramPlatform = params.get("platform");
    const timer = setTimeout(() => {
      void load();
      if ((paramPlatform !== "messenger" && paramPlatform !== "instagram") || !social) return;
      if (social === "error") {
        const msg = params.get("msg");
        setFbError(
          msg === "no_instagram_on_page"
            ? "No Instagram Business account is linked to that Page. Link one in Meta Business Settings, then retry."
            : (msg ?? "Connection failed."),
        );
      } else if (social === "pick") {
        setPlatform(paramPlatform);
        void fetch("/api/dashboard/facebook/pending")
          .then((res) => res.json())
          .then((body: { pages?: PageOption[] }) => {
            if (!body.pages?.length) return;
            setPages(body.pages);
            const preselected = params.get("page");
            setSelectedPage(
              preselected && body.pages.some((page) => page.pageId === preselected)
                ? preselected
                : body.pages[0].pageId,
            );
          })
          .catch(() => undefined);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

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
      <CardHeader className="border-b border-secondary/70">
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="size-4 text-brand-secondary" />
          Messenger &amp; Instagram
        </CardTitle>
        <CardDescription>
          Same one-click Facebook link as WhatsApp: pick a Page, buyers DM it, the agent answers.
          Webhook for both objects: <code className="font-mono text-xs">{status?.webhookUrl ?? ""}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {fbError ? (
          <Alert color="error">{fbError}</Alert>
        ) : null}
        {note ? (
          <Alert color="success">{note}</Alert>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-xl border border-secondary bg-tertiary/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                <span className="flex size-7 items-center justify-center rounded-lg bg-[#0084FF] text-white">
                  <MessengerIcon className="size-4" />
                </span>
                Messenger
              </p>
              <Badge color={status?.messenger.connected ? "success" : "gray"}>
                {status?.messenger.connected ? `Connected · ${status.messenger.pageName ?? status.messenger.pageId}` : "Not connected"}
              </Badge>
            </div>
            <div className="flex gap-2">
              <a
                className={`inline-flex items-center gap-2 rounded-lg bg-[#0084FF] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 ${status?.oauthConfigured ? "" : "pointer-events-none opacity-50"}`}
                href="/api/meta/oauth/start?platform=messenger"
              >
                <MessengerIcon className="size-4" />
                Link Messenger
              </a>
              {status?.messenger.connected ? (
                <Button type="button" color="secondary" isDisabled={busy} onClick={() => setConfirmDisconnect("messenger")}>
                  Disconnect
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-secondary bg-tertiary/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white">
                  <InstagramIcon className="size-4" />
                </span>
                Instagram
              </p>
              <Badge color={status?.instagram.connected ? "success" : "gray"}>
                {status?.instagram.connected ? `Connected${status.instagram.username ? ` · @${status.instagram.username}` : ""}` : "Not connected"}
              </Badge>
            </div>
            <div className="flex gap-2">
              <a
                className={`inline-flex items-center gap-2 rounded-lg bg-[#D62976] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 ${status?.oauthConfigured ? "" : "pointer-events-none opacity-50"}`}
                href="/api/meta/oauth/start?platform=instagram"
              >
                <InstagramIcon className="size-4" />
                Link Instagram
              </a>
              {status?.instagram.connected ? (
                <Button type="button" color="secondary" isDisabled={busy} onClick={() => setConfirmDisconnect("instagram")}>
                  Disconnect
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-tertiary">
              Needs an Instagram Business/Creator account linked to the Facebook Page — personal accounts cannot be connected.
            </p>
          </div>
        </div>

        {status && !status.oauthConfigured ? (
          <p className="text-xs text-tertiary">
            Not enabled on this server yet: set <code>META_APP_ID</code> and <code>META_APP_SECRET</code> in{" "}
            <code>.env.local</code> (the same Meta app as WhatsApp), add the Messenger and Instagram products to it,
            and subscribe both the Page and Instagram webhook objects to the URL above.
          </p>
        ) : null}

        {pages && platform ? (
          <div className="flex flex-col gap-2 rounded-xl border border-secondary p-4">
            <p className="text-sm font-semibold text-primary">
              Choose the Page to connect for {platform === "messenger" ? "Messenger" : "Instagram"}:
            </p>
            <RadioGroup
              aria-label="Facebook Page"
              value={selectedPage}
              onChange={setSelectedPage}
              className="flex flex-col gap-2"
            >
              {pages.map((page) => (
                <RadioButton
                  key={page.pageId}
                  value={page.pageId}
                  label={page.pageName}
                  hint={
                    platform === "instagram"
                      ? page.instagram
                        ? `@${page.instagram.username ?? page.instagram.id}`
                        : "no Instagram linked"
                      : undefined
                  }
                />
              ))}
            </RadioGroup>
            <Button type="button" className="mt-1 w-fit" isDisabled={busy} onClick={() => void connect()}>
              <PlugZap className="size-3.5" />
              Connect this Page
            </Button>
          </div>
        ) : null}

        <Modal
          isOpen={confirmDisconnect !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmDisconnect(null);
          }}
          title={`Disconnect ${confirmDisconnect === "instagram" ? "Instagram" : "Messenger"}?`}
          description="The agent will stop answering buyers on this channel. You can reconnect at any time."
          footer={
            <>
              <Button color="secondary" onPress={() => setConfirmDisconnect(null)}>
                Keep connected
              </Button>
              <Button
                color="primary-destructive"
                isDisabled={busy}
                onPress={() => {
                  const target = confirmDisconnect;
                  setConfirmDisconnect(null);
                  if (target) void disconnect(target);
                }}
              >
                Disconnect
              </Button>
            </>
          }
        />
      </CardContent>
    </Card>
  );
}
