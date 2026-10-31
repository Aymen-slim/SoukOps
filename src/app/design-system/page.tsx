import { Suspense } from "react";
import {
  Cpu,
  Layers,
  MapPin,
  Palette,
  Sparkles,
  Type,
} from "lucide-react";
import { SiteBar } from "@/components/site-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RiskBadge } from "@/app/dashboard/bits";
import { formatMillimesForChat as money } from "@/lib/domain/pricing";

const SURFACE_TOKENS = [
  { name: "Canvas (--background)", token: "bg-background", value: "oklch(0.976 0.008 82)", text: "text-foreground" },
  { name: "Surface Raised (--card)", token: "bg-card", value: "oklch(0.996 0.003 85)", text: "text-foreground" },
  { name: "Surface Sunken (--muted)", token: "bg-muted", value: "oklch(0.946 0.012 80)", text: "text-foreground" },
  { name: "Medina Ink (--surface-ink)", token: "bg-surface-ink", value: "oklch(0.185 0.018 55)", text: "text-white" },
];

const BRAND_TOKENS = [
  { name: "Terracotta Clay", token: "bg-brand-terracotta", value: "oklch(0.56 0.165 36)", text: "text-white" },
  { name: "Pin Saffron Gold", token: "bg-brand-saffron", value: "oklch(0.83 0.165 84)", text: "text-surface-ink" },
  { name: "Telemetry Cobalt", token: "bg-brand-cobalt", value: "oklch(0.49 0.16 254)", text: "text-white" },
  { name: "Chat Sand Wallpaper", token: "bg-chat-pattern", value: "#F3EFE6", text: "text-surface-ink" },
];

const STATUS_TOKENS = [
  {
    name: "Success / Low Risk",
    bg: "bg-status-success-bg",
    fg: "text-status-success-fg",
    border: "border-status-success-border",
    usage: "Risk ≥ 70, Provider Ready, Waybill Created",
  },
  {
    name: "Warning / Medium Risk",
    bg: "bg-status-warning-bg",
    fg: "text-status-warning-fg",
    border: "border-status-warning-border",
    usage: "Risk 40–69, AI Paused, Worker Offline",
  },
  {
    name: "Danger / High Risk",
    bg: "bg-status-danger-bg",
    fg: "text-status-danger-fg",
    border: "border-status-danger-border",
    usage: "Risk < 40, Read-back Diff, Firewall Reject",
  },
  {
    name: "Info / AI Telemetry",
    bg: "bg-status-info-bg",
    fg: "text-status-info-fg",
    border: "border-status-info-border",
    usage: "SAM 3.1, Muse Spark, PE-Core Trace Events",
  },
];

export default function DesignSystemPage() {
  return (
    <main className="min-h-screen bg-medina-grid">
      <Suspense fallback={null}>
        <SiteBar />
      </Suspense>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-12 sm:px-6">
        {/* Header */}
        <div className="flex flex-col gap-3 border-b border-border pb-8">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium">
            <Sparkles className="size-3.5 text-brand-terracotta" />
            <span>Wassalha Design System v1.0</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Souk &amp; <span className="font-display italic font-normal text-brand-terracotta">Signal</span>
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            Warm Tunisian limestone surfaces paired with high-contrast financial, geospatial, and AI telemetry primitives. Every token is built in OKLCH with strict tabular numerals for millimes, coordinates, and model timings.
          </p>
        </div>

        {/* 1. Color Tokens */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <Palette className="size-5 text-brand-terracotta" />
            <h2 className="text-xl font-semibold tracking-tight">01. Color System &amp; Surfaces</h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Surface &amp; Ink Hierarchy</CardTitle>
                <CardDescription>Warm limestone canvas and alabaster cards prevent sterile white glare.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {SURFACE_TOKENS.map((s) => (
                  <div
                    key={s.name}
                    className={`flex h-24 flex-col justify-between rounded-xl border border-border p-3.5 ${s.token} ${s.text}`}
                  >
                    <span className="text-xs font-semibold">{s.name}</span>
                    <span className="font-mono text-[11px] opacity-80">{s.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Brand &amp; Accent Palette</CardTitle>
                <CardDescription>Tunisian terracotta clay, GPS pin saffron gold, and telemetry cobalt.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {BRAND_TOKENS.map((b) => (
                  <div
                    key={b.name}
                    className={`flex h-24 flex-col justify-between rounded-xl border border-border p-3.5 ${b.token} ${b.text}`}
                  >
                    <span className="text-xs font-semibold">{b.name}</span>
                    <span className="font-mono text-[11px] opacity-80">{b.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Semantic Status &amp; Risk Tokens</CardTitle>
              <CardDescription>Paired foreground, background, and border tokens with WCAG AA contrast compliance.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STATUS_TOKENS.map((st) => (
                <div
                  key={st.name}
                  className={`flex flex-col justify-between gap-3 rounded-xl border p-4 ${st.bg} ${st.fg} ${st.border}`}
                >
                  <span className="text-xs font-semibold">{st.name}</span>
                  <p className="text-[11px] leading-relaxed opacity-90">{st.usage}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        {/* 2. Typography */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <Type className="size-5 text-brand-terracotta" />
            <h2 className="text-xl font-semibold tracking-tight">02. Typography &amp; Tabular Numerals</h2>
          </div>

          <Card>
            <CardContent className="divide-y divide-border/70">
              <div className="grid gap-2 py-4 first:pt-0 sm:grid-cols-[200px_1fr] sm:items-baseline">
                <div className="text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Editorial Display</p>
                  <p className="font-mono">Instrument Serif · 48px</p>
                </div>
                <p className="font-display text-4xl italic text-brand-terracotta sm:text-5xl">
                  Wassalha — Du vocal Derja au bordereau livreur.
                </p>
              </div>

              <div className="grid gap-2 py-4 sm:grid-cols-[200px_1fr] sm:items-baseline">
                <div className="text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Heading H1</p>
                  <p className="font-mono">Geist SemiBold · 30px</p>
                </div>
                <p className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Approve, check the risk, then send.
                </p>
              </div>

              <div className="grid gap-2 py-4 sm:grid-cols-[200px_1fr] sm:items-baseline">
                <div className="text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Bilingual / Derja Body</p>
                  <p className="font-mono">Geist Regular · 14px · dir=&quot;auto&quot;</p>
                </div>
                <p className="text-sm leading-relaxed" dir="auto">
                  Merhba bik! El sweat jaune taille L mawjoud. Akher soum نجم نخليهولك بـ 105DT + 7DT livraison ל-Tunis.
                </p>
              </div>

              <div className="grid gap-2 py-4 last:pb-0 sm:grid-cols-[200px_1fr] sm:items-baseline">
                <div className="text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Technical &amp; Millimes</p>
                  <p className="font-mono">Geist Mono · Tabular Nums</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 font-mono text-sm tabular-nums">
                  <span className="rounded-md bg-muted px-2.5 py-1 font-semibold">{money(112_500)}</span>
                  <span className="rounded-md bg-muted px-2.5 py-1">FD0000000123</span>
                  <span className="rounded-md bg-muted px-2.5 py-1">36.8065° N, 10.1815° E</span>
                  <span className="rounded-md bg-muted px-2.5 py-1 text-emerald-700">312ms</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 3. Interactive Primitives */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-brand-terracotta" />
            <h2 className="text-xl font-semibold tracking-tight">03. Buttons, Badges &amp; Controls</h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Button Variants &amp; Sizes</CardTitle>
                <CardDescription>
                  Tactile <code>scale(0.97)</code> press feedback on <code>:active</code> with <code>150ms cubic-bezier(0.23, 1, 0.32, 1)</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button variant="default">Default Ink</Button>
                  <Button variant="brand">Saffron Brand</Button>
                  <Button variant="terracotta">Terracotta</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="destructive">Destructive</Button>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 border-t border-border/70 pt-4">
                  <Button size="xs" variant="outline">Size XS</Button>
                  <Button size="sm" variant="outline">Size SM</Button>
                  <Button size="default" variant="default">Size Default</Button>
                  <Button size="lg" variant="brand">Size LG</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Semantic Badges &amp; Risk Pills</CardTitle>
                <CardDescription>
                  Used across order queues, AI telemetry traces, and courier dispatch states.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default">Default</Badge>
                  <Badge variant="brand">Brand Saffron</Badge>
                  <Badge variant="success">Success</Badge>
                  <Badge variant="warning">Warning</Badge>
                  <Badge variant="destructive">Danger</Badge>
                  <Badge variant="info">Telemetry Info</Badge>
                  <Badge variant="outline">Outline</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 border-t border-border/70 pt-4">
                  <span className="text-xs font-medium text-muted-foreground">Risk Engine:</span>
                  <RiskBadge level="green" score={90} />
                  <RiskBadge level="yellow" score={55} />
                  <RiskBadge level="red" score={20} />
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* 4. Domain Patterns */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <Cpu className="size-5 text-brand-terracotta" />
            <h2 className="text-xl font-semibold tracking-tight">04. Domain Component Patterns</h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Chat Bubble Specimen */}
            <Card>
              <CardHeader>
                <CardTitle>WhatsApp Bubble Primitives</CardTitle>
                <CardDescription>Confirmation buttons &amp; GPS pin pill inside the buyer simulator.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-chat-pattern p-3.5">
                  <div className="self-end rounded-2xl rounded-br-sm bg-surface-ink px-3.5 py-2 text-xs text-white shadow-2xs">
                    noskon fi Tunis ba7dha Pharmacie de Nuit El Manar
                  </div>
                  <div className="self-start rounded-2xl rounded-bl-sm bg-card p-3 text-xs text-foreground ring-1 ring-border shadow-2xs">
                    <p>Bech el livreur yousel el bab eddar, akked blassetek:</p>
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-saffron px-3 py-1.5 text-[11px] font-semibold text-surface-ink">
                      <MapPin className="size-3" />
                      Confirm my location
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Trace Event Specimen */}
            <Card>
              <CardHeader>
                <CardTitle>AI Trace Event Row</CardTitle>
                <CardDescription>Real-time observability for every Meta &amp; Baseten call.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2.5">
                <div className="rounded-xl border border-border/80 border-l-4 border-l-emerald-600 bg-card p-3 text-xs shadow-2xs">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="success" className="font-mono">negotiation.offer</Badge>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">284ms</span>
                  </div>
                  <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">meta / muse-spark · phrasing: spark</p>
                  <p className="mt-1 text-foreground">Firewall passed: 112,500 DT (Rung 1)</p>
                </div>

                <div className="rounded-xl border border-status-danger-border border-l-4 border-l-red-600 bg-status-danger-bg/60 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="destructive" className="font-mono">courier.mismatch</Badge>
                    <span className="font-mono text-[11px] tabular-nums text-status-danger-fg">Fail-closed</span>
                  </div>
                  <p className="mt-1.5 text-status-danger-fg">
                    Portal read-back halted: locality_id mismatch.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Form & Ledger Specimen */}
            <Card>
              <CardHeader>
                <CardTitle>Form Controls &amp; Ledger</CardTitle>
                <CardDescription>Seller inputs and deterministic millime breakdown.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="demo-input">Product Floor Price (DT)</Label>
                  <Input id="demo-input" defaultValue="105" className="font-mono tabular-nums" />
                </div>
                <div className="mt-1 rounded-xl bg-muted/60 p-3 text-xs">
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-mono tabular-nums">{money(105_500)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Delivery (Tunis)</span>
                    <span className="font-mono tabular-nums">{money(7_000)}</span>
                  </div>
                  <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-semibold">
                    <span>Total COD</span>
                    <span className="font-mono tabular-nums">{money(112_500)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
