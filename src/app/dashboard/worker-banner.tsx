"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/foundations/alert/alert";
import { usePoll } from "./use-poll";

interface DemoStatus {
  courierMode: string;
  workerOnline: boolean;
}

function dataQuiet(data: DemoStatus | null): boolean {
  if (!data) return true;
  return data.courierMode !== "browser" || data.workerOnline;
}

export function WorkerBanner() {
  const { data, reload } = usePoll<DemoStatus>(
    "/api/dashboard/demo?scope=banner",
    (d) => (dataQuiet(d) ? 30_000 : 5_000),
  );
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
    <Alert
      color="warning"
      title="Browser agent offline"
      action={
        <Button type="button" size="sm" color="secondary" isDisabled={busy} onClick={() => void switchToApi()}>
          Switch to the API
        </Button>
      }
    >
      Approvals stay queued until you start it (
      <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs">npm run worker</code>).
    </Alert>
  );
}
