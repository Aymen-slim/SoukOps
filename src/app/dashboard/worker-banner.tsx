"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-status-warning-border bg-status-warning-bg px-4 py-3 text-sm text-status-warning-fg shadow-2xs">
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="size-4 shrink-0" />
        <p>
          The browser agent is offline. Approvals stay queued until you start it (
          <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs">npm run worker</code>).
        </p>
      </div>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void switchToApi()}>
        Switch to the API
      </Button>
    </div>
  );
}
