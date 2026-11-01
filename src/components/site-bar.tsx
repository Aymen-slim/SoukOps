"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Inbox,
  Layers,
  MapPin,
  MessageSquare,
  Package,
  PackageSearch,
  Play,
  Settings,
  Sparkles,
} from "lucide-react";

const LINKS = [
  { href: "/simulator", label: "Chat", icon: MessageSquare },
  { href: "/dashboard", label: "Orders", icon: Package },
  { href: "/dashboard/conversations", label: "Inbox", icon: Inbox },
  { href: "/dashboard/catalog", label: "Catalog", icon: Layers },
  { href: "/dashboard/demand", label: "Demand", icon: PackageSearch },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/demo", label: "Demo", icon: Play },
  { href: "/design-system", label: "System", icon: Sparkles },
];

function isActive(path: string, href: string): boolean {
  if (href === "/dashboard") return path === "/dashboard" || path.startsWith("/dashboard/orders");
  return path === href || path.startsWith(`${href}/`);
}

export function SiteBar() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          <span className="relative flex size-8 items-center justify-center rounded-xl bg-surface-ink text-brand-saffron shadow-[0_2px_6px_rgba(28,25,23,0.18)] transition-transform duration-150 ease-[var(--ease-out)] group-hover:scale-105">
            <MapPin className="size-4 fill-brand-saffron/20 stroke-[2.2]" />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight text-foreground leading-none">
              Wassalha
            </span>
            <span className="mt-0.5 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              Tunis · AI Dispatch
            </span>
          </div>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-full bg-muted/75 p-1 ring-1 ring-border/80"
        >
          {LINKS.map((link) => {
            const active = isActive(path, link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-[background-color,color,box-shadow] duration-150 ease-[var(--ease-out)] ${
                  active
                    ? "bg-surface-ink text-primary-foreground shadow-[0_1px_3px_rgba(28,25,23,0.2)]"
                    : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                }`}
              >
                <Icon className={`size-3.5 ${active ? "text-brand-saffron" : "text-muted-foreground"}`} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-status-success-bg px-2.5 py-1 text-[11px] font-medium text-status-success-fg ring-1 ring-status-success-border">
            <span className="size-1.5 rounded-full bg-emerald-600" />
            Firewall Active
          </span>
        </div>
      </div>
    </header>
  );
}
