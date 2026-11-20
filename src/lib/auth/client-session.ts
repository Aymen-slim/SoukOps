"use client";

import { useEffect, useState } from "react";
import type { ProCategory, WorkspaceMode } from "@/lib/pro/types";

export interface ClientSessionInfo {
  authenticated: boolean;
  kind: "guest" | "sandbox" | "seller";
  name?: string;
  slug?: string | null;
  isSandbox?: boolean;
  workspaceMode?: WorkspaceMode;
  proCategory?: ProCategory | null;
}

const SESSION_TTL_MS = 30_000;

let cachedSession: { data: ClientSessionInfo; expiresAt: number } | null = null;
let inflightSession: Promise<ClientSessionInfo> | null = null;
const listeners = new Set<(session: ClientSessionInfo | null) => void>();

export function invalidateClientSession(): void {
  cachedSession = null;
  inflightSession = null;
  for (const listener of listeners) {
    listener(null);
  }
}

export async function fetchClientSession(force = false): Promise<ClientSessionInfo> {
  const now = Date.now();
  if (!force && cachedSession && cachedSession.expiresAt > now) {
    return cachedSession.data;
  }
  if (!force && inflightSession) {
    return inflightSession;
  }
  inflightSession = fetch("/api/auth/session")
    .then(async (res) => {
      if (!res.ok) return { authenticated: false, kind: "guest" as const };
      return (await res.json()) as ClientSessionInfo;
    })
    .catch(() => ({ authenticated: false, kind: "guest" as const }))
    .then((data) => {
      cachedSession = { data, expiresAt: Date.now() + SESSION_TTL_MS };
      inflightSession = null;
      for (const listener of listeners) {
        listener(data);
      }
      return data;
    });
  return inflightSession;
}

export function useSessionInfo(): ClientSessionInfo | null {
  // Always start empty so SSR HTML agrees with first client paint; hydrate asynchronously.
  const [session, setSession] = useState<ClientSessionInfo | null>(null);

  useEffect(() => {
    let active = true;
    const onUpdate = (next: ClientSessionInfo | null) => {
      if (!active) return;
      if (next === null) {
        void fetchClientSession(true);
      } else {
        setSession(next);
      }
    };
    listeners.add(onUpdate);
    void fetchClientSession().then((data) => {
      if (active) setSession(data);
    });
    return () => {
      active = false;
      listeners.delete(onUpdate);
    };
  }, []);

  return session;
}
