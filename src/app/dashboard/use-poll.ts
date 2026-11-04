"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const dashboardCache = new Map<string, { data: unknown; updatedAt: number }>();
const inflightPrefetch = new Map<string, Promise<unknown>>();
const PREFETCH_FRESH_MS = 12_000;

export function getCachedDashboard<T>(url: string | null): T | null {
  if (!url) return null;
  const hit = dashboardCache.get(url);
  return hit ? (hit.data as T) : null;
}

export function setCachedDashboard<T>(url: string, data: T): void {
  dashboardCache.set(url, { data, updatedAt: Date.now() });
}

export function invalidateDashboardUrl(prefix?: string): void {
  if (!prefix) {
    dashboardCache.clear();
    return;
  }
  for (const key of dashboardCache.keys()) {
    if (key === prefix || key.startsWith(prefix)) {
      dashboardCache.delete(key);
    }
  }
}

export function prefetchDashboardUrl(url: string): void {
  const existing = dashboardCache.get(url);
  if (existing && Date.now() - existing.updatedAt < PREFETCH_FRESH_MS) return;
  if (inflightPrefetch.has(url)) return;

  const req = fetch(url)
    .then(async (res) => {
      if (!res.ok) return null;
      const body = (await res.json().catch(() => null)) as unknown;
      if (body && typeof body === "object" && !("error" in body && (body as { error?: unknown }).error)) {
        dashboardCache.set(url, { data: body, updatedAt: Date.now() });
      }
      return body;
    })
    .catch(() => null)
    .finally(() => {
      inflightPrefetch.delete(url);
    });

  inflightPrefetch.set(url, req);
}

export function usePoll<T>(
  url: string | null,
  ms: number | ((current: T | null) => number) = 2000,
): { data: T | null; error: string | null; reload: () => Promise<void> } {
  const [state, setState] = useState<{ url: string | null; data: T | null }>({ url, data: null });
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const queued = useRef(false);

  const resolvedData = state.url === url ? state.data : null;
  const intervalMs = typeof ms === "function" ? ms(resolvedData) : ms;

  useLayoutEffect(() => {
    const cached = getCachedDashboard<T>(url);
    if (cached) setState({ url, data: cached });
  }, [url]);

  const reload = useCallback(async () => {
    if (!url) return;
    if (busy.current) {
      queued.current = true;
      return;
    }
    busy.current = true;
    try {
      do {
        queued.current = false;
        const res = await fetch(url);
        const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
        if (!res.ok) {
          setError(body?.error ?? "Could not load.");
          return;
        }
        setError(null);
        const next = body as T;
        setCachedDashboard(url, next);
        setState({ url, data: next });
      } while (queued.current);
    } finally {
      busy.current = false;
    }
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void reload();
    });
    const timer = setInterval(() => {
      if (!busy.current && (typeof document === "undefined" || document.visibilityState !== "hidden")) {
        void reload();
      }
    }, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [reload, intervalMs]);

  return { data: resolvedData, error, reload };
}

/** One-shot SWR hook for dashboard pages that don't need 2s live polling. */
export function useDashboardResource<T>(url: string): {
  data: T | null;
  error: string | null;
  reload: () => Promise<T | null>;
  mutate: (updater: T | ((prev: T | null) => T)) => void;
} {
  const [state, setState] = useState<{ url: string; data: T | null }>({ url, data: null });
  const [error, setError] = useState<string | null>(null);

  const resolvedData = state.url === url ? state.data : null;

  useLayoutEffect(() => {
    const cached = getCachedDashboard<T>(url);
    if (cached) setState({ url, data: cached });
  }, [url]);

  const reload = useCallback(async (): Promise<T | null> => {
    try {
      const res = await fetch(url);
      const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
      if (!res.ok || body?.error) {
        setError(body?.error ?? "Could not load.");
        return null;
      }
      setError(null);
      const next = body as T;
      setCachedDashboard(url, next);
      setState({ url, data: next });
      return next;
    } catch {
      setError("Could not load.");
      return null;
    }
  }, [url]);

  const mutate = useCallback(
    (updater: T | ((prev: T | null) => T)) => {
      setState((prev) => {
        const current = (prev.url === url ? prev.data : null) ?? getCachedDashboard<T>(url);
        const next = typeof updater === "function" ? (updater as (p: T | null) => T)(current) : updater;
        setCachedDashboard(url, next);
        return { url, data: next };
      });
    },
    [url],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void reload();
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  return { data: resolvedData, error, reload, mutate };
}
