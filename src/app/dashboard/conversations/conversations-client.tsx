"use client";

import { FormEvent, useState } from "react";
import { AlertCircle, Inbox, MessageSquareReply, PlayCircle, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

  async function resume(id: string) {
    setBusy(true);
    setActionError(null);
    const res = await fetch(`/api/dashboard/conversations/${id}/resume`, { method: "POST" });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res.ok) setActionError(body?.error ?? "Couldn't resume.");
    await reload();
  }

  const rows = data?.conversations ?? [];
  const pausedCount = rows.filter((r) => r.aiPaused).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-terracotta uppercase">
            Human Handover
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Inbox
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Take over when the agent is paused.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={pausedCount > 0 ? "warning" : "outline"} className="font-mono tabular-nums">
            {pausedCount} paused
          </Badge>
          <Badge variant="outline" className="font-mono tabular-nums">
            {rows.length} total
          </Badge>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-fg">
          {error}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="rounded-xl border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-fg">
          {actionError}
        </p>
      ) : null}

      {data && rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Inbox className="size-8 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">No conversations.</p>
            <p className="text-xs text-muted-foreground">
              Active and handed-over WhatsApp conversations will appear here.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const isOpen = openId === row.id;
          return (
            <Card
              key={row.id}
              className={
                row.aiPaused
                  ? "ring-status-warning-border bg-card shadow-xs"
                  : ""
              }
            >
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="flex cursor-pointer items-center gap-2 text-left text-base font-semibold text-foreground hover:text-brand-terracotta"
                    onClick={() => setOpenId(isOpen ? null : row.id)}
                  >
                    <MessageSquareReply className="size-4 text-brand-terracotta" />
                    <span>{row.customerName ?? "Buyer"}</span>
                    <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
                      {row.phone}
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    {row.aiPaused ? (
                      <Badge variant="destructive">AI paused</Badge>
                    ) : (
                      <Badge variant="success">AI on</Badge>
                    )}
                  </div>
                </div>

                {row.handoverReason ? (
                  <div className="flex items-center gap-2 rounded-xl border border-status-warning-border bg-status-warning-bg/70 px-3 py-1.5 text-xs text-status-warning-fg">
                    <AlertCircle className="size-3.5 shrink-0" />
                    <span>Reason: {row.handoverReason}</span>
                  </div>
                ) : null}

                {row.lastMessage ? (
                  <p className="rounded-xl bg-muted/55 px-3 py-2 text-sm text-muted-foreground" dir="auto">
                    {row.lastMessage}
                  </p>
                ) : null}

                {isOpen ? (
                  <form className="flex flex-col gap-2.5 pt-1" onSubmit={(event) => void reply(event, row.id)}>
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm shadow-2xs outline-none transition-[border-color,box-shadow] focus-visible:border-foreground/45 focus-visible:ring-3 focus-visible:ring-ring/25"
                      placeholder="Write to the buyer…"
                      dir="auto"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={busy}>
                        <Send className="size-3.5" />
                        Send
                      </Button>
                      {row.aiPaused ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void resume(row.id)}
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
