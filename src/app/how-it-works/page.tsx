import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteBar } from "@/components/site-bar";
import type { WorkspaceMode } from "@/lib/pro/types";
import { HowItWorksClient } from "./how-it-works-client";

export const metadata: Metadata = {
  title: "How Wassalha Works — Online Shops & Creators/Pros in Tunisia",
  description:
    "See how Wassalha handles WhatsApp, Instagram, and Messenger DMs in Tunisian Derja, French, and Arabic for both online shops and creators/professionals.",
};

async function HowItWorksResolved({
  searchParams,
}: {
  searchParams: Promise<{ track?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = typeof sp.track === "string" ? sp.track.toLowerCase() : "";
  const initialTrack: WorkspaceMode = raw === "pro" || raw === "creator" ? "pro" : "ecommerce";
  return <HowItWorksClient initialTrack={initialTrack} />;
}

export default function HowItWorksPage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string | string[] }>;
}) {
  return (
    <main className="wassalha-public min-h-screen bg-white">
      <SiteBar />
      <Suspense
        fallback={
          <div className="mx-auto max-w-[1200px] px-4 py-12 text-sm text-[#52525B] sm:px-6">
            Loading workflow guide…
          </div>
        }
      >
        <HowItWorksResolved searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
