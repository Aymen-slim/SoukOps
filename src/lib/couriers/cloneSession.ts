import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/env";

export const CLONE_COOKIE = "fd_clone_session";

export function cloneCredentials(): { user: string; password: string } {
  const env = getServerEnv();
  return { user: env.COURIER_CLONE_USER, password: env.COURIER_CLONE_PASSWORD };
}

export function cloneSessionToken(): string {
  const { user, password } = cloneCredentials();
  return createHash("sha256").update(`wassalha-fd:${user}:${password}`).digest("hex");
}

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function credentialsMatch(user: string, password: string): boolean {
  const expected = cloneCredentials();
  return sameSecret(user, expected.user) && sameSecret(password, expected.password);
}

/** Bearer token when configured, clone session cookie, or open mock when no token is set. */
export async function requestCanUseFd(request: Request): Promise<boolean> {
  const env = getServerEnv();
  const header = request.headers.get("authorization");
  if (env.FD_API_TOKEN && header === `Bearer ${env.FD_API_TOKEN}`) return true;
  const jar = await cookies();
  const session = jar.get(CLONE_COOKIE)?.value;
  if (session && session === cloneSessionToken()) return true;
  return !env.FD_API_TOKEN;
}
