import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle as CheckCircle2,
  CpuChip01 as Cpu,
  FileCheck01 as FileCheck2,
  MarkerPin01 as MapPin,
  Microphone01 as Mic,
  FaceId as ScanEye,
  ShieldTick as ShieldCheck,
  Stars01 as Sparkles,
} from "@untitledui/icons";
import { InstagramIcon, MessengerIcon, WhatsAppIcon } from "@/components/brand-icons";
import { Badge } from "@/components/base/badges/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import { DemoAccountButton, SiteBar } from "@/components/site-bar";
import { providerStatus } from "@/lib/env";

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <Badge color={ok ? "success" : "warning"}>
      <span className={`size-1.5 rounded-full ${ok ? "bg-utility-green-600" : "bg-utility-yellow-600"}`} />
      {ok ? "Ready" : "Missing"}
    </Badge>
  );
}

async function StatusSection() {
  await connection();
  const status = providerStatus();
  const rows = [
    {
      label: "Meta Model API",
      sub: `${status.models.spark} · ${status.models.sam} · ${status.models.asr}`,
      ok: status.metaModelApi,
    },
    {
      label: "Baseten — Muse Spark Open",
      sub: status.models.sparkOpen,
      ok: status.baseten,
    },
    {
      label: "Perception Encoder (Modal / Truss)",
      sub: "PE-Core-L14-336 · 1024-dim cosine",
      ok: status.basetenPe,
    },
    {
      label: "Supabase Public Client",
      sub: "Postgres + pgvector + Storage",
      ok: status.supabase,
    },
    {
      label: "Supabase Secret Key",
      sub: "Server & courier worker only",
      ok: status.supabaseAdmin,
    },
  ];
  return (
    <section className="mt-16 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
      <Card>
        <CardHeader className="border-b border-secondary/70">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="size-4 text-brand-secondary" />
                Provider Telemetry
              </CardTitle>
              <CardDescription>
                Live environment key presence check. Secrets remain server-side only.
              </CardDescription>
            </div>
            <Badge color="gray" className="font-mono">
              5 endpoints
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-secondary/60">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary">{row.label}</p>
                <p className="truncate font-mono text-xs text-tertiary">{row.sub}</p>
              </div>
              <StatusBadge ok={row.ok} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="flex flex-col justify-between">
        <CardHeader className="border-b border-secondary/70">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-utility-blue-600" />
            Active Runtime Config
          </CardTitle>
          <CardDescription>Deterministic routing &amp; cassette replay switches.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col justify-between gap-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-secondary/80 bg-tertiary/45 p-3">
              <p className="text-[10px] font-semibold tracking-wider text-tertiary uppercase">LLM Provider</p>
              <p className="mt-1 font-mono text-sm font-semibold text-primary">{status.llmProvider}</p>
            </div>
            <div className="rounded-xl border border-secondary/80 bg-tertiary/45 p-3">
              <p className="text-[10px] font-semibold tracking-wider text-tertiary uppercase">ASR Engine</p>
              <p className="mt-1 font-mono text-sm font-semibold text-primary">{status.asrProvider}</p>
            </div>
            <div className="rounded-xl border border-secondary/80 bg-tertiary/45 p-3">
              <p className="text-[10px] font-semibold tracking-wider text-tertiary uppercase">Catalog Matcher</p>
              <p className="mt-1 font-mono text-sm font-semibold text-primary">{status.matcher}</p>
            </div>
            <div className="rounded-xl border border-secondary/80 bg-tertiary/45 p-3">
              <p className="text-[10px] font-semibold tracking-wider text-tertiary uppercase">AI Mode</p>
              <p className="mt-1 font-mono text-sm font-semibold text-brand-secondary">{status.aiMode}</p>
            </div>
          </div>

          <div className="rounded-xl bg-primary-solid p-3.5 text-xs text-white/85">
            <p className="font-medium text-brand-200">Model proposes, code decides</p>
            <p className="mt-1 leading-relaxed text-white/70">
              All millime calculations, floor clamping, risk badges, and order mutations execute in deterministic
              TypeScript.
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

const CHANNELS = [
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    href: "/demo?platform=whatsapp",
    badge: "Voice + Pin Link",
    accentBg: "bg-[#25D366]",
    icon: WhatsAppIcon,
    desc: "Buyers send Derja voice notes & product screenshots, bargain down to your floor, tap native buttons, and confirm their door GPS pin.",
  },
  {
    id: "instagram",
    name: "Instagram Stories & DM",
    href: "/demo?platform=instagram",
    badge: "Story Match",
    accentBg: "bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5]",
    icon: InstagramIcon,
    desc: "Buyers reply directly to your Instagram Stories. SAM 3.1 cuts out the garment, PE-Core matches your catalog, and DM quick pills close the COD order.",
  },
  {
    id: "messenger",
    name: "Facebook Messenger",
    href: "/demo?platform=messenger",
    badge: "Page Shop",
    accentBg: "bg-[#0084FF]",
    icon: MessengerIcon,
    desc: "Answers Facebook Page shoppers in Tunisian Derja 24/7 with unified stock, risk scoring, and First Delivery waybills.",
  },
] as const;

const MODELS = [
  {
    name: "SAM 3.1",
    role: "The eye",
    desc: "Cuts the garment out of a screenshot so the matcher sees the product, not the story background.",
  },
  {
    name: "Perception Encoder",
    role: "Catalog match",
    desc: "PE-Core turns that cutout into a 1024-d vector and finds the closest product in your shop.",
  },
  {
    name: "Muse Spark",
    role: "Understanding & Geo",
    desc: "Extracts Derja intents, translates fuzzy neighborhood/landmark descriptions for OSM, and phrases floor-checked replies.",
  },
  {
    name: "Muse Voice",
    role: "Voice notes",
    desc: "Transcribes a Tunisian voice note so a photo and a voice can land in the same turn.",
  },
];

const PIPELINE_STEPS = [
  {
    step: "01",
    title: "Screenshot & Derja Voice",
    desc: "SAM 3.1 isolates the garment; Perception Encoder matches your catalog in 1024-d vector space while Muse Voice transcribes Tunisian Derja.",
    icon: ScanEye,
    tag: "SAM 3.1 + PE-Core",
  },
  {
    step: "02",
    title: "Floor-Safe Bargaining",
    desc: "Concession ladder (50% → 80% → 100%) rounded to 0.5 DT and strictly clamped at your floor price. Every reply passes the price firewall.",
    icon: ShieldCheck,
    tag: "Millimes Firewall",
  },
  {
    step: "03",
    title: "AI Description to GPS Pin",
    desc: "Muse Spark + trigram OSM + 2-landmark triangulation turn natural Derja directions ('wra 9ahwet Cosmitto Ennasr') into an exact door pin.",
    icon: MapPin,
    tag: "Muse Spark + OSM",
  },
  {
    step: "04",
    title: "Risk Check & Courier Waybill",
    desc: "Return/cancellation risk scoring gates checkout. On seller approval, our agent fills First Delivery, verifies read-back, and prints the A6 waybill.",
    icon: FileCheck2,
    tag: "Fail-Closed Dispatch",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-dot-grid">
      <SiteBar />
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
        {/* Hero Section */}
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-secondary bg-primary px-3 py-1 text-xs font-medium text-primary shadow-2xs">
              <span className="size-2 rounded-full bg-brand-solid" />
              <span>Tunisian Social Commerce · WhatsApp + Instagram + Messenger</span>
            </div>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-primary sm:text-5xl lg:text-[3.35rem] lg:leading-[1.08]">
              <span className="font-display font-semibold text-brand-secondary">Wassalha</span> — a seller who answers,
              bargains, and pins the door.
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-tertiary sm:text-lg">
              Instagram Story screenshot or WhatsApp Derja voice note in, a matched catalog product out. The price never
              drops under your floor. Natural landmark descriptions snap to a GPS door pin. You approve the waybill.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/demo"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-solid px-6 text-sm font-semibold text-white shadow-xs-skeuomorphic transition-[transform,background-color] duration-150 ease-linear hover:bg-brand-solid_hover active:scale-[0.97]"
              >
                <span>Open live demo</span>
                <ArrowRight className="size-4 text-white/85" />
              </Link>
              <Link
                href="/demo?platform=instagram"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-secondary bg-primary px-5 text-sm font-medium text-primary shadow-2xs transition-colors hover:bg-secondary"
              >
                <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white">
                  <InstagramIcon className="size-3.5" />
                </span>
                <span>Instagram view</span>
              </Link>
              <DemoAccountButton label="Enter demo account" />
            </div>
          </div>

          {/* Interactive Turn Anatomy Card */}
          <div className="relative rounded-3xl border border-secondary/90 bg-primary p-5 shadow-lg">
            <div className="flex items-center justify-between border-b border-secondary/70 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-full bg-primary-solid text-xs font-semibold text-white">
                  W
                </div>
                <div>
                  <p className="text-xs font-semibold text-primary">Live Turn Pipeline</p>
                  <p className="text-[11px] text-tertiary">Instagram Story / WhatsApp → Waybill FD</p>
                </div>
              </div>
              <Badge color="brand" className="font-mono">
                100% Deterministic
              </Badge>
            </div>

            <div className="mt-4 flex flex-col gap-2.5 text-xs">
              <div className="flex items-start gap-3 rounded-xl bg-tertiary/60 p-3">
                <Mic className="mt-0.5 size-4 shrink-0 text-brand-secondary" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-primary">Buyer Voice + Story Screenshot</span>
                    <span className="font-mono text-[10px] tabular-nums text-tertiary">ASR 1.8s</span>
                  </div>
                  <p className="mt-0.5 text-tertiary" dir="auto">
                    &ldquo;n7eb el sweat el jaune taille L, noskon fi Ennasr wra 9ahwet Cosmitto&rdquo;
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-secondary/80 bg-primary p-3">
                <ScanEye className="mt-0.5 size-4 shrink-0 text-utility-blue-600" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-primary">SAM 3.1 Cutout + PE Match</span>
                    <Badge color="blue" className="font-mono tabular-nums">
                      0.98 cos
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-tertiary">
                    Matched <strong className="text-primary">Sweat jaune (L)</strong> · List 120DT · Floor 105DT
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-secondary/80 bg-primary p-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-brand-secondary" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-primary">AI Landmark Resolution &amp; Ladder</span>
                    <span className="font-mono font-semibold tabular-nums text-primary">112,500 DT</span>
                  </div>
                  <p className="mt-0.5 text-tertiary">
                    Centered pin on <strong className="text-primary">Café Cosmitto · Ennasr</strong> + 7DT delivery
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-primary-solid px-3.5 py-2.5 text-white">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-utility-green-400" />
                  <span className="font-medium">Buyer tapped Akked → Waybill Ready</span>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-white/80">FD0000000123</span>
              </div>
            </div>
          </div>
        </div>

        {/* Omnichannel Demo Preview Cards */}
        <section className="mt-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">
                Omnichannel Demo
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-primary">
                Test the buyer experience on every Tunisian social inbox
              </h2>
            </div>
            <Link href="/demo" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-secondary">
              <span>Switch live inside the simulator</span>
              <ArrowUpRight className="size-4" />
            </Link>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {CHANNELS.map((ch) => {
              const Icon = ch.icon;
              return (
                <Link
                  key={ch.id}
                  href={ch.href}
                  className="group flex flex-col justify-between rounded-2xl border border-secondary bg-primary p-5 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className={`flex size-10 items-center justify-center rounded-xl text-white shadow-xs ${ch.accentBg}`}>
                        <Icon className="size-5" />
                      </span>
                      <Badge color="gray" size="sm">
                        {ch.badge}
                      </Badge>
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-primary group-hover:text-brand-secondary">
                      {ch.name}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-tertiary">{ch.desc}</p>
                  </div>
                  <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-secondary">
                    <span>Launch {ch.name} demo</span>
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* 4-Step Architecture Grid */}
        <section className="mt-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">
                System Architecture
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-primary">
                Four guardrails between a DM and a courier truck
              </h2>
            </div>
            <p className="text-xs text-tertiary">
              Zero hallucinated prices · Zero unpinned addresses · Zero unverified waybills
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE_STEPS.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.step} className="justify-between">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <span className="flex size-9 items-center justify-center rounded-xl bg-tertiary text-primary ring-1 ring-secondary">
                        <Icon className="size-4 text-brand-secondary" />
                      </span>
                      <span className="font-mono text-xs font-semibold tabular-nums text-tertiary">{item.step}</span>
                    </div>
                    <CardTitle className="mt-3 text-base">{item.title}</CardTitle>
                    <CardDescription className="mt-1">{item.desc}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Badge color="gray" className="font-mono text-[10px]">
                      {item.tag}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mt-16">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">Meta AI Stack</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-primary">The models behind the agent</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODELS.map((model) => (
              <Card key={model.name}>
                <CardHeader>
                  <Badge color="brand" className="w-fit font-mono text-[10px]">
                    {model.role}
                  </Badge>
                  <CardTitle className="mt-3 text-base">{model.name}</CardTitle>
                  <CardDescription className="mt-1">{model.desc}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <Suspense fallback={<p className="mt-16 text-sm text-tertiary">Loading provider telemetry…</p>}>
          <StatusSection />
        </Suspense>
      </div>
    </main>
  );
}
