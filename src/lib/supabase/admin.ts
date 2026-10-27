import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

/**
 * Service-role (secret key) client. Server code and scripts/worker ONLY.
 * Bypasses RLS — callers must scope every query by merchant themselves.
 */
export function createAdminClient() {
  const env = getServerEnv();
  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    throw new Error("Supabase admin env vars are not set (URL + SUPABASE_SECRET_KEY)");
  }
  return createSupabaseClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function hasAdminConfig(): boolean {
  const env = getServerEnv();
  return Boolean(env.supabaseUrl && env.supabaseSecretKey);
}
