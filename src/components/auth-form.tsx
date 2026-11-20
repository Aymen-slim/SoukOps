"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { ShoppingBag01, User01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { DemoAccountButton } from "@/components/site-bar";
import { invalidateClientSession } from "@/lib/auth/client-session";
import { resolveWorkspaceRedirect } from "@/lib/auth/workspace-routing";
import { PRO_PRESETS } from "@/lib/pro/presets";
import { isProCategory, isWorkspaceMode, PRO_CATEGORIES, type ProCategory, type WorkspaceMode } from "@/lib/pro/types";

const ECOM_PROOF = [
  "Understands product screenshots and Tunisian Derja voice notes automatically.",
  "Negotiates politely and never drops below the lowest price you set.",
  "Gets the customer's exact door map pin and prepares the shipping slip for your approval.",
] as const;

const PRO_PROOF = [
  "Replies to WhatsApp, Instagram, and Messenger DMs in your own Derja or French style.",
  "Shares your services, collects client details, and prepares clear booking or quote info.",
  "Spots paid opportunities, sends a short daily summary, and alerts you on urgent messages.",
] as const;

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  return (
    <Suspense fallback={<AuthFormInner mode={mode} initialTrack="ecommerce" initialPreset="creator" initialNext="" />}>
      <AuthFormWithParams mode={mode} />
    </Suspense>
  );
}

function AuthFormWithParams({ mode }: { mode: "login" | "signup" }) {
  const params = useSearchParams();
  const trackParam = params.get("mode") ?? params.get("track");
  const presetParam = params.get("preset");
  const initialTrack: WorkspaceMode = isWorkspaceMode(trackParam) ? trackParam : "ecommerce";
  const initialPreset: ProCategory = isProCategory(presetParam) ? presetParam : "creator";
  const initialNext = params.get("next") ?? "";
  return (
    <AuthFormInner
      mode={mode}
      initialTrack={initialTrack}
      initialPreset={initialPreset}
      initialNext={initialNext}
    />
  );
}

function AuthFormInner({
  mode,
  initialTrack,
  initialPreset,
  initialNext,
}: {
  mode: "login" | "signup";
  initialTrack: WorkspaceMode;
  initialPreset: ProCategory;
  initialNext: string;
}) {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(initialTrack);
  const [proCategory, setProCategory] = useState<ProCategory>(initialPreset);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";
  const proof = signup && workspaceMode === "pro" ? PRO_PROOF : ECOM_PROOF;

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const payload = signup
      ? {
          email,
          password,
          workspaceMode,
          ...(workspaceMode === "pro" ? { proCategory } : {}),
          ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        }
      : { email, password };

    const res = await fetch(signup ? "/api/auth/signup" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      workspaceMode?: WorkspaceMode;
      redirectTo?: string;
    } | null;
    if (!res.ok) {
      setBusy(false);
      setError(body?.error ?? "Couldn't continue.");
      return;
    }
    invalidateClientSession();
    const resolvedMode: WorkspaceMode = body?.workspaceMode ?? (signup ? workspaceMode : "ecommerce");
    const fallbackDest = body?.redirectTo ?? (resolvedMode === "pro" ? "/pro" : "/dashboard");
    const safeNext = initialNext.startsWith("/") && !initialNext.startsWith("//") ? initialNext : "";
    const dest =
      safeNext && !resolveWorkspaceRedirect(safeNext, resolvedMode) ? safeNext : fallbackDest;
    router.push(dest);
    router.refresh();
  }

  return (
    <div className="mx-auto grid w-full max-w-[1200px] items-start gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:py-16">
      <div className="border border-[#E4E4E7] bg-[#FAFAF9] p-7 sm:p-9">
        <h2 className="text-[clamp(1.65rem,1.3rem+1.1vw,2.15rem)] leading-[1.12] font-medium tracking-[-0.03em] text-balance text-[#09090B]">
          {signup && workspaceMode === "pro"
            ? "An assistant that talks like you, organizes bookings, and finds paid deals."
            : "Turn WhatsApp, Instagram, and Messenger messages into confirmed orders."}
        </h2>
        <ul className="mt-7 divide-y divide-[#E4E4E7] border-t border-b border-[#E4E4E7]">
          {proof.map((line) => (
            <li key={line} className="flex items-start gap-3 py-4 text-[0.975rem] leading-relaxed text-[#52525B]">
              <span className="mt-0.5 font-mono text-[#09090B]" aria-hidden="true">
                →
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs text-[#52525B]">
          <span className="font-mono uppercase tracking-[0.08em] text-[#71717A]">Built for Tunisia</span>
          <span className="font-mono text-[#15704C]">Derja · French · Arabic · English</span>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-[clamp(1.85rem,1.4rem+1.2vw,2.25rem)] leading-[1.1] font-medium tracking-[-0.03em] text-[#09090B]">
            {signup ? "Create your free workspace" : "Log in to Wassalha"}
          </h1>
          <p className="mt-2 text-base text-[#52525B]">
            {signup
              ? "Choose Online Shop or Creator & Pro — you can explore a demo first if you prefer."
              : "Enter your email and password to go straight to your workspace."}
          </p>
        </div>

        <form
          onSubmit={(event) => void onSubmit(event)}
          aria-busy={busy}
          className="flex flex-col gap-4 border border-[#E4E4E7] bg-white p-6"
          noValidate
        >
          {error ? (
            <div
              ref={errorRef}
              id="auth-error"
              tabIndex={-1}
              role="alert"
              className="border border-error_subtle bg-error-primary px-4 py-3 text-sm text-error-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <p className="font-semibold">Couldn&apos;t continue</p>
              <p className="mt-1">{error}</p>
            </div>
          ) : null}

          {signup ? (
            <div className="flex flex-col gap-3">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#52525B]">
                Workspace type
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setWorkspaceMode("ecommerce")}
                  className={`flex cursor-pointer items-start gap-3 border p-3.5 text-left transition-colors ${
                    workspaceMode === "ecommerce"
                      ? "border-[#09090B] bg-[#FAFAF9]"
                      : "border-[#E4E4E7] bg-white hover:border-[#A1A1AA]"
                  }`}
                >
                  <ShoppingBag01 className="mt-0.5 size-5 shrink-0 text-[#15704C]" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-[#09090B]">Online Shop</p>
                    <p className="mt-0.5 text-xs leading-snug text-[#52525B]">
                      Products, lowest-price rules, door map pin &amp; shipping slips
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceMode("pro")}
                  className={`flex cursor-pointer items-start gap-3 border p-3.5 text-left transition-colors ${
                    workspaceMode === "pro"
                      ? "border-[#09090B] bg-[#FAFAF9]"
                      : "border-[#E4E4E7] bg-white hover:border-[#A1A1AA]"
                  }`}
                >
                  <User01 className="mt-0.5 size-5 shrink-0 text-[#15704C]" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-[#09090B]">Creator &amp; Pro</p>
                    <p className="mt-0.5 text-xs leading-snug text-[#52525B]">
                      Doctor, cameraman, creator — your voice, deals &amp; alerts
                    </p>
                  </div>
                </button>
              </div>

              {workspaceMode === "pro" ? (
                <div className="flex flex-col gap-2 pt-1">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#52525B]">
                    Starter setup
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {PRO_CATEGORIES.map((id) => {
                      const preset = PRO_PRESETS[id];
                      const selected = proCategory === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setProCategory(id)}
                          className={`cursor-pointer border px-3 py-2.5 text-left transition-colors ${
                            selected
                              ? "border-[#09090B] bg-[#FAFAF9]"
                              : "border-[#E4E4E7] bg-white hover:border-[#A1A1AA]"
                          }`}
                        >
                          <p className="text-xs font-medium text-[#09090B]">{preset.shortLabel}</p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[#52525B]">{preset.tagline}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <Input
                label={workspaceMode === "pro" ? "Your name or studio (optional)" : "Shop name (optional)"}
                id="display-name"
                value={displayName}
                onChange={setDisplayName}
                placeholder={workspaceMode === "pro" ? PRO_PRESETS[proCategory].defaultDisplayName : "e.g. Medina Streetwear"}
                inputClassName="min-h-11 text-base"
              />
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
          <Button type="submit" className="min-h-11 font-mono text-xs uppercase tracking-[0.06em]" isDisabled={busy} isLoading={busy} showTextWhileLoading>
            {busy
              ? "Please wait…"
              : signup
                ? workspaceMode === "pro"
                  ? "Create Creator / Pro desk"
                  : "Create Online Shop"
                : "Log in"}
          </Button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#52525B]">
          {signup ? (
            <Link
              href="/login"
              className="font-medium text-[#09090B] underline hover:text-[#15704C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B8A5E]"
            >
              Already have an account? Log in
            </Link>
          ) : (
            <Link
              href="/signup"
              className="font-medium text-[#09090B] underline hover:text-[#15704C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B8A5E]"
            >
              Need an account? Sign up
            </Link>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <DemoAccountButton label="Try Shop demo" mode="ecommerce" quiet />
            <DemoAccountButton
              label="Try Pro demo"
              mode="pro"
              preset={workspaceMode === "pro" ? proCategory : "creator"}
              quiet
            />
          </div>
        </div>
      </div>
    </div>
  );
}
