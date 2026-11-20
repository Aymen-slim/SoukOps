import { Suspense } from "react";
import { HomeExperience } from "@/components/home/home-experience";
import type { HomeTrack } from "@/components/home/workflow-preview";

async function HomeWithParams({
  searchParams,
}: {
  searchParams: Promise<{ track?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = typeof sp.track === "string" ? sp.track.toLowerCase() : "";
  const initialTrack: HomeTrack = raw === "pro" || raw === "creators" ? "pro" : "shops";
  return <HomeExperience initialTrack={initialTrack} />;
}

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ track?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<HomeExperience initialTrack="shops" />}>
      <HomeWithParams searchParams={searchParams} />
    </Suspense>
  );
}
