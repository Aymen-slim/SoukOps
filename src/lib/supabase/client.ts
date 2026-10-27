import { createBrowserClient } from "@supabase/ssr";

/** Browser client (publishable key only). Used by simulator/dashboard UI. */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase public env vars are not set");
  return createBrowserClient(url, key);
}
