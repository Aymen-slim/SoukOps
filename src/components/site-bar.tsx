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
    <header className="sticky top-0 z-40 border-b border-white/70 bg-white/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          <span className="relative flex size-8 items-center justify-center rounded-lg bg-brand-solid text-white shadow-xs">
            <MarkerPin01 className="size-4 stroke-[2.2]" aria-hidden="true" />
          </span>
          <span className="flex flex-col">
            <span className="text-sm leading-none font-semibold tracking-tight text-primary">Wassalha</span>
            <span className="mt-0.5 hidden text-xs font-medium tracking-wide text-tertiary uppercase sm:block">
              Tunis · AI Dispatch
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {session?.authenticated && session.kind === "seller" ? (
            <Button href="/dashboard" size="sm" color="secondary" className="min-h-11">
              Seller desk
            </Button>
          ) : session?.authenticated && session.kind === "sandbox" ? (
            <Button href="/dashboard" size="sm" color="secondary" className="min-h-11">
              Demo desk
            </Button>
          ) : (
            <>
              <Button href="/login" size="sm" color="tertiary" className="hidden min-h-11 sm:inline-flex">
                Log in
              </Button>
              <Button href="/signup" size="sm" color="secondary" className="min-h-11">
                Sign up
              </Button>
            </>
          )}
          <Link
            href="/demo"
            aria-current={onDemo ? "page" : undefined}
            className="wassalha-cta px-3.5 sm:px-5"
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
}: {
  label?: string;
  quiet?: boolean;
}) {
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
        <span role="alert" className="max-w-48 text-right text-xs text-error-primary">
          {error}
        </span>
      ) : null}
    </span>
  );
}
