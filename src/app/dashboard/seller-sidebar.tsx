"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense } from "react";
import {
  BarChartSquare01,
  Calendar,
  Inbox01,
  LayersThree01,
  MarkerPin01,
  MessageChatCircle,
  Package,
  Play,
  Settings01,
  Stars01,
  Users01,
} from "@untitledui/icons";
import { BrandMark } from "@/components/brand-mark";
import { invalidateClientSession, useSessionInfo } from "@/lib/auth/client-session";
import { invalidateDashboardUrl, prefetchDashboardUrl } from "./use-poll";

const LINKS: Array<{
  href: string;
  label: string;
  icon: typeof BarChartSquare01;
  exact?: boolean;
  prefetchUrls?: string[];
}> = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: BarChartSquare01,
    exact: true,
    prefetchUrls: ["/api/dashboard/orders", "/api/dashboard/analytics"],
  },
  {
    href: "/dashboard/catalog",
    label: "Products",
    icon: LayersThree01,
    prefetchUrls: ["/api/dashboard/catalog"],
  },
  {
    href: "/dashboard/clients",
    label: "Clients",
    icon: Users01,
    prefetchUrls: ["/api/dashboard/clients"],
  },
  {
    href: "/dashboard/conversations",
    label: "Inbox",
    icon: Inbox01,
    prefetchUrls: ["/api/dashboard/conversations"],
  },
  {
    href: "/dashboard/orders",
    label: "Orders",
    icon: Package,
    prefetchUrls: ["/api/dashboard/orders"],
  },
  {
    href: "/dashboard/map",
    label: "Map",
    icon: MarkerPin01,
    prefetchUrls: ["/api/dashboard/map"],
  },
  {
    href: "/dashboard/ai",
    label: "AI",
    icon: Stars01,
    prefetchUrls: ["/api/dashboard/ai", "/api/ai-controls"],
  },
  {
    href: "/dashboard/calendar",
    label: "Calendar",
    icon: Calendar,
    prefetchUrls: ["/api/calendar"],
  },
  {
    href: "/dashboard/channels",
    label: "Channels",
    icon: MessageChatCircle,
  },
];

function active(path: string, href: string, exact?: boolean): boolean {
  if (exact) return path === href;
  if (href === "/dashboard/orders") return path === href || path.startsWith("/dashboard/orders/");
  return path === href || path.startsWith(`${href}/`);
}

function warmUrls(urls?: string[]) {
  if (!urls) return;
  for (const url of urls) {
    prefetchDashboardUrl(url);
  }
}

export function SellerSidebar() {
  return (
    <Suspense fallback={<SellerSidebarFrame path="" />}>
      <SellerSidebarPath />
    </Suspense>
  );
}

function SellerSidebarPath() {
  return <SellerSidebarFrame path={usePathname()} />;
}

function SellerSidebarFrame({ path }: { path: string }) {
  const router = useRouter();
  const session = useSessionInfo();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    invalidateClientSession();
    invalidateDashboardUrl();
    router.push("/");
    router.refresh();
  }

  return (
    <aside className="border-b border-[#E4E4E7] bg-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[264px] lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between gap-3 border-b border-[#E4E4E7] px-5 py-5">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-2.5 text-[#09090B] no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B8A5E]"
        >
          <BrandMark className="size-6 shrink-0" />
          <div className="min-w-0">
            <p className="text-[1.0625rem] leading-tight font-medium tracking-[-0.02em] text-[#09090B]">Wassalha</p>
            <p className="truncate font-mono text-[11px] uppercase tracking-[0.06em] text-[#71717A]">
              {session?.name ?? "Shop desk"}
            </p>
          </div>
        </Link>
      </div>
      <nav
        aria-label="Shop workspace"
        className="flex gap-1 overflow-x-auto px-3 py-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-4 lg:py-4"
      >
        {LINKS.map((link) => {
          const Icon = link.icon;
          const on = active(path, link.href, link.exact);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={on ? "page" : undefined}
              onMouseEnter={() => warmUrls(link.prefetchUrls)}
              onFocus={() => warmUrls(link.prefetchUrls)}
              className={`flex shrink-0 items-center gap-2.5 rounded-none px-3 py-2 text-sm font-medium no-underline transition-colors duration-100 ${
                on
                  ? "bg-[#1D1E1A] text-white"
                  : "text-[#52525B] hover:bg-[#FAFAF9] hover:text-[#09090B]"
              }`}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {link.label}
            </Link>
          );
        })}
        {session?.slug ? (
          <Link
            href={`/demo/${session.slug}`}
            className="mt-2 flex shrink-0 items-center gap-2.5 rounded-none border border-[#A4F4CF] bg-[#F2FBF7] px-3 py-2 text-sm font-medium text-[#15704C] no-underline transition-colors hover:border-[#1B8A5E]"
          >
            <Play className="size-4 shrink-0" aria-hidden="true" />
            My live demo
          </Link>
        ) : (
          <Link
            href="/demo"
            className="mt-2 flex shrink-0 items-center gap-2.5 rounded-none border border-[#E4E4E7] bg-[#FAFAF9] px-3 py-2 text-sm font-medium text-[#09090B] no-underline transition-colors hover:border-[#09090B]"
          >
            <Play className="size-4 shrink-0" aria-hidden="true" />
            Public demo
          </Link>
        )}
      </nav>
      <div className="flex gap-1 overflow-x-auto border-t border-[#E4E4E7] px-3 py-3 lg:flex-col lg:px-4">
        <FooterLink
          href="/dashboard/settings"
          label="Settings"
          icon={Settings01}
          path={path}
          prefetchUrls={["/api/dashboard/settings"]}
        />
        <FooterLink
          href="/dashboard/demand"
          label="Demand"
          path={path}
          prefetchUrls={["/api/dashboard/demand"]}
        />
        <FooterLink
          href="/dashboard/demo"
          label="Stage reset"
          path={path}
          prefetchUrls={["/api/dashboard/demo"]}
        />
        <button
          type="button"
          onClick={() => void logout()}
          className="cursor-pointer rounded-none px-3 py-2 text-left font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#71717A] transition-colors hover:bg-[#FAFAF9] hover:text-[#09090B]"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}

function FooterLink({
  href,
  label,
  path,
  icon: Icon,
  prefetchUrls,
}: {
  href: string;
  label: string;
  path: string;
  icon?: typeof Settings01;
  prefetchUrls?: string[];
}) {
  const on = path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onMouseEnter={() => warmUrls(prefetchUrls)}
      onFocus={() => warmUrls(prefetchUrls)}
      className={`flex items-center gap-2 rounded-none px-3 py-2 text-sm no-underline transition-colors ${
        on ? "bg-[#F4F4F5] font-medium text-[#09090B]" : "text-[#52525B] hover:bg-[#FAFAF9] hover:text-[#09090B]"
      }`}
    >
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
      {label}
    </Link>
  );
}
