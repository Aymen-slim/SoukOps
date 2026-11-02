"use client";

import { useState } from "react";
import { AlertTriangle } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { usePoll } from "./use-poll";

interface DemoStatus {
  courierMode: string;
  workerOnline: boolean;
}

export function WorkerBanner() {
  const { data, reload } = usePoll<DemoStatus>("/api/dashboard/demo", 5000);
  const [busy, setBusy] = useState(false);
  if (!data || data.courierMode !== "browser" || data.workerOnline) return null;

  async function switchToApi() {
    setBusy(true);
    await fetch("/api/dashboard/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courierMode: "mock_api" }),
    });
    setBusy(false);
    await reload();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-utility-yellow-200 bg-warning-primary px-4 py-3 text-sm text-warning-primary shadow-2xs">
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="size-4 shrink-0" />
        <p>
          The browser agent is offline. Approvals stay queued until you start it (
          <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs">npm run worker</code>).
        </p>
      </div>
      <Button type="button" size="sm" color="secondary" isDisabled={busy} onClick={() => void switchToApi()}>
        Switch to the API
      </Button>
    </div>
  );
}
