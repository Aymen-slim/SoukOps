"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle as CheckCircle2, Clock, Package, AlertOctagon as ShieldAlert, Truck01 as Truck } from "@untitledui/icons";
import type { Selection } from "react-aria-components";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { Select } from "@/components/base/select/select";
import { Table, TableCard } from "@/components/application/table/table";
import { PaginationCardMinimal } from "@/components/application/pagination/pagination";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Alert } from "@/components/foundations/alert/alert";
import { Metric } from "@/components/foundations/metric/metric";
import type { QueueOrder } from "@/lib/dashboard/orders";
import { JOB_LABEL, RiskBadge, money } from "./bits";
import { usePoll } from "./use-poll";

const FILTERS = [
  { id: "all", label: "All orders" },
  { id: "awaiting", label: "To approve" },
  { id: "waybilled", label: "Waybilled" },
  { id: "red", label: "Red risk" },
];

export function OrdersQueue() {
  const router = useRouter();
  const { data, error, reload } = usePoll<{ orders: QueueOrder[] }>("/api/dashboard/orders");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Selection>(new Set());
  const orders = data?.orders ?? [];

  async function approve(id: string, navigate = true) {
    setBusy(id);
    setActionError(null);
    const res = await fetch(`/api/orders/${id}/approve`, { method: "POST" });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    setBusy(null);
    if (!res.ok) setActionError(body?.error ?? "Couldn't approve.");
    else if (navigate) router.push(`/dashboard/orders/${id}`);
    return res.ok;
  }

  const awaitingCount = orders.filter(
    (o) => o.status === "CONFIRMED_BY_BUYER" && !o.job && !o.shipment,
  ).length;
  const shippedCount = orders.filter((o) => Boolean(o.shipment)).length;
  const redRiskCount = orders.filter((o) => o.riskLevel === "red").length;

  const visible = orders.filter((o) => {
    if (filter === "awaiting") return o.status === "CONFIRMED_BY_BUYER" && !o.job && !o.shipment;
    if (filter === "waybilled") return Boolean(o.shipment);
    if (filter === "red") return o.riskLevel === "red";
    return true;
  });

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paged = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectedIds = selected === "all" ? paged.map((o) => o.id) : [...selected].map(String);
  const approvableSelected = visible.filter(
    (o) =>
      selectedIds.includes(o.id) &&
      o.status === "CONFIRMED_BY_BUYER" &&
      !o.job &&
      !o.shipment,
  );

  async function approveSelected() {
    for (const order of approvableSelected) {
      await approve(order.id, false);
    }
    setSelected(new Set());
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">
            Seller Console
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
            Orders
          </h1>
          <p className="mt-0.5 text-sm text-tertiary">
            Approve, check the risk, then send.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <Metric label="To approve" value={awaitingCount} icon={Clock} />
          <Metric label="Waybills" value={shippedCount} icon={Truck} iconClassName="text-utility-green-700" />
          <Metric label="Red risk" value={redRiskCount} icon={ShieldAlert} iconClassName="text-error-primary" />
        </div>
      </div>

      {error ? <Alert color="error">{error}</Alert> : null}
      {actionError ? <Alert color="error">{actionError}</Alert> : null}

      {data && orders.length === 0 ? (
        <div className="rounded-xl bg-primary py-12 shadow-xs ring-1 ring-secondary">
          <EmptyState size="md">
            <EmptyState.Header>
              <EmptyState.FeaturedIcon color="gray" icon={Package} />
            </EmptyState.Header>
            <EmptyState.Content>
              <EmptyState.Title>No orders waiting</EmptyState.Title>
              <EmptyState.Description>
                Buyer orders confirmed with Akked in the simulator will appear here automatically.
              </EmptyState.Description>
            </EmptyState.Content>
          </EmptyState>
        </div>
      ) : (
        <TableCard.Root>
          <TableCard.Header
            title="Orders"
            badge={`${visible.length} shown`}
            description="Approve, check the risk, then send."
            contentTrailing={
              <div className="w-44">
                <Select
                  aria-label="Filter orders"
                  selectedKey={filter}
                  onSelectionChange={(key) => {
                    setFilter(String(key));
                    setPage(1);
                  }}
                  items={FILTERS}
                >
                  {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
              </div>
            }
          />
          {selectedIds.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-secondary bg-secondary px-4 py-2.5 text-sm">
              <span className="text-secondary">
                {selectedIds.length} selected
                {approvableSelected.length ? ` · ${approvableSelected.length} can be approved` : ""}
              </span>
              <span className="flex gap-2">
                <Button size="sm" color="tertiary" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
                <Button
                  size="sm"
                  isDisabled={approvableSelected.length === 0 || busy !== null}
                  onClick={() => void approveSelected()}
                >
                  Approve selected
                </Button>
              </span>
            </div>
          ) : null}
          <Table aria-label="Orders" selectionMode="multiple" selectedKeys={selected} onSelectionChange={setSelected}>
            <Table.Header>
              <Table.Head label="Order" isRowHeader />
              <Table.Head label="Total" />
              <Table.Head label="Risk" />
              <Table.Head label="Status" />
              <Table.Head label="Location" />
              <Table.Head label="Action" />
            </Table.Header>
            <Table.Body>
              {paged.map((order) => {
                const canApprove = order.status === "CONFIRMED_BY_BUYER" && !order.job && !order.shipment;
                return (
                  <Table.Row key={order.id} id={order.id}>
                    <Table.Cell>
                      <div className="flex items-center gap-3">
                        {order.cropUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={order.cropUrl}
                            alt=""
                            className="size-11 shrink-0 rounded-lg border border-secondary bg-checkerboard object-cover"
                          />
                        ) : (
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-secondary bg-tertiary text-tertiary">
                            <Package className="size-5 opacity-40" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <Link
                            href={`/dashboard/orders/${order.id}`}
                            className="block truncate font-medium text-primary hover:text-brand-secondary hover:underline"
                          >
                            {order.customerName ?? "Buyer"} — {order.designation ?? "Order"}
                          </Link>
                          {order.riskReasons[0] ? (
                            <p className="truncate text-xs text-tertiary">{order.riskReasons[0]}</p>
                          ) : null}
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="font-mono font-semibold whitespace-nowrap tabular-nums text-primary">
                        {money(order.totalMillimes)}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <RiskBadge level={order.riskLevel} score={order.riskScore} />
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-wrap gap-1.5">
                        {order.job ? (
                          <Badge color={order.job.status === "failed" ? "error" : "blue"}>
                            {JOB_LABEL[order.job.status] ?? order.job.status}
                          </Badge>
                        ) : null}
                        {order.shipment ? (
                          <Badge color="gray" className="font-mono tabular-nums">
                            <CheckCircle2 className="size-3 text-utility-green-600" />
                            Code {order.shipment.barcode}
                          </Badge>
                        ) : null}
                        {!order.job && !order.shipment ? <Badge color="gray">{order.status}</Badge> : null}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      {order.governorate
                        ? `${order.governorate}${order.landmark ? ` · ${order.landmark}` : ""}`
                        : "—"}
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-1.5">
                        {canApprove ? (
                          <Button
                            type="button"
                            size="sm"
                            isDisabled={busy === order.id}
                            onClick={() => void approve(order.id)}
                          >
                            Approve
                          </Button>
                        ) : (
                          <Button href={`/dashboard/orders/${order.id}`} color="secondary" size="sm">
                            Open
                          </Button>
                        )}
                        <Dropdown.Root>
                          <Dropdown.DotsButton />
                          <Dropdown.Popover className="w-min">
                            <Dropdown.Menu
                              onAction={(key) => {
                                if (key === "approve" && canApprove) void approve(order.id);
                                if (key === "remove") {
                                  if (!window.confirm("Remove this order from the queue?")) return;
                                  void (async () => {
                                    setBusy(order.id);
                                    const res = await fetch(`/api/dashboard/orders/${order.id}`, { method: "DELETE" });
                                    setBusy(null);
                                    if (!res.ok) {
                                      const body = (await res.json().catch(() => null)) as { error?: string } | null;
                                      setActionError(body?.error ?? "Couldn't remove the order.");
                                      return;
                                    }
                                    await reload();
                                  })();
                                }
                              }}
                            >
                              <Dropdown.Item id="open" href={`/dashboard/orders/${order.id}`}>
                                <span className="pr-4">View order</span>
                              </Dropdown.Item>
                              {canApprove ? (
                                <Dropdown.Item id="approve">
                                  <span className="pr-4">Approve</span>
                                </Dropdown.Item>
                              ) : null}
                              <Dropdown.Item id="remove">
                                <span className="pr-4">Remove</span>
                              </Dropdown.Item>
                            </Dropdown.Menu>
                          </Dropdown.Popover>
                        </Dropdown.Root>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
          {visible.length === 0 && orders.length > 0 ? (
            <p className="px-6 py-8 text-center text-sm text-tertiary">No orders match this filter.</p>
          ) : null}
          {totalPages > 1 ? (
            <PaginationCardMinimal page={page} total={totalPages} onPageChange={setPage} />
          ) : null}
        </TableCard.Root>
      )}
    </div>
  );
}
