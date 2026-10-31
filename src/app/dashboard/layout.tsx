import { Suspense, type ReactNode } from "react";
import { SiteBar } from "@/components/site-bar";
import { WorkerBanner } from "./worker-banner";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-medina-grid">
      <Suspense fallback={null}>
        <SiteBar />
      </Suspense>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <WorkerBanner />
        {children}
      </div>
    </div>
  );
}
