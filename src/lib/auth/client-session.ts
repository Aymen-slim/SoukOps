"use client";

import { useEffect, useState } from "react";

export interface ClientSessionInfo {
  authenticated: boolean;
  kind: "guest" | "sandbox" | "seller";
  name?: string;
  slug?: string | null;
  isSandbox?: boolean;
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
  // Always start empty. The module cache is filled in the browser after the
  // first fetch, so reading it here makes the server HTML ("Seller desk")
  // disagree with the client's first paint (the shop name).
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
    const warm = cachedSession && cachedSession.expiresAt > Date.now() ? cachedSession.data : null;
    if (warm) setSession(warm);
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

