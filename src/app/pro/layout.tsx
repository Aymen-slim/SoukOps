import { type ReactNode } from "react";
import { SandboxBanner } from "@/app/dashboard/sandbox-banner";
import { WorkspaceGate } from "@/components/workspace-gate";
import { ProSidebar } from "./pro-sidebar";

export default function ProLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#FAFAF9] lg:flex">
      <WorkspaceGate expected="pro" />
      <ProSidebar />
      <div className="min-w-0 flex-1">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8">
          <SandboxBanner />
          {children}
        </div>
      </div>
    </div>
  );
}
