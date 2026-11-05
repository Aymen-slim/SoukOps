"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { MarkerPin01, ShieldTick, Stars01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { DemoAccountButton } from "@/components/site-bar";
import { invalidateClientSession } from "@/lib/auth/client-session";

const PROOF = [
  { icon: Stars01, text: "A screenshot or a Derja voice note matches a product in the shop." },
  { icon: ShieldTick, text: "The price never drops under the floor you set." },
  { icon: MarkerPin01, text: "A landmark description becomes a door pin you approve." },
] as const;

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(signup ? "/api/auth/signup" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setBusy(false);
      setError(body?.error ?? "Couldn't continue.");
      return;
    }
    invalidateClientSession();
    const next = new URLSearchParams(window.location.search).get("next") || "/dashboard";
    const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    router.push(dest);
    router.refresh();
  }

  return (
    <div className="mx-auto grid w-full max-w-[1200px] items-center gap-10 px-4 py-12 lg:grid-cols-2 lg:py-20 sm:px-6">
      <div className="wassalha-glass rounded-3xl p-6 sm:p-8">
        <p className="text-xs font-semibold tracking-wide text-brand-secondary uppercase">Wassalha</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-primary">
          A seller who answers, bargains, and pins the door.
        </h2>
        <ul className="mt-6 flex flex-col gap-4">
          {PROOF.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.text} className="flex items-start gap-3 text-base leading-relaxed text-tertiary">
                <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-brand-secondary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span>{item.text}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <p className="text-xs font-semibold tracking-wide text-brand-secondary uppercase">
            {signup ? "Create a shop" : "Welcome back"}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-primary">{signup ? "Sign up" : "Log in"}</h1>
          <p className="mt-2 text-base text-tertiary">Email and password. That&apos;s the whole form.</p>
        </div>
        <form
          onSubmit={(event) => void onSubmit(event)}
          aria-busy={busy}
          className="flex flex-col gap-4 rounded-2xl border border-secondary bg-primary p-5 shadow-xs"
          noValidate
        >
          {error ? (
            <div
              ref={errorRef}
              id="auth-error"
              tabIndex={-1}
              role="alert"
              className="rounded-xl border border-error_subtle bg-error-primary px-4 py-3 text-sm text-error-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <p className="font-semibold">Couldn&apos;t continue</p>
              <p className="mt-1">{error}</p>
            </div>
          ) : null}
          <Input
            label="Email"
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            isInvalid={Boolean(error)}
            aria-describedby={error ? "auth-error" : undefined}
            inputClassName="min-h-11 text-base"
          />
          <Input
            label="Password"
            id="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            value={password}
            onChange={setPassword}
            isInvalid={Boolean(error)}
            aria-describedby={error ? "auth-error" : undefined}
            inputClassName="min-h-11 text-base"
          />
          <Button type="submit" className="min-h-11" isDisabled={busy} isLoading={busy} showTextWhileLoading>
            {busy ? "Please wait…" : signup ? "Create account" : "Log in"}
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-3 text-base text-tertiary">
          {signup ? (
            <Link
              href="/login"
              className="font-medium text-primary hover:text-brand-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Already have an account? Log in
            </Link>
          ) : (
            <Link
              href="/signup"
              className="font-medium text-primary hover:text-brand-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Need a shop? Sign up
            </Link>
          )}
          <DemoAccountButton label="Try the desk" quiet />
        </div>
      </div>
    </div>
  );
}
