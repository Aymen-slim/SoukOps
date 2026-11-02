"use client";

import Link from "next/link";
import { NavigationPointerOff01 as MapPinOff, PackageSearch } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import type { DemandPayload } from "@/lib/dashboard/demand";
import { usePoll } from "../use-poll";

export function DemandClient() {
  const { data, error } = usePoll<DemandPayload>("/api/dashboard/demand", 5000);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">Unmet demand</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">Demand</h1>
        <p className="mt-0.5 text-sm text-tertiary">
          What buyers asked for with no catalog match, and the landmarks we could not find.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-utility-red-200 bg-error-primary px-4 py-2.5 text-sm text-error-primary">{error}</p>
      ) : null}

      <Card>
        <CardHeader className="border-b border-secondary/70">
          <CardTitle className="flex items-center gap-2">
            <PackageSearch className="size-4 text-brand-secondary" />
            Most requested descriptions
          </CardTitle>
          <CardDescription>Grouped by the buyer&apos;s normalized description.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {data && data.topDescriptions.length === 0 ? <p className="text-tertiary">No unmet demand.</p> : null}
          {(data?.topDescriptions ?? []).map((row) => (
            <div key={row.description} className="flex items-center justify-between gap-4">
              <span dir="auto">{row.description}</span>
              <Badge color="gray" className="font-mono tabular-nums">{row.count}×</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-secondary/70">
            <CardTitle>Latest requests</CardTitle>
            <CardDescription>Crops sent by buyers, with no matching product.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {data && data.unmatched.length === 0 ? <p className="text-tertiary">Nothing yet.</p> : null}
            {(data?.unmatched ?? []).slice(0, 20).map((row) => (
              <div key={row.id} className="flex items-center gap-3">
                {row.cropUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.cropUrl} alt="" className="size-14 shrink-0 rounded-lg border border-secondary bg-checkerboard object-contain" />
                ) : null}
                <div className="min-w-0">
                  <p dir="auto" className="truncate font-medium text-primary">{row.description ?? "No description"}</p>
                  <p className="text-xs text-tertiary">
                    {new Date(row.createdAt).toLocaleString("en-GB")}
                    {row.conversationId ? (
                      <>
                        {" · "}
                        <Link className="underline underline-offset-4" href={`/simulator?conversation=${row.conversationId}`}>conversation</Link>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-secondary/70">
            <CardTitle className="flex items-center gap-2">
              <MapPinOff className="size-4 text-brand-secondary" />
              Landmarks not found
            </CardTitle>
            <CardDescription>Add these to the OSM snapshot or the alias list.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {data && data.landmarkMisses.length === 0 ? <p className="text-tertiary">No landmark misses.</p> : null}
            {(data?.landmarkMisses ?? []).map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-4">
                <span dir="auto">{row.query}</span>
                <span className="text-xs text-tertiary">{row.governorate ?? ""}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
