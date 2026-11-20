"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSessionInfo } from "@/lib/auth/client-session";
import { resolveWorkspaceRedirect } from "@/lib/auth/workspace-routing";
import type { WorkspaceMode } from "@/lib/pro/types";

/**
 * Client-side workspace track guard complementing `src/proxy.ts`.
 * Wraps `usePathname()` inside `<Suspense>` so Next.js 16 `cacheComponents`
 * prerendering stays valid on dynamic routes like `/dashboard/orders/[id]`.
 */
export function WorkspaceGate({ expected }: { expected: WorkspaceMode }) {
  return (
    <Suspense fallback={null}>
      <WorkspaceGateInner expected={expected} />
    </Suspense>
  );
}

function WorkspaceGateInner({ expected }: { expected: WorkspaceMode }) {
  const session = useSessionInfo();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!session?.authenticated || !session.workspaceMode) return;
    if (session.workspaceMode === expected) return;
    const target = resolveWorkspaceRedirect(pathname, session.workspaceMode);
    if (target) router.replace(target);
  }, [expected, pathname, router, session]);

  return null;
}
