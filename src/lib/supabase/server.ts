import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/env";

/** Server Component / Route Handler client bound to the request cookies. */
export async function createClient() {
  const env = getServerEnv();
  if (!env.supabaseUrl || !env.supabasePublishableKey) {
    throw new Error("Supabase public env vars are not set");
  }
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component; safe to ignore when middleware refreshes sessions.
        }
      },
    },
  });
}
