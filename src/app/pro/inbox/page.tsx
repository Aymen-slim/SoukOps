"use client";

import { useState } from "react";
import { Inbox01, PauseCircle, PlayCircle, Send01 } from "@untitledui/icons";
import { usePoll } from "@/app/dashboard/use-poll";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { TextArea } from "@/components/base/textarea/textarea";
import { Alert } from "@/components/foundations/alert/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import { formatMillimesForChat } from "@/lib/domain/pricing";

interface InboxConversationSummary {
  id: string;
  channel: string;
  aiPaused: boolean;
  clientName: string | null;
  phone: string | null;
  matchedServiceTitle: string | null;
  updatedAt: string;
  lastMessage: string | null;
  lastDirection: string | null;
  inquiry: {
    id: string;
    status: string;
    scopeSummary: string;
    budgetMillimes: number | null;
    requestedDate: string | null;
  } | null;
  unreadAlert: {
    id: string;
    severity: string;
    title: string;
  } | null;
}

interface InboxThreadDetail {
  conversation: {
    id: string;
    channel: string;
    ai_paused: boolean;
    slots: Record<string, unknown>;
    updated_at: string;
  };
  customer: { id: string; name: string | null; phone: string | null } | null;
  inquiry: {
    id: string;
    status: string;
    scope_summary: string;
    requested_date: string | null;
    location_text: string | null;
    budget_millimes: number | null;
  } | null;
  messages: Array<{
    id: string;
    direction: "in" | "out";
    kind: string;
    body: string | null;
    created_at: string;
  }>;
}

function renderMessageBody(kind: string, body: string | null): string {
  if (!body) return "(media attachment)";
  if (kind === "pin_link" || kind === "buttons") {
    try {
      const parsed = JSON.parse(body) as { text?: string; url?: string };
      return parsed.url ? `${parsed.text ?? "Location pin"} — ${parsed.url}` : (parsed.text ?? body);
    } catch {
      return body;
    }
  }
  return body;
}

export default function ProInboxPage() {
  const { data: listData, error: listErr, reload: reloadList } = usePoll<{
    conversations: InboxConversationSummary[];
  }>("/api/pro/inbox", 4_000);

  const conversations = listData?.conversations ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? conversations[0]?.id ?? null;

  const { data: thread, reload: reloadThread } = usePoll<InboxThreadDetail>(
    activeId ? `/api/pro/inbox?conversationId=${activeId}` : null,
    3_000,
  );

  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const activeSummary = conversations.find((c) => c.id === activeId) ?? null;
  const aiPaused = thread?.conversation.ai_paused ?? activeSummary?.aiPaused ?? false;

  async function sendReply() {
    if (!activeId || !replyText.trim()) return;
    setSending(true);
    setActionErr(null);
    try {
      const res = await fetch("/api/pro/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, action: "reply", text: replyText.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setActionErr(body?.error ?? "Could not send reply.");
        return;
      }
      setReplyText("");
      await Promise.all([reloadThread(), reloadList()]);
    } finally {
      setSending(false);
    }
  }

  async function toggleAiPause() {
    if (!activeId) return;
    setToggling(true);
    setActionErr(null);
    try {
      const res = await fetch("/api/pro/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeId,
          action: aiPaused ? "resume" : "pause",
        }),
      });
      if (res.ok) {
        await Promise.all([reloadThread(), reloadList()]);
      }
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-[#E4E4E7] pb-5">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#52525B]">
          Inbox &amp; Takeover
        </p>
        <h1 className="mt-1.5 text-2xl font-medium tracking-[-0.03em] text-[#09090B] sm:text-3xl">
          Style-Cloned DM Conversations
        </h1>
        <p className="mt-1 text-sm text-[#52525B]">
          Review live Derja, French, Arabic &amp; English conversations, inspect extracted client context, or step in anytime.
        </p>
      </div>

      {listErr ? <Alert color="error">{listErr}</Alert> : null}
      {actionErr ? <Alert color="error">{actionErr}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Conversation List */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Inbox01 className="size-4 text-brand-secondary" aria-hidden="true" />
                Threads
              </span>
              <span className="font-mono text-xs tabular-nums text-[#71717A]">
                {conversations.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-[#E4E4E7] p-0">
            {conversations.length === 0 ? (
              <p className="p-4 text-sm text-[#52525B]">
                No DM threads yet. Test a live conversation from the <strong>Live DM demo</strong> button in the sidebar.
              </p>
            ) : (
              conversations.map((conv) => {
                const selected = conv.id === activeId;
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setSelectedId(conv.id)}
                    className={`flex w-full cursor-pointer flex-col gap-1.5 px-4 py-3.5 text-left transition-colors ${
                      selected ? "bg-[#F4F4F5]" : "bg-white hover:bg-[#FAFAF9]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-[#09090B]">
                        {conv.clientName ?? conv.phone ?? "New Client"}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {conv.unreadAlert ? (
                          <Badge color="error" size="sm" className="font-mono text-[10px] uppercase">
                            {conv.unreadAlert.severity}
                          </Badge>
                        ) : null}
                        <Badge
                          color={conv.aiPaused ? "warning" : "brand"}
                          size="sm"
                          className="font-mono text-[10px] uppercase"
                        >
                          {conv.aiPaused ? "Paused" : "AI"}
                        </Badge>
                      </div>
                    </div>
                    {conv.matchedServiceTitle ? (
                      <p className="truncate font-mono text-[11px] text-[#15704C]">
                        {conv.matchedServiceTitle}
                      </p>
                    ) : null}
                    <p className="line-clamp-2 text-xs text-[#52525B]" dir="auto">
                      {conv.lastMessage ?? "No messages yet"}
                    </p>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Thread Detail + Context Card */}
        <Card className="flex min-h-[540px] flex-col">
          {!activeId ? (
            <CardContent className="flex flex-1 items-center justify-center p-8 text-sm text-[#52525B]">
              Select a conversation to view messages and client intake context.
            </CardContent>
          ) : (
            <>
              <CardHeader className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E4E4E7]">
                <div>
                  <CardTitle className="text-base">
                    {activeSummary?.clientName ?? thread?.customer?.name ?? "Client Thread"}
                  </CardTitle>
                  <CardDescription className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs">
                    <span>{activeSummary?.phone ?? thread?.customer?.phone ?? "No phone captured yet"}</span>
                    <span>·</span>
                    <span className="uppercase">{thread?.conversation.channel ?? activeSummary?.channel ?? "DM"}</span>
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  color={aiPaused ? "primary" : "secondary"}
                  iconLeading={aiPaused ? PlayCircle : PauseCircle}
                  isDisabled={toggling}
                  onClick={() => void toggleAiPause()}
                >
                  {aiPaused ? "Resume AI" : "Take Over (Pause AI)"}
                </Button>
              </CardHeader>

              {/* Extracted Client Context Strip */}
              {thread?.inquiry ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E4E7] bg-[#FAFAF9] px-5 py-3 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-[#09090B]">
                      {thread.inquiry.scope_summary}
                    </span>
                    {thread.inquiry.requested_date ? (
                      <span className="font-mono text-[#52525B]">
                        Date: {thread.inquiry.requested_date}
                      </span>
                    ) : null}
                    {thread.inquiry.location_text ? (
                      <span className="font-mono text-[#52525B]">
                        Location: {thread.inquiry.location_text}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {thread.inquiry.budget_millimes != null ? (
                      <span className="font-mono font-semibold tabular-nums text-[#15704C]">
                        {formatMillimesForChat(thread.inquiry.budget_millimes)}
                      </span>
                    ) : null}
                    <Badge color="gray" size="sm" className="font-mono text-[10px] uppercase">
                      {thread.inquiry.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </div>
              ) : null}

              {/* Message Feed */}
              <CardContent className="flex max-h-[380px] flex-1 flex-col gap-3 overflow-y-auto bg-[#FAFAF9] p-5">
                {(thread?.messages ?? []).map((msg) => {
                  const isClient = msg.direction === "in";
                  return (
                    <div
                      key={msg.id}
                      className={`max-w-[82%] border px-3.5 py-2.5 text-sm ${
                        isClient
                          ? "self-start border-[#E4E4E7] bg-white text-[#09090B]"
                          : "self-end border-[#1D1E1A] bg-[#1D1E1A] text-white"
                      }`}
                    >
                      <p dir="auto" className="whitespace-pre-wrap leading-relaxed">
                        {renderMessageBody(msg.kind, msg.body)}
                      </p>
                      <p
                        className={`mt-1.5 text-right font-mono text-[10px] tabular-nums ${
                          isClient ? "text-[#71717A]" : "text-white/70"
                        }`}
                      >
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  );
                })}
              </CardContent>

              {/* Direct Human Composer */}
              <div className="flex flex-col gap-2.5 border-t border-[#E4E4E7] bg-white p-4">
                <TextArea
                  label="Reply directly as yourself"
                  placeholder="Write a reply in Derja, French, Arabic, or English..."
                  rows={2}
                  value={replyText}
                  onChange={setReplyText}
                  textAreaClassName="dir-auto"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[#71717A]">
                    {aiPaused
                      ? "AI is paused on this thread — only your replies will be sent."
                      : "AI is active — pause AI above if you want full manual takeover."}
                  </span>
                  <Button
                    size="sm"
                    color="primary"
                    iconLeading={Send01}
                    isDisabled={sending || !replyText.trim()}
                    onClick={() => void sendReply()}
                  >
                    {sending ? "Sending…" : "Send Reply"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
