"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Bell01,
  Briefcase01,
  CheckCircle,
  MarkerPin01,
  MessageChatCircle,
  ShieldTick,
  ShoppingBag01,
  Stars01,
  Target04,
} from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { DemoAccountButton } from "@/components/site-bar";
import type { WorkspaceMode } from "@/lib/pro/types";

const ECOM_STEPS = [
  {
    step: "01",
    title: "Customer sends a screenshot or Derja voice note",
    detail:
      "Works on WhatsApp, Instagram Stories & DM, and Messenger. Shoppers write in Tunisian Derja (Arabizi or Arabic script), French, Arabic, or English — or just forward a photo and talk.",
  },
  {
    step: "02",
    title: "Exact product match & stock check",
    detail:
      "Wassalha identifies the exact item from your shop catalog even in multi-person Story screenshots, checks live stock, and suggests the closest in-stock alternative when an item is sold out.",
  },
  {
    step: "03",
    title: "Polite bargaining that stops at your floor",
    detail:
      "When buyers ask for a discount ('na9esli chwaya'), code-enforced negotiation steps down smoothly and locks firmly at your minimum floor price — never inventing or hallucinating an unauthorized rate.",
  },
  {
    step: "04",
    title: "Tunisia landmark to verified GPS door pin",
    detail:
      "Turns fuzzy directions like 'Ennasr 2 wra 9ahwet Cosmitto, 2ème étage' into a single-use map confirmation link so buyers drop their exact house pin before the order summary is sent.",
  },
  {
    step: "05",
    title: "COD risk badge & explicit buyer Akked",
    detail:
      "Scores delivery reliability from past returns, cancellations, and pin distance. No order is written to your desk without phone, confirmed map pin, and explicit buyer Akked confirmation.",
  },
  {
    step: "06",
    title: "One-click seller approval & courier waybill",
    detail:
      "Approve the order from your Seller Desk to generate the A6 shipping label with barcode + GPS QR code, sync courier delivery statuses, and trigger pre-dispatch reconfirmation.",
  },
] as const;

const PRO_STEPS = [
  {
    step: "01",
    title: "Incoming DMs & voice notes arrive across channels",
    detail:
      "Handles WhatsApp, Instagram, and Messenger inquiries — including Tunisian Derja voice notes — for Doctors/Clinics, Cameramen/Media studios, Public Figures/Creators, and Custom Professionals.",
  },
  {
    step: "02",
    title: "Replies in your exact cloned voice",
    detail:
      "Uses your real DM style samples, dialect rules (Arabizi, Arabic-script Derja, French, or English), and bio so fans, patients, and agencies get natural human-sounding answers in seconds.",
  },
  {
    step: "03",
    title: "Structured service scoping & GPS pin delivery",
    detail:
      "Collects key intake details (name, +216 phone, date, city/venue, scope, budget), logs a structured Service Inquiry, and sends your package details, prep instructions, and clinic/studio map pin.",
  },
  {
    step: "04",
    title: "Rate-floor & medical safety guardrails in code",
    detail:
      "Never accepts gifted/below-floor deals below your minimum DT floor. On Doctor tracks, code blocks any diagnosis or prescription and immediately escalates emergency symptoms with SAMU 190 guidance.",
  },
  {
    step: "05",
    title: "Opportunity Radar scores deals & drafts pitches",
    detail:
      "Scans inbound DMs and Opportunity Board briefs against your goals, keywords, and minimum budget, explains why each brief fits (0–100%), and drafts a pitch for your explicit 1-click approval.",
  },
  {
    step: "06",
    title: "Daily 'What's New' Briefing & +216 Urgent Alerts",
    detail:
      "Synthesizes a concise executive briefing of handled DMs, active inquiries, and top deals — and pushes critical/urgent alerts immediately in-app and to your +216 WhatsApp or Email.",
  },
] as const;

const SAFEGUARDS = [
  {
    icon: ShieldTick,
    eyebrow: "Money & Rate Firewall",
    title: "Code owns every dinar — never the model",
    body: "All prices, fees, and service floors are stored in integer millimes and formatted by pricing.ts. If an AI reply ever hallucinates a discount below your floor, the firewall blocks it and falls back to your safe template.",
  },
  {
    icon: Bell01,
    eyebrow: "Medical & Human Safety",
    title: "SAMU 190 emergency triage & zero auto-apply",
    body: "Doctor workspaces strictly prohibit diagnosing or prescribing over DM and immediately escalate chest pain, breathing trouble, or severe bleeding with SAMU 190 instructions + critical alerts. Opportunities never auto-apply without your click.",
  },
  {
    icon: MarkerPin01,
    eyebrow: "Tunisia-First Locale Spine",
    title: "Derja (Arabizi & Arabic), French, Arabic & +216",
    body: "Built natively for Tunisia's 24 governorates, landmark-based addresses, Derja bargaining terms ('alf', 'malyoun', 'na9esli'), and code-switching voice notes — with an extensible locale registry for future markets.",
  },
  {
    icon: CheckCircle,
    eyebrow: "Human Approval First",
    title: "Pause AI & step in on any conversation",
    body: "Every workspace gives you instant 1-click AI pause/resume, direct human replies, explicit order/opportunity approval gates, and full behind-the-scenes trace visibility.",
  },
] as const;

export function HowItWorksClient({ initialTrack = "ecommerce" }: { initialTrack?: WorkspaceMode }) {
  const [track, setTrack] = useState<WorkspaceMode>(initialTrack);
  const isEcom = track === "ecommerce";
  const steps = isEcom ? ECOM_STEPS : PRO_STEPS;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-14 px-4 py-12 sm:px-6 sm:py-16">
      {/* Header + Track Switcher */}
      <section className="flex flex-col gap-6 border-b border-[#E4E4E7] pb-10">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="brand" className="font-mono text-[11px] uppercase">
            How Wassalha Works
          </Badge>
          <span className="font-mono text-xs uppercase tracking-[0.08em] text-[#71717A]">
            Tunisia-First Dual-Track Architecture
          </span>
        </div>

        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <h1 className="text-[clamp(2rem,1.4rem+2.2vw,3.25rem)] leading-[1.06] font-medium tracking-[-0.035em] text-balance text-[#09090B]">
              {isEcom
                ? "From Derja screenshot & voice note to confirmed delivery slip."
                : "From noisy DMs to scoped clients, scored opportunities & daily briefings."}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-[#52525B]">
              {isEcom
                ? "Built for Tunisian online shops selling on Instagram, WhatsApp, and Messenger — turning back-and-forth messages into verified orders with zero missed floor limits."
                : "Built for Tunisia's doctors, clinics, cameramen, studios, creators, and independent professionals — replying in your voice while deterministic code protects your rates and safety."}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Choose workflow mode"
            className="inline-flex w-fit shrink-0 border border-[#E4E4E7] bg-[#FAFAF9] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={isEcom}
              onClick={() => setTrack("ecommerce")}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm font-medium transition-colors ${
                isEcom ? "bg-[#1D1E1A] text-white" : "text-[#52525B] hover:bg-white hover:text-[#09090B]"
              }`}
            >
              <ShoppingBag01 className="size-4" aria-hidden="true" />
              E-Commerce Mode
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isEcom}
              onClick={() => setTrack("pro")}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm font-medium transition-colors ${
                !isEcom ? "bg-[#1D1E1A] text-white" : "text-[#52525B] hover:bg-white hover:text-[#09090B]"
              }`}
            >
              <Stars01 className="size-4" aria-hidden="true" />
              Creator &amp; Pro Mode
            </button>
          </div>
        </div>
      </section>

      {/* 6-Step Workflow Grid */}
      <section aria-label="Step by step workflow">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-medium tracking-[-0.025em] text-[#09090B] sm:text-2xl">
            {isEcom ? "The 6-step Online Shop flow" : "The 6-step Creator & Pro flow"}
          </h2>
          <span className="font-mono text-xs uppercase tracking-[0.08em] text-[#71717A]">
            Model proposes · Code decides
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {steps.map((item) => (
            <article
              key={item.step}
              className="flex flex-col justify-between gap-4 border border-[#E4E4E7] bg-white p-6"
            >
              <div>
                <span className="inline-flex border border-[#E4E4E7] bg-[#FAFAF9] px-2.5 py-1 font-mono text-xs font-medium text-[#15704C]">
                  STEP {item.step}
                </span>
                <h3 className="mt-4 text-lg leading-snug font-medium tracking-[-0.02em] text-[#09090B]">
                  {item.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-[#52525B]">{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Pro Radar Loop Highlight (visible in Pro Mode) or Shop Channel Summary */}
      {!isEcom ? (
        <section className="border border-[#E4E4E7] bg-[#FAFAF9] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E4E4E7] pb-5">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#15704C]">
                4 Ready-Made Tunisia Presets
              </p>
              <h2 className="mt-1 text-xl font-medium tracking-[-0.025em] text-[#09090B]">
                Start in seconds — customize every rate, rule &amp; style sample
              </h2>
            </div>
            <Link href="/demo?track=pro&preset=creator" className="gs-btn-ink px-5">
              <span>Test Pro Simulator Live</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                preset: "doctor",
                label: "Doctor / Clinic",
                desc: "Consultation & teleconsultation intake, clinic GPS pin, zero diagnosis rule, SAMU 190 red-flag alerts.",
                href: "/demo?track=pro&preset=doctor",
              },
              {
                preset: "cameraman",
                label: "Cameraman / Media",
                desc: "Brand Reels, Weddings/Outia & Studio packs, date/venue scoping, 30% deposit boundary, drone shoot radar.",
                href: "/demo?track=pro&preset=cameraman",
              },
              {
                preset: "creator",
                label: "Public Figure / Creator",
                desc: "Fan vs brand-deal triage, Sponsored Reel & UGC floor protection, fintech/brand brief scoring & pitch drafts.",
                href: "/demo?track=pro&preset=creator",
              },
              {
                preset: "custom",
                label: "Custom Pro",
                desc: "Coaches, architects, lawyers, consultants & agencies — define any DT package, intake flow, and voice.",
                href: "/demo?track=pro&preset=custom",
              },
            ].map((p) => (
              <div key={p.preset} className="flex flex-col justify-between gap-4 border border-[#E4E4E7] bg-white p-5">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-[#09090B]">
                    <Briefcase01 className="size-4 text-[#1B8A5E]" aria-hidden="true" />
                    {p.label}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-[#52525B]">{p.desc}</p>
                </div>
                <Link href={p.href} className="gs-link-mono">
                  <span>Try {p.label}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Deterministic Safeguards */}
      <section aria-label="Built-in safeguards">
        <div className="mb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#71717A]">
            Reliability &amp; Control
          </p>
          <h2 className="mt-1 text-xl font-medium tracking-[-0.025em] text-[#09090B] sm:text-2xl">
            Deterministic guardrails on every message
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {SAFEGUARDS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex items-start gap-4 border border-[#E4E4E7] bg-white p-6">
                <span className="flex size-10 shrink-0 items-center justify-center border border-[#A4F4CF] bg-[#F2FBF7] text-[#15704C]">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#71717A]">
                    {item.eyebrow}
                  </p>
                  <h3 className="mt-1 text-base font-medium text-[#09090B]">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#52525B]">{item.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom Interactive CTA Band */}
      <section className="flex flex-col items-start justify-between gap-6 border border-[#09090B] bg-[#1D1E1A] p-7 text-white lg:flex-row lg:items-center sm:p-10">
        <div className="max-w-xl">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[#A4F4CF]">
            <MessageChatCircle className="size-4" aria-hidden="true" />
            Ready to test live?
          </p>
          <h2 className="mt-2 text-2xl font-medium tracking-[-0.03em] text-white">
            Try both tracks in the live simulator or open an instant demo desk.
          </h2>
          <p className="mt-2 text-sm text-white/80">
            No credit card or setup needed — switch between WhatsApp, Instagram, and Messenger live and watch every rule fire in the trace panel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={isEcom ? "/demo" : "/demo?track=pro&preset=creator"}
            className="gs-btn-white"
          >
            <Target04 className="size-4" aria-hidden="true" />
            <span>{isEcom ? "Try Shop Simulator" : "Try Pro Simulator"}</span>
          </Link>
          <DemoAccountButton
            label={isEcom ? "Open Shop Demo Desk →" : "Open Pro Demo Desk →"}
            mode={isEcom ? "ecommerce" : "pro"}
            preset={isEcom ? undefined : "creator"}
            variant="on-dark"
          />
        </div>
      </section>
    </div>
  );
}
