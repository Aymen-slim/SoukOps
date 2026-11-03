import { Suspense } from "react";
import { SiteBar } from "@/components/site-bar";
import { getDemoMerchant } from "@/lib/dashboard/merchant";
import { loadPublicCatalog, type PublicProduct } from "@/lib/demo/public-catalog";
import { simulatorIsPublic } from "@/lib/security/simulatorGuard";
import { createAdminClient } from "@/lib/supabase/admin";
import SimulatorClient, { type DemoPlatform } from "../simulator/simulator-client";

function parsePlatform(raw: string | string[] | undefined): DemoPlatform {
  const val = typeof raw === "string" ? raw.toLowerCase() : "";
  if (val === "instagram" || val === "ig") return "instagram";
  if (val === "messenger" || val === "fb") return "messenger";
  return "whatsapp";
}

async function DemoWithQuery({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string | string[]; platform?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = sp.conversation;
  const initialConversationId = typeof raw === "string" ? raw : null;
  const initialPlatform = parsePlatform(sp.platform);
  let products: PublicProduct[] = [];
  try {
    const supabase = createAdminClient();
    const merchant = await getDemoMerchant(supabase);
    if (merchant) products = await loadPublicCatalog(supabase, merchant.id);
  } catch {
    products = [];
  }
  return (
    <SimulatorClient
      initialConversationId={initialConversationId}
      initialPlatform={initialPlatform}
      products={products}
    />
  );
}

export default function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string | string[]; platform?: string | string[] }>;
}) {
  if (!simulatorIsPublic()) {
    return (
      <main className="min-h-screen bg-dot-grid">
        <SiteBar />
        <p className="mx-auto w-full max-w-6xl px-4 py-10 text-sm text-tertiary sm:px-6">
          The demo is closed for now.
        </p>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-dot-grid">
      <SiteBar />
      <Suspense fallback={<p className="p-6 text-sm text-tertiary">Loading the demo…</p>}>
        <DemoWithQuery searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
