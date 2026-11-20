"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense } from "react";
import {
  Bell01,
  Briefcase01,
  Calendar,
  ClipboardCheck,
  Inbox01,
  MessageChatCircle,
  Play,
  Settings01,
  Stars01,
  Target04,
  User01,
} from "@untitledui/icons";
import { BrandMark } from "@/components/brand-mark";
import { invalidateClientSession, useSessionInfo } from "@/lib/auth/client-session";
import { invalidateDashboardUrl, prefetchDashboardUrl, usePoll } from "@/app/dashboard/use-poll";
import { getProPreset } from "@/lib/pro/presets";

interface BriefingBadgesResponse {
  badges?: {
    unreadAlerts?: number;
    newOpportunities?: number;
  };
}

const LINKS: Array<{
  href: string;
  label: string;
  icon: typeof Stars01;
  exact?: boolean;
  badgeKey?: "unreadAlerts" | "newOpportunities";
  prefetchUrls?: string[];
}> = [
  {
    href: "/pro",
    label: "Command Center",
    icon: Stars01,
    exact: true,
    prefetchUrls: ["/api/pro/briefing", "/api/pro/alerts"],
  },
  {
    href: "/pro/inbox",
    label: "Inbox",
    icon: Inbox01,
    prefetchUrls: ["/api/pro/inbox"],
  },
  {
    href: "/pro/services",
    label: "Services",
    icon: Briefcase01,
    prefetchUrls: ["/api/pro/services"],
  },
  {
    href: "/pro/inquiries",
    label: "Inquiries",
    icon: ClipboardCheck,
    prefetchUrls: ["/api/pro/inquiries"],
  },
  {
    href: "/pro/calendar",
    label: "Calendar",
    icon: Calendar,
    prefetchUrls: ["/api/calendar"],
  },
  {
    href: "/pro/opportunities",
    label: "Opportunities",
    icon: Target04,
    badgeKey: "newOpportunities",
    prefetchUrls: ["/api/pro/opportunities"],
  },
  {
    href: "/pro/alerts",
    label: "Alerts",
    icon: Bell01,
    badgeKey: "unreadAlerts",
    prefetchUrls: ["/api/pro/alerts"],
  },
  {
    href: "/pro/persona",
    label: "My Style & AI",
    icon: User01,
    prefetchUrls: ["/api/pro/persona"],
  },
  {
    href: "/pro/channels",
    label: "Channels",
    icon: MessageChatCircle,
  },
];

function isActive(path: string, href: string, exact?: boolean): boolean {
  if (exact) return path === href;
  return path === href || path.startsWith(`${href}/`);
}

function warmUrls(urls?: string[]) {
  if (!urls) return;
  for (const url of urls) prefetchDashboardUrl(url);
}

export function ProSidebar() {
  return (
    <Suspense fallback={<ProSidebarFrame path="" />}>
      <ProSidebarPath />
    </Suspense>
  );
}

function ProSidebarPath() {
  return <ProSidebarFrame path={usePathname()} />;
}

function ProSidebarFrame({ path }: { path: string }) {
  const router = useRouter();
  const session = useSessionInfo();
  const preset = getProPreset(session?.proCategory);
  const { data: badgeData } = usePoll<BriefingBadgesResponse>("/api/pro/briefing", 15_000);

  const unreadAlerts = badgeData?.badges?.unreadAlerts ?? 0;
  const newOpportunities = badgeData?.badges?.newOpportunities ?? 0;

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
            <p className="text-[1.0625rem] leading-tight font-medium tracking-[-0.02em] text-[#09090B]">
              Wassalha Pro
            </p>
            <p className="truncate font-mono text-[11px] uppercase tracking-[0.06em] text-[#71717A]">
              {session?.name ?? preset.shortLabel}
            </p>
          </div>
        </Link>
      </div>

      <nav
        aria-label="Creator and Professional workspace"
        className="flex gap-1 overflow-x-auto px-3 py-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-4 lg:py-4"
      >
        {LINKS.map((link) => {
          const Icon = link.icon;
          const on = isActive(path, link.href, link.exact);
          const count =
            link.badgeKey === "unreadAlerts"
              ? unreadAlerts
              : link.badgeKey === "newOpportunities"
                ? newOpportunities
                : 0;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={on ? "page" : undefined}
              onMouseEnter={() => warmUrls(link.prefetchUrls)}
              onFocus={() => warmUrls(link.prefetchUrls)}
              className={`flex shrink-0 items-center justify-between gap-2 rounded-none px-3 py-2 text-sm font-medium no-underline transition-colors duration-100 ${
                on
                  ? "bg-[#1D1E1A] text-white"
                  : "text-[#52525B] hover:bg-[#FAFAF9] hover:text-[#09090B]"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {link.label}
              </span>
              {count > 0 ? (
                <span
                  className={`inline-flex min-w-5 items-center justify-center px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums ${
                    link.badgeKey === "unreadAlerts"
                      ? on
                        ? "bg-[#D13C2E] text-white"
                        : "bg-[#FBF3F2] text-[#D13C2E] ring-1 ring-[#F5C6C2]"
                      : on
                        ? "bg-[#1B8A5E] text-white"
                        : "bg-[#F2FBF7] text-[#15704C] ring-1 ring-[#A4F4CF]"
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}

        <Link
          href={session?.slug ? `/demo/${session.slug}` : "/demo"}
          className="mt-2 flex shrink-0 items-center gap-2.5 rounded-none border border-[#A4F4CF] bg-[#F2FBF7] px-3 py-2 text-sm font-medium text-[#15704C] no-underline transition-colors hover:border-[#1B8A5E]"
        >
          <Play className="size-4 shrink-0" aria-hidden="true" />
          Live DM demo
        </Link>
      </nav>

      <div className="flex gap-1 overflow-x-auto border-t border-[#E4E4E7] px-3 py-3 lg:flex-col lg:px-4">
        <Link
          href="/pro/settings"
          aria-current={isActive(path, "/pro/settings") ? "page" : undefined}
          className={`flex items-center gap-2 rounded-none px-3 py-2 text-sm no-underline transition-colors ${
            isActive(path, "/pro/settings")
              ? "bg-[#F4F4F5] font-medium text-[#09090B]"
              : "text-[#52525B] hover:bg-[#FAFAF9] hover:text-[#09090B]"
          }`}
        >
          <Settings01 className="size-4 shrink-0" aria-hidden="true" />
          Settings
        </Link>
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
