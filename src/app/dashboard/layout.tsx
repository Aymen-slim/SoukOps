import { type ReactNode } from "react";
import { WorkspaceGate } from "@/components/workspace-gate";
import { SandboxBanner } from "./sandbox-banner";
import { SellerSidebar } from "./seller-sidebar";
import { WorkerBanner } from "./worker-banner";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#FAFAF9] lg:flex">
      <WorkspaceGate expected="ecommerce" />
      <SellerSidebar />
      <div className="min-w-0 flex-1">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8">
          <SandboxBanner />
          <WorkerBanner />
          {children}
        </div>
      </div>
    </div>
  );
}
