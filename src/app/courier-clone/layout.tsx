import type { ReactNode } from "react";
import { Truck01 as Truck } from "@untitledui/icons";

export default function CourierLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-secondary text-primary">
      <header className="border-b border-sky-950/20 bg-brand-solid text-white shadow-xs">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-sky-400/15 text-sky-300 ring-1 ring-sky-300/30">
              <Truck className="size-4" />
            </span>
            <div>
              <span className="text-sm font-semibold tracking-wide">First Delivery</span>
              <span className="ml-2 rounded bg-sky-900/80 px-1.5 py-0.5 font-mono text-[10px] text-sky-200">
                TN · SENDER
              </span>
            </div>
          </div>
          <span className="text-xs font-medium text-sky-100">Portail livreur</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">{children}</main>
    </div>
  );
}
