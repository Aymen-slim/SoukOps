"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { MarkerPin01, Play } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { invalidateClientSession, useSessionInfo } from "@/lib/auth/client-session";

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

  return (
    <header className="sticky top-0 z-40 border-b border-secondary bg-primary/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          <span className="relative flex size-8 items-center justify-center rounded-lg bg-brand-solid text-white shadow-xs-skeuomorphic transition-transform duration-100 ease-linear group-hover:scale-105">
            <MarkerPin01 className="size-4 stroke-[2.2]" />
          </span>
          <div className="flex flex-col">
            <span className="text-sm leading-none font-semibold tracking-tight text-primary">Wassalha</span>
            <span className="mt-0.5 text-[10px] font-medium tracking-wider text-tertiary uppercase">
              Tunis · AI Dispatch
            </span>
          </div>
        </Link>

        <nav aria-label="Primary navigation" className="flex items-center gap-1.5">
          <Button
            href="/demo"
            size="sm"
            color={onDemo ? "primary" : "tertiary"}
            aria-current={onDemo ? "page" : undefined}
            iconLeading={<Play data-icon className="size-3.5" />}
          >
            Live Demo
          </Button>
          {session?.authenticated && session.kind === "sandbox" ? (
            <Button href="/dashboard" size="sm" color="secondary">
              Demo desk
            </Button>
          ) : null}
        </nav>

        <div className="flex items-center gap-2">
          {session?.authenticated && session.kind === "seller" ? (
            <Button href="/dashboard" size="sm">
              Seller desk
            </Button>
          ) : (
            <>
              <DemoAccountButton />
              <Button href="/login" size="sm" color="tertiary" className="hidden sm:inline-flex">
                Log in
              </Button>
              <Button href="/signup" size="sm">
                Sign up
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function DemoAccountButton({ label = "Enter demo account" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/demo", { method: "POST" });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setBusy(false);
      setError(body?.error ?? "Couldn't open the demo account.");
      return;
    }
    invalidateClientSession();
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button size="sm" color="secondary" isDisabled={busy} onClick={() => void enter()}>
        {busy ? "Opening…" : label}
      </Button>
      {error ? <span className="max-w-48 text-right text-[10px] text-error-primary">{error}</span> : null}
    </span>
  );
}
