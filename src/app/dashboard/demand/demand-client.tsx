"use client";

import Link from "next/link";
import { NavigationPointerOff01 as MapPinOff, PackageSearch } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import { Table, TableCard } from "@/components/application/table/table";
import { Alert } from "@/components/foundations/alert/alert";
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

      {error ? <Alert color="error">{error}</Alert> : null}

      <TableCard.Root>
        <TableCard.Header
          title="Most requested descriptions"
          badge={`${data?.topDescriptions.length ?? 0} groups`}
          description="Grouped by the buyer's normalized description."
          contentTrailing={<PackageSearch className="size-5 text-brand-secondary" aria-hidden="true" />}
        />
        <Table aria-label="Most requested descriptions">
          <Table.Header>
            <Table.Head label="Description" isRowHeader />
            <Table.Head label="Requests" />
          </Table.Header>
          <Table.Body>
            {(data?.topDescriptions ?? []).map((row) => (
              <Table.Row key={row.description} id={row.description}>
                <Table.Cell>
                  <span dir="auto" className="text-primary">{row.description}</span>
                </Table.Cell>
                <Table.Cell>
                  <Badge color="gray" className="font-mono tabular-nums">{row.count}×</Badge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        {data && data.topDescriptions.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-tertiary">No unmet demand.</p>
        ) : null}
      </TableCard.Root>

      <div className="grid items-start gap-6 lg:grid-cols-2">
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

        <TableCard.Root>
          <TableCard.Header
            title="Landmarks not found"
            badge={`${data?.landmarkMisses.length ?? 0}`}
            description="Add these to the OSM snapshot or the alias list."
            contentTrailing={<MapPinOff className="size-5 text-brand-secondary" aria-hidden="true" />}
          />
          <Table aria-label="Landmarks not found">
            <Table.Header>
              <Table.Head label="Query" isRowHeader />
              <Table.Head label="Governorate" />
            </Table.Header>
            <Table.Body>
              {(data?.landmarkMisses ?? []).map((row) => (
                <Table.Row key={row.id} id={row.id}>
                  <Table.Cell>
                    <span dir="auto" className="text-primary">{row.query}</span>
                  </Table.Cell>
                  <Table.Cell>{row.governorate ?? "—"}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          {data && data.landmarkMisses.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-tertiary">No landmark misses.</p>
          ) : null}
        </TableCard.Root>
      </div>
    </div>
  );
}
