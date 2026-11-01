"use client";

import { useCallback, useEffect, useState } from "react";

export function usePoll<T>(url: string | null, ms = 2000): { data: T | null; error: string | null; reload: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!url) return;
    const res = await fetch(url);
    const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok) {
      setError(body?.error ?? "Could not load.");
      return;
    }
    setError(null);
    setData(body as T);
  }, [url]);

  useEffect(() => {
    const initial = setTimeout(() => void reload(), 0);
    const timer = setInterval(() => void reload(), ms);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [reload, ms]);

  return { data, error, reload };
}
