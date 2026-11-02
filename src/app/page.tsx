import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, CheckCircle as CheckCircle2, CpuChip01 as Cpu, FileCheck01 as FileCheck2, MarkerPin01 as MapPin, Microphone01 as Mic, FaceId as ScanEye, ShieldTick as ShieldCheck, Stars01 as Sparkles } from "@untitledui/icons";
import { SiteBar } from "@/components/site-bar";
import { Badge } from "@/components/base/badges/badges";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/foundations/card/card";
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
          <CardDescription>
            Deterministic routing & cassette replay switches.
          </CardDescription>
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
              All millime calculations, floor clamping, risk badges, and order mutations execute in deterministic TypeScript.
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

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
    title: "Landmark to GPS Door Pin",
    desc: "Trigram OSM landmark resolution + triangulation centers a magic-link map so the buyer drags the pin directly onto their door.",
    icon: MapPin,
    tag: "OSM + Leaflet Pin",
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
              <span>Tunisian Social Commerce · Meta AI Stack</span>
            </div>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-primary sm:text-5xl lg:text-[3.35rem] lg:leading-[1.08]">
              <span className="font-display font-semibold text-brand-secondary">Wassalha</span>{" "}
              — a seller who answers, bargains, and pins the door.
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-tertiary sm:text-lg">
              Screenshot or Derja voice note in, a matched catalog product out. The price never drops under your floor. The buyer drops a GPS pin. You approve the waybill.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/simulator"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-primary-solid px-6 text-sm font-medium text-white shadow-[0_2px_8px_rgba(28,25,23,0.2)] transition-[transform,background-color] duration-150 ease-linear hover:bg-primary-solid/90 active:scale-[0.97]"
              >
                <span>Open the chat</span>
                <ArrowRight className="size-4 text-brand-200" />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-secondary bg-primary px-6 text-sm font-medium text-primary shadow-2xs transition-[transform,background-color,border-color] duration-150 ease-linear hover:bg-tertiary/70 active:scale-[0.97]"
              >
                <span>Seller desk</span>
              </Link>
            </div>
          </div>

          {/* Interactive Turn Anatomy Card */}
          <div className="relative rounded-3xl border border-secondary/90 bg-primary p-5 shadow-lg">
            <div className="flex items-center justify-between border-b border-secondary/70 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-full bg-primary-solid text-xs font-semibold text-brand-200">
                  W
                </div>
                <div>
                  <p className="text-xs font-semibold text-primary">Live Turn Pipeline</p>
                  <p className="text-[11px] text-tertiary">Instagram Story → Waybill FD</p>
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
                    <span className="font-mono text-[10px] text-tertiary">ASR 1.8s</span>
                  </div>
                  <p className="mt-0.5 text-tertiary" dir="auto">
                    &ldquo;n7eb el sweat el jaune elli 3al yasar taille L, na9esli chwaya&rdquo;
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-secondary/80 bg-primary p-3">
                <ScanEye className="mt-0.5 size-4 shrink-0 text-utility-blue-600" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-primary">SAM 3.1 Cutout + PE Match</span>
                    <Badge color="blue" className="font-mono">0.98 cos</Badge>
                  </div>
                  <p className="mt-0.5 text-tertiary">
                    Matched <strong className="text-primary">Sweat jaune (L)</strong> · List 120DT · Floor 105DT
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-secondary/80 bg-primary p-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-utility-green-700" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-primary">Concession Ladder & Pin Gate</span>
                    <span className="font-mono font-semibold tabular-nums text-primary">112,500 DT</span>
                  </div>
                  <p className="mt-0.5 text-tertiary">
                    Rung 1 offered (50% max discount) + 7DT Tunis delivery · Pin confirmed
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-primary-solid px-3.5 py-2.5 text-white">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-brand-200" />
                  <span className="font-medium">Buyer tapped Akked → Waybill Ready</span>
                </div>
                <span className="font-mono text-[11px] text-brand-200">FD0000000123</span>
              </div>
            </div>
          </div>
        </div>

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
                      <span className="font-mono text-xs font-semibold text-tertiary">
                        {item.step}
                      </span>
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

        <Suspense fallback={<p className="mt-16 text-sm text-tertiary">Loading provider telemetry…</p>}>
          <StatusSection />
        </Suspense>
      </div>
    </main>
  );
}
