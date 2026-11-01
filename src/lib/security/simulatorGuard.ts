import { getServerEnv } from "@/lib/env";

/**
 * Simulator hardening (Day 7): the SIMULATOR_PUBLIC kill switch plus a
 * small in-memory rate limiter for the public buyer-facing routes.
 * In-memory is deliberate at demo scale (single dev/Vercel instance);
 * it fails open on restart, never blocks the seller dashboard.
 */

export function simulatorIsPublic(): boolean {
  return getServerEnv().SIMULATOR_PUBLIC !== "false";
}

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Returns a 403/429 Response when the simulator is closed or over limit, else null. */
export function simulatorGuard(request: Request, scope: string, limit: number, windowMs = 60_000): Response | null {
  if (!simulatorIsPublic()) {
    return Response.json({ error: "simulator closed" }, { status: 403 });
  }
  const key = `${scope}:${clientIp(request)}`;
  if (!checkRateLimit(key, limit, windowMs)) {
    return Response.json({ error: "too many requests, try again in a minute" }, { status: 429 });
  }
  return null;
}
