import { Suspense } from "react";
import { SiteBar } from "@/components/site-bar";
import { getDemoMerchant } from "@/lib/dashboard/merchant";
import { loadPublicCatalog, type PublicProduct } from "@/lib/demo/public-catalog";
import { isProCategory, type ProCategory, type WorkspaceMode } from "@/lib/pro/types";
import { simulatorIsPublic } from "@/lib/security/simulatorGuard";
import { createAdminClient } from "@/lib/supabase/admin";
import SimulatorClient, { type DemoPlatform } from "../simulator/simulator-client";

function parsePlatform(raw: string | string[] | undefined): DemoPlatform {
  const val = typeof raw === "string" ? raw.toLowerCase() : "";
  if (val === "instagram" || val === "ig") return "instagram";
  if (val === "messenger" || val === "fb") return "messenger";
  return "whatsapp";
}

function parseTrack(raw: string | string[] | undefined): WorkspaceMode {
  const val = typeof raw === "string" ? raw.toLowerCase() : "";
  return val === "pro" || val === "creator" ? "pro" : "ecommerce";
}

function parseProPreset(raw: string | string[] | undefined): ProCategory {
  const val = typeof raw === "string" ? raw.toLowerCase() : "";
  return isProCategory(val) ? val : "creator";
}

async function DemoWithQuery({
  searchParams,
}: {
  searchParams: Promise<{
    conversation?: string | string[];
    platform?: string | string[];
    track?: string | string[];
    preset?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const raw = sp.conversation;
  const initialConversationId = typeof raw === "string" ? raw : null;
  const initialPlatform = parsePlatform(sp.platform);
  const initialTrack = parseTrack(sp.track);
  const initialProPreset = parseProPreset(sp.preset);

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
      initialTrack={initialTrack}
      initialProPreset={initialProPreset}
      products={products}
    />
  );
}

export default function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{
    conversation?: string | string[];
    platform?: string | string[];
    track?: string | string[];
    preset?: string | string[];
  }>;
}) {
  if (!simulatorIsPublic()) {
    return (
      <main className="wassalha-public min-h-screen">
        <SiteBar />
        <p className="mx-auto min-h-[70vh] w-full max-w-[1200px] px-4 py-10 text-base text-tertiary sm:px-6">
          The demo is closed for now.
        </p>
      </main>
    );
  }
  return (
    <main className="wassalha-public min-h-screen">
      <SiteBar />
      <Suspense
        fallback={
          <p className="mx-auto min-h-[70vh] w-full max-w-[1200px] px-4 py-10 text-base text-tertiary sm:px-6">
            Loading the demo…
          </p>
        }
      >
        <DemoWithQuery searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
