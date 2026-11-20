"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { Play } from "@untitledui/icons";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/base/buttons/button";
import { invalidateClientSession, useSessionInfo } from "@/lib/auth/client-session";
import type { ProCategory, WorkspaceMode } from "@/lib/pro/types";

export function SiteBar() {
  return (
    <Suspense fallback={<SiteBarFrame path="" />}>
      <SiteBarPath />
    </Suspense>
  );
}

function SiteBarPath() {
  return <SiteBarFrame path={usePathname()} />;
}

function SiteBarFrame({ path }: { path: string }) {
  const session = useSessionInfo();
  const onDemo = path === "/demo" || path.startsWith("/demo/") || path === "/simulator";
  const onHowItWorks = path === "/how-it-works";
  const isPro = session?.workspaceMode === "pro";
  const deskHref = isPro ? "/pro" : "/dashboard";
  const deskLabel =
    session?.kind === "sandbox"
      ? isPro
        ? "Pro demo"
        : "Demo desk"
      : isPro
        ? "Pro desk"
        : "Seller desk";

  return (
    <header className="sticky top-0 z-40 border-b border-[#E4E4E7] bg-white">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2.5 text-[#09090B] no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B8A5E]"
          >
            <BrandMark className="size-6" />
            <span className="flex items-baseline gap-2.5">
              <span className="text-[1.0625rem] leading-none font-medium tracking-[-0.02em] text-[#09090B]">
                Wassalha
              </span>
              <span className="hidden font-mono text-[11px] uppercase tracking-[0.08em] text-[#71717A] sm:inline">
                Tunisia
              </span>
            </span>
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-5 md:flex">
            <Link
              href="/how-it-works"
              aria-current={onHowItWorks ? "page" : undefined}
              className={`text-sm no-underline transition-colors ${
                onHowItWorks ? "font-medium text-[#09090B]" : "text-[#52525B] hover:text-[#09090B]"
              }`}
            >
              How it works
            </Link>
            <Link
              href="/signup"
              className="text-sm text-[#52525B] no-underline transition-colors hover:text-[#09090B]"
            >
              E-Commerce
            </Link>
            <Link
              href="/signup?mode=pro"
              className="text-sm text-[#52525B] no-underline transition-colors hover:text-[#09090B]"
            >
              Creators &amp; Pros
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {session?.authenticated ? (
            <Link href={deskHref} className="gs-btn-outline min-h-10 px-4 py-2 text-xs">
              {deskLabel}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden min-h-10 items-center px-3 font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#52525B] no-underline transition-colors hover:text-[#09090B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B8A5E] sm:inline-flex"
              >
                Log in
              </Link>
              <Link href="/signup" className="gs-btn-outline min-h-10 px-4 py-2 text-xs">
                Sign up
              </Link>
            </>
          )}
          <Link
            href="/demo"
            aria-current={onDemo ? "page" : undefined}
            className="gs-btn-ink min-h-10 px-3.5 py-2 text-xs sm:px-5"
          >
            <Play className="size-3.5" aria-hidden="true" />
            <span className="sm:hidden">Demo</span>
            <span className="hidden sm:inline">Live demo</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function DemoAccountButton({
  label = "Enter demo account",
  quiet = false,
  variant = "default",
  mode = "ecommerce",
  preset,
}: {
  label?: string;
  quiet?: boolean;
  variant?: "default" | "on-dark";
  mode?: WorkspaceMode;
  preset?: ProCategory;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, ...(preset ? { preset } : {}) }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string; redirectTo?: string } | null;
    if (!res.ok) {
      setBusy(false);
      setError(body?.error ?? "Couldn't open the demo account.");
      return;
    }
    invalidateClientSession();
    router.push(body?.redirectTo ?? (mode === "pro" ? "/pro" : "/dashboard"));
    router.refresh();
  }

  if (variant === "on-dark") {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => void enter()}
          className="cursor-pointer border-b border-white/60 pb-0.5 font-mono text-xs font-medium uppercase tracking-[0.08em] text-white transition-colors hover:border-white focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Opening…" : label}
        </button>
        {error ? (
          <span role="alert" className="text-xs text-[#FECACA]">
            {error}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        color={quiet ? "tertiary" : "secondary"}
        className="min-h-11"
        isDisabled={busy}
        isLoading={busy}
        showTextWhileLoading
        onClick={() => void enter()}
      >
        {busy ? "Opening…" : label}
      </Button>
      {error ? (
        <span role="alert" className="max-w-56 text-right text-xs text-error-primary">
          {error}
        </span>
      ) : null}
    </span>
  );
}
