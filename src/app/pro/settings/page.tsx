"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut01, RefreshCw01, ShieldTick } from "@untitledui/icons";
import { invalidateDashboardUrl } from "@/app/dashboard/use-poll";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/foundations/alert/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import { invalidateClientSession, useSessionInfo } from "@/lib/auth/client-session";
import { getProPreset } from "@/lib/pro/presets";

export default function ProSettingsPage() {
  const session = useSessionInfo();
  const router = useRouter();
  const preset = getProPreset(session?.proCategory);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function resetSandbox() {
    setResetting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/auth/demo", { method: "DELETE" });
      if (res.ok) {
        invalidateClientSession();
        invalidateDashboardUrl();
        router.refresh();
        setNotice("Demo workspace has been reset to fresh Tunisia preset data.");
      }
    } finally {
      setResetting(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    invalidateClientSession();
    invalidateDashboardUrl();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-[#E4E4E7] pb-5">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#52525B]">
          Workspace Settings
        </p>
        <h1 className="mt-1.5 text-2xl font-medium tracking-[-0.03em] text-[#09090B] sm:text-3xl">
          Creator &amp; Pro Account
        </h1>
        <p className="mt-1 text-sm text-[#52525B]">
          Manage workspace mode, safety guarantees, demo sandbox resets, and sign-out.
        </p>
      </div>

      {notice ? <Alert color="success">{notice}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Workspace</CardTitle>
            <CardDescription>Track isolation is enforced automatically across routes.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between border-b border-[#E4E4E7] pb-2">
              <span className="text-[#52525B]">Display Name</span>
              <span className="font-medium text-[#09090B]">{session?.name ?? preset.defaultDisplayName}</span>
            </div>
            <div className="flex items-center justify-between border-b border-[#E4E4E7] pb-2">
              <span className="text-[#52525B]">Track Mode</span>
              <Badge color="brand" className="font-mono text-[11px] uppercase">
                Creator &amp; Pro
              </Badge>
            </div>
            <div className="flex items-center justify-between border-b border-[#E4E4E7] pb-2">
              <span className="text-[#52525B]">Profession Preset</span>
              <span className="font-mono text-xs text-[#09090B]">{preset.label}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#52525B]">Account Type</span>
              <Badge color={session?.isSandbox ? "warning" : "success"} className="font-mono text-[11px] uppercase">
                {session?.isSandbox ? "Demo Sandbox" : "Full Account"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldTick className="size-4 text-brand-secondary" aria-hidden="true" />
              Built-in Guardrails
            </CardTitle>
            <CardDescription>Deterministic code checks on every AI reply and opportunity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm text-[#52525B]">
            <p className="flex items-start gap-2">
              <span className="font-mono text-[#1B8A5E]">→</span>
              <span>Rate Floor Firewall: AI replies never quote below your service floor price or accept unpaid/gifted deals.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="font-mono text-[#1B8A5E]">→</span>
              <span>Human Approval Gate: Opportunities never auto-apply without your explicit 1-click confirmation.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="font-mono text-[#1B8A5E]">→</span>
              <span>Medical Safety: Doctor workspaces never diagnose or prescribe and immediately escalate red-flag symptoms to SAMU 190.</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/pro/persona" className="gs-link-mono">
              <span>Edit Voice &amp; +216 Alerts</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link href="/pro/channels" className="gs-link-mono">
              <span>Connect WhatsApp / IG</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {session?.isSandbox ? (
              <Button
                size="sm"
                color="secondary"
                iconLeading={RefreshCw01}
                isDisabled={resetting}
                onClick={() => void resetSandbox()}
              >
                {resetting ? "Resetting…" : "Reset Demo Workspace"}
              </Button>
            ) : null}
            <Button size="sm" color="tertiary" iconLeading={LogOut01} onClick={() => void logout()}>
              Log out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
