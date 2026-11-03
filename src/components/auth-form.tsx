"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { Alert } from "@/components/foundations/alert/alert";
import { DemoAccountButton } from "@/components/site-bar";
import { invalidateClientSession } from "@/lib/auth/client-session";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

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
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">
          {signup ? "Create a shop" : "Welcome back"}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-primary">
          {signup ? "Sign up" : "Log in"}
        </h1>
        <p className="mt-2 text-sm text-tertiary">Email and password. That&apos;s the whole form.</p>
      </div>
      {error ? <Alert color="error">{error}</Alert> : null}
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-4 rounded-2xl border border-secondary bg-primary p-5 shadow-xs"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={setEmail} aria-label="Email" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            value={password}
            onChange={setPassword}
            aria-label="Password"
          />
        </div>
        <Button type="submit" isDisabled={busy}>
          {busy ? "Please wait…" : signup ? "Create account" : "Log in"}
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-tertiary">
        {signup ? (
          <Link href="/login" className="font-medium text-primary hover:text-brand-secondary">
            Already have an account? Log in
          </Link>
        ) : (
          <Link href="/signup" className="font-medium text-primary hover:text-brand-secondary">
            Need a shop? Sign up
          </Link>
        )}
        <DemoAccountButton label="Try the desk" />
      </div>
    </div>
  );
}
