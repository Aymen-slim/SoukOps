"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Briefcase01,
  Menu01,
  ShoppingBag01,
  Stars01,
  XClose,
} from "@untitledui/icons";
import { BrandMark } from "@/components/brand-mark";
import { InstagramIcon, MessengerIcon, WhatsAppIcon } from "@/components/brand-icons";
import { DemoAccountButton } from "@/components/site-bar";
import { useSessionInfo } from "@/lib/auth/client-session";
import { ChannelsShowcase } from "./channels-showcase";
import { type HomeTrack, WorkflowPreview } from "./workflow-preview";

const PAGE_SECTIONS = [
  { id: "how-it-works", label: "How it works" },
  { id: "channels", label: "Where it works" },
  { id: "who-its-for", label: "Who it's for" },
  { id: "start", label: "Try it free" },
] as const;

const PROMISES = [
  {
    title: "Understands voice notes and photos",
    body: "Customers don't have to fill out forms. They send a screenshot or a Tunisian voice note, and Wassalha knows what they want.",
    ctaLabel: "Try live demo",
    href: "/demo",
  },
  {
    title: "Follows your prices and rules",
    body: "You set your lowest price, your services, and your boundaries. Wassalha never promises a discount or answer you didn't allow.",
    ctaLabel: "Create free account",
    href: "/signup",
  },
  {
    title: "You approve what matters",
    body: "Confirm an order with one click to create the shipping slip, or step into any conversation yourself whenever you want.",
    ctaLabel: "Log in to your desk",
    href: "/login",
  },
] as const;

const AUDIENCE_CARDS = [
  {
    id: "shops",
    icon: ShoppingBag01,
    iconBg: "bg-[#F2FBF7] text-[#15704C] border-[#A4F4CF]",
    role: "Online Shops & Boutiques",
    headline: "Turn Instagram and WhatsApp chats into ready-to-ship orders.",
    points: [
      "Matches product photos and voice notes automatically",
      "Bargains politely and stops at your lowest price",
      "Gets the exact door map pin and prepares the shipping slip",
    ],
    ctaLabel: "Try shop demo",
    href: "/demo",
  },
  {
    id: "clinics",
    icon: Briefcase01,
    iconBg: "bg-[#FAFAF9] text-[#09090B] border-[#D4D4D8]",
    role: "Doctors, Clinics & Service Pros",
    headline: "Keep appointments and client questions organized all day.",
    points: [
      "Shares consultation fees, opening hours, and prep info",
      "Collects name, phone number, and preferred time before you speak",
      "Flags urgent messages right away and never gives medical advice",
    ],
    ctaLabel: "Create clinic / pro desk",
    href: "/signup?mode=pro&preset=doctor",
  },
  {
    id: "creators",
    icon: Stars01,
    iconBg: "bg-[#FEF3C6] text-[#7B3306] border-[#FEE685]",
    role: "Creators, Cameramen & Public Figures",
    headline: "Reply like yourself and never miss a paid collaboration.",
    points: [
      "Answers fans and clients in your own Derja or French style",
      "Spots paid shoots and brand deals that match your budget",
      "Sends a short daily summary of what needs your attention",
    ],
    ctaLabel: "Create creator desk",
    href: "/signup?mode=pro&preset=creator",
  },
] as const;

export function HomeExperience({ initialTrack = "shops" }: { initialTrack?: HomeTrack }) {
  const session = useSessionInfo();
  const [track, setTrack] = useState<HomeTrack>(initialTrack);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("how-it-works");

  const isProSession = session?.workspaceMode === "pro";
  const deskHref = isProSession ? "/pro" : "/dashboard";
  const deskLabel =
    session?.kind === "sandbox"
      ? isProSession
        ? "Open Pro demo"
        : "Open demo desk"
      : isProSession
        ? "Open Pro desk"
        : "Open seller desk";

  useEffect(() => {
    const elements = PAGE_SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isShops = track === "shops";

  return (
    <div className="wassalha-public min-h-dvh bg-white text-[#09090B] lg:flex">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Gurusup-style sticky left rail on desktop, compact sticky top bar on mobile */}
      <aside className="sticky top-0 z-40 flex w-full flex-none flex-col border-b border-[#E4E4E7] bg-white lg:h-dvh lg:w-[264px] lg:border-r lg:border-b-0">
        {/* Top brand + mobile actions */}
        <div className="flex h-16 items-center justify-between gap-3 px-4 lg:h-auto lg:px-6 lg:pt-6 lg:pb-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 text-[#09090B] no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B8A5E]"
          >
            <BrandMark className="size-6" />
            <span className="text-[1.0625rem] font-medium tracking-[-0.02em]">Wassalha</span>
          </Link>

          <div className="flex items-center gap-2 lg:hidden">
            <Link href="/demo" className="gs-btn-ink min-h-10 px-3.5 py-2 text-xs">
              Live Demo
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              className="flex size-10 cursor-pointer items-center justify-center border border-[#09090B] bg-white text-[#09090B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B8A5E]"
            >
              {mobileMenuOpen ? <XClose className="size-4" aria-hidden="true" /> : <Menu01 className="size-4" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Desktop sidebar body + collapsible mobile drawer */}
        <div
          className={`${
            mobileMenuOpen ? "flex" : "hidden"
          } flex-1 flex-col justify-between border-t border-[#E4E4E7] bg-white px-4 py-5 lg:flex lg:border-t-0 lg:px-6 lg:pt-0 lg:pb-6`}
        >
          <div>
            {/* Gurusup-style 2-tab mode switcher (Shops | Creators & Pros) */}
            <div
              role="group"
              aria-label="Choose what you want to see"
              className="flex border border-[#E4E4E7] bg-[#FAFAF9] p-1"
            >
              <button
                type="button"
                aria-pressed={isShops}
                onClick={() => {
                  setTrack("shops");
                  setMobileMenuOpen(false);
                }}
                className={`min-h-8 flex-1 cursor-pointer whitespace-nowrap px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B8A5E] ${
                  isShops
                    ? "border border-[#E4E4E7] bg-white text-[#09090B]"
                    : "border border-transparent bg-transparent text-[#52525B] hover:text-[#09090B]"
                }`}
              >
                Shops
              </button>
              <button
                type="button"
                aria-pressed={!isShops}
                onClick={() => {
                  setTrack("pro");
                  setMobileMenuOpen(false);
                }}
                className={`min-h-8 flex-[1.35] cursor-pointer whitespace-nowrap px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B8A5E] ${
                  !isShops
                    ? "border border-[#E4E4E7] bg-white text-[#09090B]"
                    : "border border-transparent bg-transparent text-[#52525B] hover:text-[#09090B]"
                }`}
              >
                Creators &amp; Pros
              </button>
            </div>

            {/* Primary nav */}
            <nav aria-label="Primary" className="mt-7 flex flex-col gap-1">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 text-sm font-medium text-[#09090B] no-underline hover:text-[#15704C]"
              >
                Home
              </Link>
              <Link
                href="/how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 text-sm text-[#52525B] no-underline transition-colors hover:text-[#09090B]"
              >
                How it works
              </Link>
              <Link
                href={isShops ? "/demo" : "/demo?track=pro&preset=creator"}
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 text-sm text-[#52525B] no-underline transition-colors hover:text-[#09090B]"
              >
                Live Chat Demo
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 text-sm text-[#52525B] no-underline transition-colors hover:text-[#09090B]"
              >
                For Online Shops
              </Link>
              <Link
                href="/signup?mode=pro"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 text-sm text-[#52525B] no-underline transition-colors hover:text-[#09090B]"
              >
                For Creators &amp; Pros
              </Link>
            </nav>

            {/* ON THIS PAGE section jump links */}
            <div className="mt-6 border-t border-dashed border-[#E4E4E7] pt-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#71717A]">On this page</p>
              <nav aria-label="On this page" className="mt-3 flex flex-col gap-1">
                {PAGE_SECTIONS.map((item) => {
                  const isCurrent = activeSection === item.id;
                  return (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`py-1 text-[13px] no-underline transition-colors ${
                        isCurrent ? "font-medium text-[#09090B]" : "text-[#71717A] hover:text-[#09090B]"
                      }`}
                    >
                      {item.label}
                    </a>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Bottom pinned CTAs */}
          <div className="mt-8 flex flex-col gap-2.5 pt-4">
            {session?.authenticated ? (
              <Link href={deskHref} className="gs-btn-outline w-full">
                {deskLabel}
              </Link>
            ) : (
              <Link href="/login" className="gs-btn-outline w-full">
                Log in
              </Link>
            )}
            <Link href="/demo" className="gs-btn-ink w-full">
              Try live demo
            </Link>
          </div>
        </div>
      </aside>

      {/* Main content canvas */}
      <main id="main-content" className="min-w-0 flex-1">
        {/* 1. Full-bleed atmospheric editorial hero (Gurusup signature) */}
        <section className="relative overflow-hidden bg-[#1D1E1A] text-white">
          <Image
            src="/brand/hero-tunis.jpg"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) calc(100vw - 264px), 100vw"
            className="object-cover object-center"
          />
          {/* Moody contrast wash + Gurusup halftone dot texture */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-[#09090B]/80 via-[#09090B]/58 to-[#09090B]/28"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[#09090B]/65 via-transparent to-[#09090B]/30"
          />
          <div aria-hidden="true" className="gs-dot-overlay absolute inset-0 opacity-70" />

          <div className="relative mx-auto flex min-h-[min(86dvh,760px)] max-w-[1160px] flex-col justify-center px-6 py-20 sm:px-12 lg:px-16">
            <h1 className="max-w-[15ch] text-[clamp(2.35rem,1.4rem+3.4vw,4.65rem)] leading-[1.03] font-medium tracking-[-0.04em] text-balance text-white">
              {isShops ? (
                <>
                  Turn your messages into{" "}
                  <span className="border-b-2 border-dotted border-white/80 pb-1">confirmed orders.</span>
                </>
              ) : (
                <>
                  Reply to every message{" "}
                  <span className="border-b-2 border-dotted border-white/80 pb-1">like yourself.</span>
                </>
              )}
            </h1>

            <p className="mt-7 max-w-[54ch] text-[1.0625rem] leading-[1.6] text-pretty text-white/92 sm:text-[1.125rem]">
              {isShops
                ? "Wassalha answers your customers on WhatsApp, Instagram, and Messenger in Tunisian Derja, French, or Arabic. It checks your products, protects your lowest price, gets the exact house map pin, and prepares the shipping slip."
                : "Wassalha answers WhatsApp, Instagram, and Messenger messages in your own voice. It shares your services and rates, collects client details, spots paid opportunities, and sends you a short daily summary."}
            </p>

            <p className="mt-3 text-base font-medium text-white">
              {isShops
                ? "You stay in control and approve every order."
                : "Urgent messages alert you right away. Nothing sends without your rules."}
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3.5">
              {isShops ? (
                <>
                  <Link href="/demo" className="gs-btn-white group">
                    <span>Try live demo</span>
                    <span className="inline-flex size-6 items-center justify-center border border-[#09090B]">
                      <ArrowRight className="gs-arrow-shift size-3.5" aria-hidden="true" />
                    </span>
                  </Link>
                  <Link href="/signup" className="gs-btn-ghost-on-dark">
                    Create free account
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/signup?mode=pro" className="gs-btn-white group">
                    <span>Create pro account</span>
                    <span className="inline-flex size-6 items-center justify-center border border-[#09090B]">
                      <ArrowRight className="gs-arrow-shift size-3.5" aria-hidden="true" />
                    </span>
                  </Link>
                  <Link href="/demo?track=pro&preset=creator" className="gs-btn-ghost-on-dark">
                    Try live pro demo
                  </Link>
                </>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-white/85">
              <span>Want to explore inside right away?</span>
              <DemoAccountButton
                label={isShops ? "Open demo shop account →" : "Open demo pro account →"}
                mode={isShops ? "ecommerce" : "pro"}
                preset={isShops ? undefined : "creator"}
                variant="on-dark"
              />
            </div>
          </div>
        </section>

        {/* Channel & language proof bar directly under hero */}
        <div className="border-b border-[#E4E4E7] bg-white px-6 py-5 sm:px-12 lg:px-16">
          <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-x-8 gap-y-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#71717A]">
              Works where Tunisia messages every day
            </span>
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-[#27272A]">
              <li className="inline-flex items-center gap-2">
                <WhatsAppIcon className="size-4 text-[#09090B]" />
                <span>WhatsApp</span>
              </li>
              <li className="inline-flex items-center gap-2">
                <InstagramIcon className="size-4 text-[#09090B]" />
                <span>Instagram</span>
              </li>
              <li className="inline-flex items-center gap-2">
                <MessengerIcon className="size-4 text-[#09090B]" />
                <span>Messenger</span>
              </li>
              <li className="text-[#52525B]">Tunisian Derja · French · Arabic</li>
            </ul>
          </div>
        </div>

        {/* 2. High-contrast statement band (echoing Gurusup's positioning beat) */}
        <section className="border-b border-[#E4E4E7] bg-white px-6 py-20 text-center sm:px-12 sm:py-24 lg:px-16">
          <div className="mx-auto max-w-[880px]">
            <p className="text-[clamp(1.65rem,1.25rem+1.6vw,2.65rem)] leading-[1.15] font-medium tracking-[-0.035em] text-balance text-[#71717A]">
              Not a robotic auto-reply. Not another complicated app.
            </p>
            <h2 className="mt-2 text-[clamp(1.65rem,1.25rem+1.6vw,2.65rem)] leading-[1.15] font-medium tracking-[-0.035em] text-balance text-[#09090B]">
              Wassalha is your smart assistant for everyday business.
            </h2>
          </div>
        </section>

        {/* 3. How it works — 3-panel workflow diagram + 3 plain-English columns */}
        <section id="how-it-works" className="scroll-mt-16 border-b border-[#E4E4E7] bg-white px-6 py-20 sm:px-12 lg:px-16">
          <div className="mx-auto max-w-[1160px]">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <h2 className="max-w-[24ch] text-[clamp(1.75rem,1.35rem+1.35vw,2.35rem)] leading-[1.1] font-medium tracking-[-0.035em] text-balance text-[#09090B]">
                  From a message on your phone to work done.
                </h2>
                <p className="mt-4 max-w-[60ch] text-[1.0625rem] leading-[1.6] text-pretty text-[#52525B]">
                  Whether someone sends a photo, a voice note, or a quick question, Wassalha understands what they need
                  and handles the back-and-forth until it&apos;s ready for your approval.
                </p>
              </div>

              {/* Quick inline view toggle for readers scrolling without looking at the rail */}
              <div
                role="group"
                aria-label="Preview workflow example"
                className="inline-flex border border-[#E4E4E7] bg-[#FAFAF9] p-1"
              >
                <button
                  type="button"
                  aria-pressed={isShops}
                  onClick={() => setTrack("shops")}
                  className={`min-h-9 cursor-pointer px-3.5 text-xs font-medium transition-colors ${
                    isShops ? "border border-[#E4E4E7] bg-white text-[#09090B]" : "border border-transparent text-[#52525B] hover:text-[#09090B]"
                  }`}
                >
                  Online Shop example
                </button>
                <button
                  type="button"
                  aria-pressed={!isShops}
                  onClick={() => setTrack("pro")}
                  className={`min-h-9 cursor-pointer px-3.5 text-xs font-medium transition-colors ${
                    !isShops ? "border border-[#E4E4E7] bg-white text-[#09090B]" : "border border-transparent text-[#52525B] hover:text-[#09090B]"
                  }`}
                >
                  Creator / Pro example
                </button>
              </div>
            </div>

            <WorkflowPreview track={track} />

            {/* 3 crisp editorial promise columns */}
            <div className="mt-12 grid gap-10 border-t border-[#E4E4E7] pt-10 md:grid-cols-3 md:gap-8">
              {PROMISES.map((item) => (
                <div key={item.title} className="flex flex-col justify-between">
                  <div>
                    <h3 className="text-[1.25rem] leading-[1.25] font-medium tracking-[-0.02em] text-balance text-[#09090B]">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-[0.975rem] leading-[1.6] text-pretty text-[#52525B]">{item.body}</p>
                  </div>
                  <div className="mt-5">
                    <Link href={item.href} className="gs-link-mono">
                      <span>{item.ctaLabel}</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Where it works — split 2-column feature showcase */}
        <section id="channels" className="scroll-mt-16 border-b border-[#E4E4E7] bg-white px-6 py-20 sm:px-12 lg:px-16">
          <div className="mx-auto max-w-[1160px]">
            <ChannelsShowcase />
          </div>
        </section>

        {/* 5. Who it's for — 3 sharp Gurusup hairline cards */}
        <section id="who-its-for" className="scroll-mt-16 border-b border-[#E4E4E7] bg-white px-6 py-20 sm:px-12 lg:px-16">
          <div className="mx-auto max-w-[1160px]">
            <h2 className="max-w-[24ch] text-[clamp(1.75rem,1.35rem+1.35vw,2.35rem)] leading-[1.1] font-medium tracking-[-0.035em] text-balance text-[#09090B]">
              Built for shops, clinics, studios, and creators.
            </h2>
            <p className="mt-3 max-w-[60ch] text-[1.0625rem] leading-[1.6] text-[#52525B]">
              Pick the workspace that matches your work when you sign up — everything comes ready for Tunisia out of the
              box.
            </p>

            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {AUDIENCE_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <article
                    key={card.id}
                    className="flex flex-col justify-between border border-[#E4E4E7] bg-white p-7"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className={`inline-flex size-10 items-center justify-center border ${card.iconBg}`}
                        >
                          <Icon className="size-5" aria-hidden="true" />
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#71717A]">
                          {card.role}
                        </span>
                      </div>

                      <h3 className="mt-6 text-[1.3rem] leading-[1.2] font-medium tracking-[-0.025em] text-balance text-[#09090B]">
                        {card.headline}
                      </h3>

                      <ul className="mt-6 divide-y divide-[#E4E4E7] border-t border-b border-[#E4E4E7]">
                        {card.points.map((pt) => (
                          <li key={pt} className="flex items-start gap-2.5 py-3 text-sm leading-relaxed text-[#52525B]">
                            <span className="mt-0.5 font-mono text-[#09090B]" aria-hidden="true">
                              →
                            </span>
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-6 pt-1">
                      <Link href={card.href} className="gs-link-mono">
                        <span>{card.ctaLabel}</span>
                        <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* 6. Full-bleed atmospheric closing CTA banner (Gurusup signature) */}
        <section id="start" className="scroll-mt-16 relative overflow-hidden bg-[#1D1E1A] px-6 py-24 text-center text-white sm:px-12 sm:py-28 lg:px-16">
          <Image
            src="/brand/cta-tunis.jpg"
            alt=""
            fill
            sizes="(min-width: 1024px) calc(100vw - 264px), 100vw"
            className="object-cover object-center"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-[#09090B]/52" />
          <div aria-hidden="true" className="gs-dot-overlay absolute inset-0 opacity-65" />

          <div className="relative mx-auto flex max-w-[780px] flex-col items-center">
            <h2 className="text-[clamp(1.85rem,1.4rem+1.6vw,2.65rem)] leading-[1.1] font-medium tracking-[-0.035em] text-balance text-white">
              Put your inbox on autopilot, while you stay in charge.
            </h2>
            <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-white/90 sm:text-lg">
              Try sending a message in the live demo right now — no account needed — or create your free workspace in
              less than a minute.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
              <Link href="/demo" className="gs-btn-ink min-h-[3.0625rem] border-[#09090B] bg-[#09090B] px-7">
                <span>Try live demo</span>
                <ArrowRight className="gs-arrow-shift size-4" aria-hidden="true" />
              </Link>
              <Link href="/signup" className="gs-btn-white px-7">
                Create free account
              </Link>
            </div>
          </div>
        </section>

        {/* 7. Editorial footer + oversized cropped wordmark */}
        <footer className="bg-white px-6 pt-16 pb-6 sm:px-12 lg:px-16">
          <div className="mx-auto max-w-[1160px]">
            <div className="grid gap-10 pb-14 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="flex items-center gap-2.5 text-[#09090B]">
                  <BrandMark className="size-6" />
                  <span className="text-base font-medium tracking-[-0.02em]">Wassalha</span>
                </div>
                <p className="mt-3 max-w-[26ch] text-sm leading-relaxed text-[#52525B]">
                  Your smart message assistant for online shops, clinics, studios, and creators in Tunisia.
                </p>
              </div>

              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#71717A]">Product</p>
                <ul className="mt-3.5 space-y-2.5 text-sm text-[#52525B]">
                  <li>
                    <Link href="/demo" className="no-underline hover:text-[#09090B]">
                      Live Chat Demo
                    </Link>
                  </li>
                  <li>
                    <Link href="/how-it-works" className="no-underline hover:text-[#09090B]">
                      How it works
                    </Link>
                  </li>
                  <li>
                    <a href="#channels" className="no-underline hover:text-[#09090B]">
                      Supported apps
                    </a>
                  </li>
                  <li>
                    <a href="#who-its-for" className="no-underline hover:text-[#09090B]">
                      Who it&apos;s for
                    </a>
                  </li>
                </ul>
              </div>

              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#71717A]">Get Started</p>
                <ul className="mt-3.5 space-y-2.5 text-sm text-[#52525B]">
                  <li>
                    <Link href="/signup" className="no-underline hover:text-[#09090B]">
                      Create shop account
                    </Link>
                  </li>
                  <li>
                    <Link href="/signup?mode=pro" className="no-underline hover:text-[#09090B]">
                      Create creator / pro account
                    </Link>
                  </li>
                  <li>
                    <Link href="/login" className="no-underline hover:text-[#09090B]">
                      Log in
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#71717A]">Channels</p>
                <ul className="mt-3.5 space-y-2.5 text-sm text-[#52525B]">
                  <li>
                    <Link href="/demo?platform=whatsapp" className="no-underline hover:text-[#09090B]">
                      WhatsApp Business
                    </Link>
                  </li>
                  <li>
                    <Link href="/demo?platform=instagram" className="no-underline hover:text-[#09090B]">
                      Instagram Stories &amp; DM
                    </Link>
                  </li>
                  <li>
                    <Link href="/demo?platform=messenger" className="no-underline hover:text-[#09090B]">
                      Facebook Messenger
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            <div className="overflow-hidden border-t border-[#E4E4E7] pt-6">
              <p
                aria-hidden="true"
                className="select-none text-[clamp(3.75rem,13.5vw,12.25rem)] leading-[0.84] font-medium tracking-[-0.06em] text-[#09090B]"
              >
                Wassalha
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
