"use client";

import Link from "next/link";
import { Badge } from "@/components/base/badges/badges";
import { Alert } from "@/components/foundations/alert/alert";
import { useDashboardResource } from "../use-poll";

interface ClientRow {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  orderCount: number;
  latestOrderId: string | null;
  conversationId: string | null;
}

export default function ClientsPage() {
  const { data, error } = useDashboardResource<{ clients: ClientRow[] }>("/api/dashboard/clients");
  const clients = data?.clients ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">Buyers</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">Clients</h1>
        <p className="mt-0.5 text-sm text-tertiary">Name, phone, city, and a jump to their order or AI chat.</p>
      </div>
      {error ? <Alert color="error">{error}</Alert> : null}
      {clients === null && !error ? <p className="text-sm text-tertiary">Loading clients…</p> : null}
      <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
        {(clients ?? []).map((client) => (
          <div
            key={client.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary px-4 py-3 last:border-b-0"
          >
            <div>
              <p className="font-medium text-primary">{client.name}</p>
              <p className="text-xs text-tertiary">
                <span className="font-mono tabular-nums">{client.phone ?? "no phone"}</span>
                {client.city ? ` · ${client.city}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge color="gray">{client.orderCount} orders</Badge>
              {client.latestOrderId ? (
                <Link href={`/dashboard/orders/${client.latestOrderId}`} className="text-sm font-medium text-brand-secondary">
                  Order
                </Link>
              ) : null}
              {client.conversationId ? (
                <Link
                  href={`/dashboard/conversations?open=${client.conversationId}`}
                  className="text-sm font-medium text-brand-secondary"
                >
                  Chat
                </Link>
              ) : null}
            </div>
          </div>
        ))}
        {clients && clients.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-tertiary">No clients yet.</p>
        ) : null}
      </div>
    </div>
  );
}
