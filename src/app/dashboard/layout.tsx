import { type ReactNode } from "react";
import { SandboxBanner } from "./sandbox-banner";
import { SellerSidebar } from "./seller-sidebar";
import { WorkerBanner } from "./worker-banner";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-dot-grid lg:flex">
      <SellerSidebar />
      <div className="min-w-0 flex-1">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
          <SandboxBanner />
          <WorkerBanner />
          {children}
        </div>
      </div>
    </div>
  );
}
