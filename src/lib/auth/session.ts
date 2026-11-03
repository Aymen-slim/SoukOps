import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { mapMerchant, SHOP_COLUMNS, type DemoMerchant } from "@/lib/dashboard/merchant";

export const SANDBOX_COOKIE = "wassalha_sandbox";

type Admin = ReturnType<typeof createAdminClient>;

const SESSION_CACHE_TTL_MS = 15_000;
const merchantSessionCache = new Map<string, { merchant: DemoMerchant | null; expiresAt: number }>();

export function clearMerchantSessionCache(): void {
  merchantSessionCache.clear();
}

function sandboxSecret(): string {
  const secret = getServerEnv().supabaseSecretKey;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is required to open a demo account");
  return secret;
}

export function signSandbox(merchantId: string): string {
  const sig = createHmac("sha256", sandboxSecret()).update(merchantId).digest("base64url");
  return `${merchantId}.${sig}`;
}

export function readSandboxId(token: string | undefined | null): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const merchantId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/i.test(merchantId)) return null;
  let expected: string;
  try {
    expected = createHmac("sha256", sandboxSecret()).update(merchantId).digest("base64url");
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return merchantId;
}

async function shopById(supabase: Admin, id: string, sandboxOnly: boolean): Promise<DemoMerchant | null> {
  let query = supabase.from("merchants").select(SHOP_COLUMNS).eq("id", id);
  if (sandboxOnly) query = query.eq("is_sandbox", true);
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return mapMerchant(data as Record<string, unknown>);
}

/** Logged-in shop wins. Otherwise the signed demo-account cookie. */
export async function resolveRequestMerchant(): Promise<DemoMerchant | null> {
  const jar = await cookies();
  const allCookies = jar.getAll();
  const sbCookies = allCookies.filter((c) => c.name.startsWith("sb-"));
  const sandboxValue = jar.get(SANDBOX_COOKIE)?.value ?? "";

  // Fast path: pure guest has neither Supabase auth cookies nor sandbox cookie.
  if (sbCookies.length === 0 && !sandboxValue) {
    return null;
  }

  const cacheKey = createHash("sha256")
    .update(
      sbCookies
        .map((c) => `${c.name}=${c.value}`)
        .sort()
        .join("&") + `|sandbox=${sandboxValue}`,
    )
    .digest("hex");

  const now = Date.now();
  const cached = merchantSessionCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.merchant;
  }

  const admin = createAdminClient();
  if (sbCookies.length > 0) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (userId) {
        const { data: row, error } = await admin
          .from("merchants")
          .select(SHOP_COLUMNS)
          .eq("owner_user_id", userId)
          .maybeSingle();
        if (!error && row) {
          const merchant = mapMerchant(row as Record<string, unknown>);
          merchantSessionCache.set(cacheKey, { merchant, expiresAt: now + SESSION_CACHE_TTL_MS });
          return merchant;
        }
      }
    } catch {
      // Public env or session cookies may be absent. Fall through to the sandbox cookie.
    }
  }

  const sandboxId = readSandboxId(sandboxValue);
  if (!sandboxId) {
    merchantSessionCache.set(cacheKey, { merchant: null, expiresAt: now + SESSION_CACHE_TTL_MS });
    return null;
  }
  const merchant = await shopById(admin, sandboxId, true);
  merchantSessionCache.set(cacheKey, { merchant, expiresAt: now + SESSION_CACHE_TTL_MS });
  return merchant;
}

export function sandboxCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  path: string;
  maxAge: number;
  secure: boolean;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  };
}
