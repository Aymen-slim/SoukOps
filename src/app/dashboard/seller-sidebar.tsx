"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense } from "react";
import {
  BarChartSquare01,
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
    prefetchUrls: ["/api/dashboard/ai"],
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
    <aside className="border-b border-secondary bg-primary/95 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between gap-3 border-b border-secondary/60 px-4 py-4">
        <Link href="/" className="group flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-solid text-white shadow-xs-skeuomorphic transition-transform duration-100 ease-linear group-hover:scale-105">
            <MarkerPin01 className="size-4 stroke-[2.2]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm leading-tight font-semibold tracking-tight text-primary">Wassalha</p>
            <p className="truncate text-xs text-tertiary">{session?.name ?? "Seller desk"}</p>
          </div>
        </Link>
      </div>
      <nav
        aria-label="Seller"
        className="flex gap-1 overflow-x-auto px-3 py-3 lg:flex-1 lg:flex-col lg:overflow-visible"
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
              className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-100 ${
                on
                  ? "bg-brand-solid text-white shadow-xs"
                  : "text-secondary hover:bg-secondary hover:text-primary"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              {link.label}
            </Link>
          );
        })}
        {session?.slug ? (
          <Link
            href={`/demo/${session.slug}`}
            className="mt-1 flex shrink-0 items-center gap-2.5 rounded-lg border border-brand/30 bg-brand-primary/40 px-3 py-2 text-sm font-medium text-brand-secondary transition-colors hover:bg-brand-primary"
          >
            <Play className="size-4 shrink-0" />
            My demo
          </Link>
        ) : (
          <Link
            href="/demo"
            className="mt-1 flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-secondary hover:text-primary"
          >
            <Play className="size-4 shrink-0" />
            Public demo
          </Link>
        )}
      </nav>
      <div className="flex gap-1 overflow-x-auto border-t border-secondary px-3 py-3 lg:flex-col">
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
          className="cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium text-tertiary transition-colors hover:bg-secondary hover:text-primary"
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
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
        on ? "bg-secondary font-medium text-primary" : "text-tertiary hover:bg-secondary hover:text-primary"
      }`}
    >
      {Icon ? <Icon className="size-4 shrink-0" /> : null}
      {label}
    </Link>
  );
}
