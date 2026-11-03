"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, Inbox01 as Inbox, PlayCircle, Send01 as Send } from "@untitledui/icons";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Toggle } from "@/components/base/toggle/toggle";
import { Card, CardContent } from "@/components/foundations/card/card";
import { TextArea } from "@/components/base/textarea/textarea";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Tabs } from "@/components/application/tabs/tabs";
import { Alert } from "@/components/foundations/alert/alert";
import { usePoll } from "../use-poll";

interface ConversationRow {
  id: string;
  aiPaused: boolean;
  customerName: string | null;
  phone: string | null;
  updatedAt: string;
  lastMessage: string | null;
  handoverReason: string | null;
}

export function ConversationsClient() {
  const { data, error, reload } = usePoll<{ conversations: ConversationRow[] }>("/api/dashboard/conversations");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function reply(event: FormEvent, id: string) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setActionError(null);
    const res = await fetch(`/api/dashboard/conversations/${id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res.ok) {
      setActionError(body?.error ?? "Couldn't send.");
      return;
    }
    setDraft("");
    await reload();
  }

  async function setPaused(id: string, paused: boolean) {
    setBusy(true);
    setActionError(null);
    const res = await fetch(`/api/dashboard/conversations/${id}/${paused ? "pause" : "resume"}`, { method: "POST" });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res.ok) setActionError(body?.error ?? "Couldn't resume.");
    await reload();
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      const open = new URLSearchParams(window.location.search).get("open");
      if (open) setOpenId(open);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const rows = data?.conversations ?? [];
  const pausedCount = rows.filter((r) => r.aiPaused).length;
  const [tab, setTab] = useState("all");
  const visibleRows =
    tab === "paused" ? rows.filter((r) => r.aiPaused) : tab === "active" ? rows.filter((r) => !r.aiPaused) : rows;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">
            Human Handover
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
            Inbox
          </h1>
          <p className="mt-0.5 text-sm text-tertiary">
            Take over when the agent is paused.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge color={pausedCount > 0 ? "warning" : "gray"} className="font-mono tabular-nums">
            {pausedCount} paused
          </Badge>
          <Badge color="gray" className="font-mono tabular-nums">
            {rows.length} total
          </Badge>
        </div>
      </div>

      {error ? (
        <Alert color="error">{error}</Alert>
      ) : null}
      {actionError ? (
        <Alert color="error">{actionError}</Alert>
      ) : null}

      {data && rows.length === 0 ? (
        <div className="rounded-xl bg-primary py-12 shadow-xs ring-1 ring-secondary">
          <EmptyState size="md">
            <EmptyState.Header>
              <EmptyState.FeaturedIcon color="gray" icon={Inbox} />
            </EmptyState.Header>
            <EmptyState.Content>
              <EmptyState.Title>No conversations</EmptyState.Title>
              <EmptyState.Description>
                Active and handed-over WhatsApp conversations will appear here.
              </EmptyState.Description>
            </EmptyState.Content>
          </EmptyState>
        </div>
      ) : null}

      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key))}>
        <Tabs.List type="button-brand" aria-label="Filter conversations">
          <Tabs.Item id="all">All</Tabs.Item>
          <Tabs.Item id="paused">AI paused</Tabs.Item>
          <Tabs.Item id="active">AI on</Tabs.Item>
        </Tabs.List>
      </Tabs>

      <div className="flex flex-col gap-3">
        {visibleRows.map((row) => {
          const isOpen = openId === row.id;
          return (
            <Card
              key={row.id}
              className={
                row.aiPaused
                  ? "ring-utility-yellow-200 bg-primary shadow-xs"
                  : ""
              }
            >
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    color="tertiary"
                    size="sm"
                    onClick={() => setOpenId(isOpen ? null : row.id)}
                    aria-expanded={isOpen}
                    iconLeading={
                      <Avatar
                        size="sm"
                        initials={(row.customerName ?? "B")
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")
                          .toUpperCase()}
                        alt={row.customerName ?? "Buyer"}
                      />
                    }
                  >
                    {row.customerName ?? "Buyer"}
                    <span className="ml-2 font-mono text-xs font-normal tabular-nums text-tertiary">
                      {row.phone}
                    </span>
                  </Button>
                  <div className="flex items-center gap-2">
                    {row.aiPaused ? (
                      <Badge color="error">AI paused</Badge>
                    ) : (
                      <Badge color="success">AI on</Badge>
                    )}
                    <Toggle
                      size="sm"
                      aria-label={`AI agent for ${row.customerName ?? "buyer"}`}
                      isSelected={!row.aiPaused}
                      isDisabled={busy}
                      onChange={(selected) => {
                        void setPaused(row.id, !selected);
                      }}
                    />
                  </div>
                </div>

                {row.handoverReason ? (
                  <div className="flex items-center gap-2 rounded-xl border border-utility-yellow-200 bg-warning-primary/70 px-3 py-1.5 text-xs text-warning-primary">
                    <AlertCircle className="size-3.5 shrink-0" />
                    <span>Reason: {row.handoverReason}</span>
                  </div>
                ) : null}

                {row.lastMessage ? (
                  <p className="rounded-xl bg-tertiary/55 px-3 py-2 text-sm text-tertiary" dir="auto">
                    {row.lastMessage}
                  </p>
                ) : null}

                {isOpen ? (
                  <form className="flex flex-col gap-2.5 pt-1" onSubmit={(event) => void reply(event, row.id)}>
                    <TextArea
                      value={draft}
                      onChange={setDraft}
                      rows={3}
                      placeholder="Write to the buyer…"
                      dir="auto"
                      aria-label="Write to the buyer"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" isDisabled={busy}>
                        <Send className="size-3.5" />
                        Send
                      </Button>
                      {row.aiPaused ? (
                        <Button
                          type="button"
                          color="secondary"
                          isDisabled={busy}
                          onClick={() => void setPaused(row.id, false)}
                        >
                          <PlayCircle className="size-3.5" />
                          Resume the agent
                        </Button>
                      ) : null}
                    </div>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
