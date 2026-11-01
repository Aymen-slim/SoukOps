import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export interface UnmatchedDemand {
  id: string;
  description: string | null;
  cropUrl: string | null;
  conversationId: string | null;
  createdAt: string;
}

export interface LandmarkMiss {
  id: string;
  query: string;
  governorate: string | null;
  createdAt: string;
}

export interface DemandPayload {
  unmatched: UnmatchedDemand[];
  topDescriptions: Array<{ description: string; count: number }>;
  landmarkMisses: LandmarkMiss[];
}

async function signCrop(supabase: Admin, path: string | null): Promise<string | null> {
  if (!path) return null;
  const clean = path.startsWith("crops:") ? path.slice("crops:".length) : path;
  const { data } = await supabase.storage.from("crops").createSignedUrl(clean, 3600);
  return data?.signedUrl ?? null;
}

/** Seller view of what buyers asked for that the catalog could not match. */
export async function loadDemand(supabase: Admin, merchantId: string): Promise<DemandPayload> {
  const [{ data: unmatchedRows }, { data: missRows }] = await Promise.all([
    supabase
      .from("unmatched_demands")
      .select("id, description, crop_path, conversation_id, created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("landmark_misses")
      .select("id, query, governorate, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const counts = new Map<string, number>();
  for (const row of unmatchedRows ?? []) {
    const description = (row.description as string | null)?.trim();
    if (description) counts.set(description, (counts.get(description) ?? 0) + 1);
  }

  return {
    unmatched: await Promise.all(
      (unmatchedRows ?? []).map(async (row) => ({
        id: row.id as string,
        description: (row.description as string | null) ?? null,
        cropUrl: await signCrop(supabase, (row.crop_path as string | null) ?? null),
        conversationId: (row.conversation_id as string | null) ?? null,
        createdAt: row.created_at as string,
      })),
    ),
    topDescriptions: [...counts.entries()]
      .map(([description, count]) => ({ description, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    landmarkMisses: (missRows ?? []).map((row) => ({
      id: row.id as string,
      query: row.query as string,
      governorate: (row.governorate as string | null) ?? null,
      createdAt: row.created_at as string,
    })),
  };
}
