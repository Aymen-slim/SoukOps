"use client";

import { FormEvent, useState } from "react";
import { AlertCircle, Inbox01 as Inbox, MessageChatSquare as MessageSquareReply, PlayCircle, Send01 as Send } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Card, CardContent } from "@/components/foundations/card/card";
import { TextArea } from "@/components/base/textarea/textarea";
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
        <p role="alert" className="rounded-xl border border-utility-red-200 bg-error-primary px-4 py-2.5 text-sm text-error-primary">
          {error}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="rounded-xl border border-utility-red-200 bg-error-primary px-4 py-2.5 text-sm text-error-primary">
          {actionError}
        </p>
      ) : null}

      {data && rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Inbox className="size-8 text-tertiary/60" />
            <p className="text-sm font-medium text-primary">No conversations.</p>
            <p className="text-xs text-tertiary">
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
                  ? "ring-utility-yellow-200 bg-primary shadow-xs"
                  : ""
              }
            >
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="flex cursor-pointer items-center gap-2 text-left text-base font-semibold text-primary hover:text-brand-secondary"
                    onClick={() => setOpenId(isOpen ? null : row.id)}
                  >
                    <MessageSquareReply className="size-4 text-brand-secondary" />
                    <span>{row.customerName ?? "Buyer"}</span>
                    <span className="font-mono text-xs font-normal tabular-nums text-tertiary">
                      {row.phone}
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    {row.aiPaused ? (
                      <Badge color="error">AI paused</Badge>
                    ) : (
                      <Badge color="success">AI on</Badge>
                    )}
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
