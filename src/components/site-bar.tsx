"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChartSquare01, Inbox01, LayersThree01, MarkerPin01, MessageSquare01, Package, PackageSearch, Play, Settings01 } from "@untitledui/icons";

const LINKS = [
  { href: "/simulator", label: "Chat", icon: MessageSquare01 },
  { href: "/dashboard", label: "Orders", icon: Package },
  { href: "/dashboard/conversations", label: "Inbox", icon: Inbox01 },
  { href: "/dashboard/catalog", label: "Catalog", icon: LayersThree01 },
  { href: "/dashboard/demand", label: "Demand", icon: PackageSearch },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChartSquare01 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings01 },
  { href: "/dashboard/demo", label: "Demo", icon: Play },
];

function isActive(path: string, href: string): boolean {
  if (href === "/dashboard") return path === "/dashboard" || path.startsWith("/dashboard/orders");
  return path === href || path.startsWith(`${href}/`);
}

export function SiteBar() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-secondary bg-primary/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          <span className="relative flex size-8 items-center justify-center rounded-lg bg-brand-solid text-white shadow-xs-skeuomorphic transition-transform duration-100 ease-linear group-hover:scale-105">
            <MarkerPin01 className="size-4 stroke-[2.2]" />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight text-primary leading-none">
              Wassalha
            </span>
            <span className="mt-0.5 text-[10px] font-medium tracking-wider text-tertiary uppercase">
              Tunis · AI Dispatch
            </span>
          </div>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-full bg-secondary p-1 ring-1 ring-secondary"
        >
          {LINKS.map((link) => {
            const active = isActive(path, link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition duration-100 ease-linear ${
                  active
                    ? "bg-brand-solid text-white shadow-xs"
                    : "text-tertiary hover:bg-primary_hover hover:text-primary"
                }`}
              >
                <Icon className="size-3.5" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-primary px-2.5 py-1 text-[11px] font-medium text-success-primary ring-1 ring-utility-green-200 ring-inset">
            <span className="size-1.5 rounded-full bg-utility-green-600" />
            Firewall Active
          </span>
        </div>
      </div>
    </header>
  );
}
