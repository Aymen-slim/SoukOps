"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileAudio, ImagePlus, Mic, Send, Square, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { blobToBase64, fileToBase64, WavRecorder } from "@/lib/media/wav-recorder";
import { PERSONAS, type PersonaId } from "@/lib/sim/personas";

type Lang = "fr" | "en";

const T = {
  fr: {
    title: "Simulateur WhatsApp",
    subtitle: "Chaque persona crée une nouvelle conversation avec la boutique démo.",
    shop: "Boutique démo",
    online: "en ligne",
    typing: "écrit...",
    sellerOnline: "vendeur en ligne (IA en pause)",
    placeholder: "Message...",
    captionPlaceholder: "Ajouter un texte à l'image...",
    traceTitle: "Behind the scenes",
    aiActive: "IA active",
    aiPaused: "IA en pause",
    slots: "Informations comprises",
    emptyTrace: "Envoyez un message: chaque étape IA apparaîtra ici avec son modèle, son fournisseur et sa latence.",
    remove: "Retirer",
    imageAttached: "Image jointe — écrivez votre texte, puis envoyez.",
  },
  en: {
    title: "WhatsApp Simulator",
    subtitle: "Each persona starts a new conversation with the demo shop.",
    shop: "Demo Shop",
    online: "online",
    typing: "typing...",
    sellerOnline: "seller online (AI paused)",
    placeholder: "Message...",
    captionPlaceholder: "Add text to the image...",
    traceTitle: "Behind the scenes",
    aiActive: "AI active",
    aiPaused: "AI paused",
    slots: "Understood so far",
    emptyTrace: "Send a message: every AI step will appear here with its model, provider and latency.",
    remove: "Remove",
    imageAttached: "Image attached — write your text, then send.",
  },
} as const;

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

interface PendingImage {
  file: File;
  previewUrl: string;
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export default function SimulatorClient() {
  const [lang, setLang] = useState<Lang>("fr");
  const t = T[lang];
  const [persona, setPersona] = useState<PersonaId>("new");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [events, setEvents] = useState<TraceEventRow[]>([]);
  const [slots, setSlots] = useState<Record<string, unknown>>({});
  const [aiPaused, setAiPaused] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [awaiting, setAwaiting] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<WavRecorder | null>(null);
  const lastOutCount = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, awaiting, pendingImage]);

  async function startConversation(nextPersona: PersonaId) {
    setPersona(nextPersona);
    setMessages([]);
    setEvents([]);
    setSlots({});
    setPendingImage(null);
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

  /** Sends the staged image (with the typed caption) or a plain text message. */
  async function sendCurrent() {
    const body = draft.trim();
    if (pendingImage) {
      const mediaBase64 = await fileToBase64(pendingImage.file);
      const ext = pendingImage.file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const payload: Record<string, unknown> = {
        kind: "image",
        mediaBase64,
        mediaExt: ["png", "webp"].includes(ext) ? ext : "jpg",
      };
      if (body) payload.body = body;
      URL.revokeObjectURL(pendingImage.previewUrl);
      setPendingImage(null);
      setDraft("");
      await send(payload);
      return;
    }
    if (!body) return;
    setDraft("");
    await send({ kind: "text", body });
  }

  function stageImage(file: File) {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  }

  function unstageImage() {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
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
    if (message.kind === "buttons" && message.body) {
      try {
        const parsed = JSON.parse(message.body) as { text: string; buttons: Array<{ id: string; title: string }> };
        return (
          <div className="flex flex-col gap-2">
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
      <div className="flex flex-col gap-1.5">
        {message.mediaUrl && message.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={message.mediaUrl} alt="buyer upload" className="max-h-64 w-auto max-w-[230px] rounded-md object-cover" />
        ) : null}
        {message.mediaUrl && message.kind === "audio" ? <audio controls src={message.mediaUrl} className="w-[230px]" /> : null}
        {message.body ? <span dir="auto" className="whitespace-pre-wrap">{message.body}</span> : null}
        <span className="self-end text-[10px] leading-none text-zinc-500">
          {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    );
  }

  const canSend = Boolean(conversationId) && (Boolean(draft.trim()) || Boolean(pendingImage));

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[400px_1fr]">
      <div className="flex flex-col items-center gap-4">
        <div className="flex w-full max-w-[360px] items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{t.title}</h1>
            <p className="text-xs text-muted-foreground">Wassalha</p>
          </div>
          <div className="flex overflow-hidden rounded-full border">
            {(["fr", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-3 py-1 text-xs font-semibold uppercase ${lang === l ? "bg-emerald-700 text-white" : "bg-white text-zinc-600"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {PERSONAS.map((p) => (
            <Button key={p.id} size="sm" variant={persona === p.id ? "default" : "outline"} onClick={() => void startConversation(p.id)}>
              {lang === "fr" ? p.label : p.labelEn}
            </Button>
          ))}
        </div>

        <div className="w-[360px] overflow-hidden rounded-[30px] border border-zinc-300 bg-[#ece5dd] shadow-2xl ring-1 ring-black/5">
          <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-800">B</div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{t.shop}</span>
              <span className="text-[11px] text-emerald-100/90">{aiPaused ? t.sellerOnline : awaiting ? t.typing : t.online}</span>
            </div>
          </div>

          <div ref={scrollRef} className="flex h-[440px] flex-col gap-2 overflow-y-auto scroll-smooth px-3 py-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[82%] rounded-xl px-3 py-2 text-sm shadow-sm ${
                  m.direction === "in" ? "self-end rounded-tr-sm bg-[#dcf8c6]" : "self-start rounded-tl-sm bg-white"
                }`}
              >
                {renderMessage(m)}
              </div>
            ))}
            {awaiting && !aiPaused ? (
              <div className="self-start rounded-xl rounded-tl-sm bg-white px-3 py-2 shadow-sm">
                <span className="animate-pulse text-sm tracking-widest">•••</span>
              </div>
            ) : null}
          </div>

          {pendingImage ? (
            <div className="mx-2 mb-1 flex items-center gap-3 rounded-xl bg-white p-2 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pendingImage.previewUrl} alt={pendingImage.file.name} className="h-14 w-14 rounded-lg object-cover" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-medium">{pendingImage.file.name}</span>
                <span className="text-[11px] text-muted-foreground">{t.imageAttached}</span>
              </div>
              <Button size="icon" variant="ghost" aria-label={t.remove} onClick={unstageImage} className="h-8 w-8 shrink-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : null}

          <div className="flex items-end gap-1.5 bg-[#f0f0f0] px-2 py-2">
            <div className="flex flex-1 items-center rounded-full bg-white px-2 shadow-sm">
              <label className="cursor-pointer rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-emerald-700" title="Image">
                <ImagePlus className="h-5 w-5" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-label="Attach image"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) stageImage(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="cursor-pointer rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-emerald-700" title="WAV">
                <FileAudio className="h-5 w-5" />
                <input
                  type="file"
                  accept=".wav,audio/wav"
                  className="hidden"
                  aria-label="Attach WAV"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void sendAudioFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <Input
                value={draft}
                disabled={!conversationId}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendCurrent();
                }}
                placeholder={pendingImage ? t.captionPlaceholder : t.placeholder}
                className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0"
                dir="auto"
              />
            </div>
            <Button
              size="icon"
              disabled={!canSend && !recording}
              onClick={() => (pendingImage || draft.trim() ? void sendCurrent() : void toggleRecording())}
              className="h-11 w-11 shrink-0 rounded-full bg-[#00a884] shadow hover:bg-[#06cf9c]"
              aria-label={pendingImage || draft.trim() ? "Send" : "Record voice"}
            >
              {pendingImage || draft.trim() ? <Send className="h-5 w-5" /> : recording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        <p className="max-w-[360px] text-center text-xs text-muted-foreground">{t.subtitle}</p>
      </div>

      <Card className="h-fit lg:sticky lg:top-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t.traceTitle}
            {aiPaused ? <Badge variant="destructive">{t.aiPaused}</Badge> : <Badge variant="secondary">{t.aiActive}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Object.keys(slots).length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t.slots}</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(slots)
                  .filter(([, v]) => v !== null && typeof v !== "object")
                  .map(([k, v]) => (
                    <Badge key={k} variant="outline">{k}: {String(v)}</Badge>
                  ))}
              </div>
            </div>
          ) : null}
          <div className="flex max-h-[580px] flex-col gap-2 overflow-y-auto pr-1">
            {events.length === 0 ? <p className="text-sm text-muted-foreground">{t.emptyTrace}</p> : null}
            {events.map((event) => (
              <div key={event.id} className={`rounded-lg border-l-4 px-3 py-2 text-xs ${event.ok ? "border-l-emerald-600 bg-white" : "border-l-red-500 bg-red-50"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={event.ok ? "default" : "destructive"}>{event.kind}</Badge>
                  {event.provider ? <span className="font-medium">{event.provider}/{event.model}</span> : null}
                  {event.latency_ms !== null ? <span className="text-muted-foreground">{event.latency_ms}ms</span> : null}
                  <span className="ml-auto text-muted-foreground">{new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                </div>
                {event.kind === "asr.transcript" ? (
                  <p className="mt-1.5" dir="auto">{String((event.detail as { transcript?: string }).transcript ?? "")}</p>
                ) : null}
                {event.kind === "understand" ? (
                  <pre className="mt-1.5 max-h-44 overflow-auto rounded bg-muted p-2 text-[10px]">
                    {JSON.stringify((event.detail as { understanding?: unknown }).understanding, null, 2)}
                  </pre>
                ) : null}
                {event.kind === "reply.sent" ? <p className="mt-1.5" dir="auto">{String((event.detail as { reply?: string }).reply ?? "")}</p> : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
