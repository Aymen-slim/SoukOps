import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SiteBar } from "@/components/site-bar";
import { getShopBySlug } from "@/lib/dashboard/merchant";
import { loadPublicCatalog, type PublicProduct } from "@/lib/demo/public-catalog";
import { simulatorIsPublic } from "@/lib/security/simulatorGuard";
import { createAdminClient } from "@/lib/supabase/admin";
import SimulatorClient, { type DemoPlatform } from "../../simulator/simulator-client";

function parsePlatform(raw: string | string[] | undefined): DemoPlatform {
  const val = typeof raw === "string" ? raw.toLowerCase() : "";
  if (val === "instagram" || val === "ig") return "instagram";
  if (val === "messenger" || val === "fb") return "messenger";
  return "whatsapp";
}

async function ShopDemo({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: Promise<{ conversation?: string | string[]; platform?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = sp.conversation;
  const initialConversationId = typeof raw === "string" ? raw : null;
  const initialPlatform = parsePlatform(sp.platform);
  const supabase = createAdminClient();
  const shop = await getShopBySlug(supabase, slug);
  if (!shop) notFound();
  let products: PublicProduct[] = [];
  try {
    products = await loadPublicCatalog(supabase, shop.id);
  } catch {
    products = [];
  }
  return (
    <SimulatorClient
      initialConversationId={initialConversationId}
      initialPlatform={initialPlatform}
      products={products}
      slug={shop.slug}
      shopName={shop.name}
    />
  );
}

export default function ShopDemoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ conversation?: string | string[]; platform?: string | string[] }>;
}) {
  if (!simulatorIsPublic()) {
    return (
      <main className="min-h-screen bg-dot-grid">
        <SiteBar />
        <p className="mx-auto w-full max-w-6xl px-4 py-10 text-sm text-tertiary">The demo is closed for now.</p>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-dot-grid">
      <SiteBar />
      <Suspense fallback={<p className="p-6 text-sm text-tertiary">Loading the shop…</p>}>
        <ShopDemoLoader params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ShopDemoLoader({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ conversation?: string | string[]; platform?: string | string[] }>;
}) {
  const { slug } = await params;
  return <ShopDemo slug={slug} searchParams={searchParams} />;
}
