"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { blobToBase64, fileToBase64, WavRecorder } from "@/lib/media/wav-recorder";
import { PERSONAS, type PersonaId } from "@/lib/sim/personas";

interface SimMessage {
  id: string;
  direction: "in" | "out";
  kind: string;
  body: string | null;
  mediaUrl?: string | null;
  created_at: string;
}

interface TraceEventRow {
  id: string;
  kind: string;
  model: string | null;
  provider: string | null;
  latency_ms: number | null;
  ok: boolean;
  detail: Record<string, unknown>;
  created_at: string;
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export default function SimulatorClient() {
  const [persona, setPersona] = useState<PersonaId>("new");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [events, setEvents] = useState<TraceEventRow[]>([]);
  const [slots, setSlots] = useState<Record<string, unknown>>({});
  const [aiPaused, setAiPaused] = useState(false);
  const [draft, setDraft] = useState("");
  const [awaiting, setAwaiting] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<WavRecorder | null>(null);
  const lastOutCount = useRef(0);

  const refresh = useCallback(async () => {
    if (!conversationId) return;
    const [msgRes, traceRes] = await Promise.all([
      fetch(`/api/sim/conversations/${conversationId}/messages`),
      fetch(`/api/sim/conversations/${conversationId}/trace`),
    ]);
    if (msgRes.ok) {
      const data = await msgRes.json();
      setMessages(data.messages);
      setSlots(data.conversation.slots ?? {});
      setAiPaused(Boolean(data.conversation.ai_paused));
      const outCount = (data.messages as SimMessage[]).filter((m) => m.direction === "out").length;
      if (outCount > lastOutCount.current) {
        lastOutCount.current = outCount;
        setAwaiting(false);
      }
    }
    if (traceRes.ok) {
      const data = await traceRes.json();
      setEvents(data.events);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 1200);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [conversationId, refresh]);

  async function startConversation(nextPersona: PersonaId) {
    setPersona(nextPersona);
    setMessages([]);
    setEvents([]);
    setSlots({});
    lastOutCount.current = 0;
    const res = await postJson("/api/sim/conversations", { persona: nextPersona });
    if (res.ok) {
      const data = await res.json();
      setConversationId(data.conversationId);
    }
  }

  useEffect(() => {
    const initial = setTimeout(() => void startConversation("new"), 0);
    return () => clearTimeout(initial);
  }, []);

  async function send(payload: Record<string, unknown>) {
    if (!conversationId) return;
    setAwaiting(true);
    await postJson("/api/messages", { conversationId, ...payload });
    void refresh();
  }

  async function sendText() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    await send({ kind: "text", body });
  }

  async function sendImage(file: File) {
    const mediaBase64 = await fileToBase64(file);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    await send({ kind: "image", mediaBase64, mediaExt: ["png", "webp"].includes(ext) ? ext : "jpg" });
  }

  async function sendAudioFile(file: File) {
    const mediaBase64 = await fileToBase64(file);
    await send({ kind: "audio", mediaBase64, mediaExt: "wav" });
  }

  async function toggleRecording() {
    if (recording) {
      const blob = await recorderRef.current?.stop();
      setRecording(false);
      if (blob) await send({ kind: "audio", mediaBase64: await blobToBase64(blob), mediaExt: "wav" });
      return;
    }
    recorderRef.current = new WavRecorder();
    try {
      await recorderRef.current.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }

  function renderMessage(message: SimMessage) {
    const isBuyer = message.direction === "in";
    if (message.kind === "buttons" && message.body) {
      try {
        const parsed = JSON.parse(message.body) as { text: string; buttons: Array<{ id: string; title: string }> };
        return (
          <div className="flex flex-col gap-1">
            <span dir="auto">{parsed.text}</span>
            <div className="flex flex-wrap gap-1">
              {parsed.buttons.map((b) => (
                <Button key={b.id} size="sm" variant="secondary" onClick={() => void send({ kind: "button", body: b.title })}>
                  {b.title}
                </Button>
              ))}
            </div>
          </div>
        );
      } catch {
        return <span dir="auto">{message.body}</span>;
      }
    }
    return (
      <div className="flex flex-col gap-1">
        {message.mediaUrl && message.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={message.mediaUrl} alt="buyer upload" className="max-w-[220px] rounded" />
        ) : null}
        {message.mediaUrl && message.kind === "audio" ? <audio controls src={message.mediaUrl} className="max-w-[220px]" /> : null}
        {message.body ? <span dir="auto">{message.body}</span> : null}
        {isBuyer ? null : <span className="text-[10px] opacity-60">{new Date(message.created_at).toLocaleTimeString()}</span>}
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col items-center gap-3">
        <div className="flex flex-wrap justify-center gap-2">
          {PERSONAS.map((p) => (
            <Button key={p.id} size="sm" variant={persona === p.id ? "default" : "outline"} onClick={() => void startConversation(p.id)}>
              {p.label}
            </Button>
          ))}
        </div>

        <div className="w-[340px] rounded-[28px] border-8 border-zinc-900 bg-[#ece5dd] shadow-xl">
          <div className="flex items-center gap-2 rounded-t-[20px] bg-[#075e54] px-4 py-3 text-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold">B</div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Boutique démo</span>
              <span className="text-[11px] opacity-80">{aiPaused ? "vendeur en ligne (IA en pause)" : awaiting ? "écrit..." : "en ligne"}</span>
            </div>
          </div>

          <div className="flex h-[430px] flex-col gap-2 overflow-y-auto px-3 py-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                  m.direction === "in" ? "self-end bg-[#dcf8c6]" : "self-start bg-white"
                }`}
              >
                {renderMessage(m)}
              </div>
            ))}
            {awaiting && !aiPaused ? (
              <div className="self-start rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                <span className="animate-pulse">...</span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-1 rounded-b-[20px] bg-[#f0f0f0] px-2 py-2">
            <Input
              value={draft}
              disabled={!conversationId}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void sendText();
              }}
              placeholder="Message..."
              className="h-9 bg-white"
              dir="auto"
            />
            <Button size="sm" disabled={!conversationId} onClick={() => void sendText()}>➤</Button>
            <Button size="sm" variant={recording ? "destructive" : "outline"} onClick={() => void toggleRecording()}>
              {recording ? "■" : "🎙"}
            </Button>
            <label className="cursor-pointer rounded border px-2 py-1 text-xs">
              IMG
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void sendImage(f);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="cursor-pointer rounded border px-2 py-1 text-xs">
              WAV
              <input
                type="file"
                accept=".wav,audio/wav"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void sendAudioFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        <p className="max-w-[340px] text-center text-xs text-muted-foreground">
          Simulateur public — chaque persona crée une nouvelle conversation avec la boutique démo.
        </p>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Behind the scenes
            {aiPaused ? <Badge variant="destructive">IA en pause</Badge> : <Badge variant="secondary">IA active</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Object.keys(slots).length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {Object.entries(slots)
                .filter(([, v]) => v !== null && typeof v !== "object")
                .map(([k, v]) => (
                  <Badge key={k} variant="outline">{k}: {String(v)}</Badge>
                ))}
            </div>
          ) : null}
          <div className="flex max-h-[560px] flex-col gap-2 overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Envoyez un message: chaque étape IA apparaîtra ici avec son modèle, son fournisseur et sa latence.</p>
            ) : null}
            {events.map((event) => (
              <div key={event.id} className="rounded border px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={event.ok ? "default" : "destructive"}>{event.kind}</Badge>
                  {event.provider ? <span>{event.provider}/{event.model}</span> : null}
                  {event.latency_ms !== null ? <span className="text-muted-foreground">{event.latency_ms}ms</span> : null}
                  <span className="text-muted-foreground">{new Date(event.created_at).toLocaleTimeString()}</span>
                </div>
                {event.kind === "asr.transcript" ? (
                  <p className="mt-1" dir="auto">{String((event.detail as { transcript?: string }).transcript ?? "")}</p>
                ) : null}
                {event.kind === "understand" ? (
                  <pre className="mt-1 max-h-44 overflow-auto rounded bg-muted p-2 text-[10px]">
                    {JSON.stringify((event.detail as { understanding?: unknown }).understanding, null, 2)}
                  </pre>
                ) : null}
                {event.kind === "reply.sent" ? <p className="mt-1" dir="auto">{String((event.detail as { reply?: string }).reply ?? "")}</p> : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
