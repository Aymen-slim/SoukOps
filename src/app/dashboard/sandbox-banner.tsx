"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { invalidateClientSession, useSessionInfo } from "@/lib/auth/client-session";
import { invalidateDashboardUrl } from "./use-poll";

export function SandboxBanner() {
  const router = useRouter();
  const session = useSessionInfo();
  const [busy, setBusy] = useState(false);

  if (!session?.isSandbox) return null;

  async function reset() {
    setBusy(true);
    const res = await fetch("/api/auth/demo", { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      invalidateClientSession();
      invalidateDashboardUrl();
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-utility-yellow-200 bg-warning-primary px-4 py-3 text-sm text-warning-primary">
      <p>This is a demo account. Edit products, orders, and chats here. The public catalog stays untouched.</p>
      <div className="flex items-center gap-2">
        <Button size="sm" color="secondary" isDisabled={busy} onClick={() => void reset()}>
          {busy ? "Resetting…" : "Reset demo"}
        </Button>
        <Link href="/signup" className="text-sm font-semibold text-primary underline">
          Sign up
        </Link>
      </div>
    </div>
  );
}
