import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export interface DemoMerchant {
  id: string;
  name: string;
  payment_link: string | null;
  free_delivery_threshold_millimes: number | null;
  courier_mode: "mock_api" | "browser" | "real_api";
}

/** Oldest merchant — the one `npm run seed:catalog` / `seed:day5` already uses. */
export async function getDemoMerchant(supabase: Admin): Promise<DemoMerchant | null> {
  const { data, error } = await supabase
    .from("merchants")
    .select("id, name, payment_link, free_delivery_threshold_millimes, courier_mode")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as DemoMerchant;
}
