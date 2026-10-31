"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ImagePlus,
  MapPin,
  Mic,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { blobToBase64, fileToBase64, WavRecorder } from "@/lib/media/wav-recorder";
import { getPersona, PERSONAS, type PersonaId } from "@/lib/sim/personas";

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
    traceSub: "Pipeline déterministe · Meta Model API + Baseten",
    aiActive: "IA active",
    aiPaused: "IA en pause",
    slots: "Informations comprises",
    emptyTrace: "Envoyez un message: chaque étape IA apparaîtra ici avec son modèle, son fournisseur et sa latence.",
    remove: "Retirer",
    imageAttached: "Image jointe — vous pouvez encore ajouter un vocal.",
    voiceAttached: "Vocal joint — vous pouvez encore ajouter une image.",
    recordVoice: "Enregistrer un vocal",
    stageVoice: "Joindre le vocal",
    cancelVoice: "Annuler le vocal",
    recordingHint: "Parlez, puis joignez",
    micDenied: "Micro bloqué. Autorisez-le dans le navigateur, puis réessayez.",
    tooShort: "Vocal trop court. Parlez un peu plus longtemps.",
    recordFailed: "Enregistrement impossible. Réessayez.",
    confirmPin: "Confirmer ma position",
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
    traceSub: "Deterministic pipeline · Meta Model API + Baseten",
    aiActive: "AI active",
    aiPaused: "AI paused",
    slots: "Understood so far",
    emptyTrace: "Send a message: every AI step will appear here with its model, provider and latency.",
    remove: "Remove",
    imageAttached: "Photo attached — you can still add a voice note.",
    voiceAttached: "Voice note attached — you can still add a photo.",
    recordVoice: "Record a voice note",
    stageVoice: "Attach voice note",
    cancelVoice: "Discard voice note",
    recordingHint: "Speak, then attach",
    micDenied: "Microphone blocked. Allow it in the browser, then try again.",
    tooShort: "Voice note too short. Speak a little longer.",
    recordFailed: "Couldn't record. Try again.",
    confirmPin: "Confirm my location",
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

interface PendingVoice {
  blob: Blob;
  url: string;
  seconds: number;
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function SimulatorClient({ initialConversationId = null }: { initialConversationId?: string | null }) {
  const [lang, setLang] = useState<Lang>("en");
  const t = T[lang];
  const [persona, setPersona] = useState<PersonaId>("new");
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [events, setEvents] = useState<TraceEventRow[]>([]);
  const [slots, setSlots] = useState<Record<string, unknown>>({});
  const [aiPaused, setAiPaused] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [pendingVoice, setPendingVoice] = useState<PendingVoice | null>(null);
  const pendingVoiceUrl = useRef<string | null>(null);
  const [awaiting, setAwaiting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [arming, setArming] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const recorderRef = useRef<WavRecorder | null>(null);
  const armingRef = useRef(false);
  const recordGen = useRef(0);
  const startedAt = useRef(0);
  const lastOutCount = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const activePersona = getPersona(persona);

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
    const timer = setInterval(() => void refresh(), 400);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [conversationId, refresh]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, awaiting, pendingImage, pendingVoice, recording]);

  function setVoice(next: PendingVoice | null) {
    if (pendingVoiceUrl.current && pendingVoiceUrl.current !== next?.url) {
      URL.revokeObjectURL(pendingVoiceUrl.current);
    }
    pendingVoiceUrl.current = next?.url ?? null;
    setPendingVoice(next);
  }

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 200);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      if (pendingVoiceUrl.current) URL.revokeObjectURL(pendingVoiceUrl.current);
    };
  }, []);

  async function startConversation(nextPersona: PersonaId) {
    recordGen.current += 1;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    armingRef.current = false;
    setRecording(false);
    setArming(false);
    setStopping(false);
    setMicError(null);
    setPersona(nextPersona);
    setMessages([]);
    setEvents([]);
    setSlots({});
    setPendingImage(null);
    setVoice(null);
    setDraft("");
    lastOutCount.current = 0;
    const res = await postJson("/api/sim/conversations", { persona: nextPersona });
    if (res.ok) {
      const data = await res.json();
      setConversationId(data.conversationId);
    }
  }

  useEffect(() => {
    if (initialConversationId) return;
    const initial = setTimeout(() => void startConversation("new"), 0);
    return () => clearTimeout(initial);
    // Mount-only besides the deep link: startConversation closes over stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversationId]);

  async function send(payload: Record<string, unknown>) {
    if (!conversationId) return;
    if (payload.kind === "text" && typeof payload.body === "string") {
      setMessages((curr) => [
        ...curr,
        {
          id: `pending-${Date.now()}`,
          direction: "in",
          kind: "text",
          body: payload.body as string,
          created_at: new Date().toISOString(),
        },
      ]);
    }
    setAwaiting(true);
    await postJson("/api/messages", { conversationId, ...payload });
    void refresh();
  }

  /**
   * One tap sends everything staged: photo (typed text is its caption), then
   * the voice note. Both posts land inside the pipeline's debounce window.
   */
  async function sendCurrent() {
    if (!conversationId || recording || stopping) return;
    const body = draft.trim();
    const image = pendingImage;
    const voice = pendingVoice;
    if (!body && !image && !voice) return;

    setDraft("");
    setPendingImage(null);
    setVoice(null);
    setStopping(true);
    setMicError(null);
    try {
      if (image) {
        const mediaBase64 = await fileToBase64(image.file);
        const ext = image.file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const payload: Record<string, unknown> = {
          kind: "image",
          mediaBase64,
          mediaExt: ["png", "webp"].includes(ext) ? ext : "jpg",
        };
        if (body) payload.body = body;
        URL.revokeObjectURL(image.previewUrl);
        await send(payload);
      } else if (body) {
        await send({ kind: "text", body });
      }
      if (voice) {
        await send({ kind: "audio", mediaBase64: await blobToBase64(voice.blob), mediaExt: "wav" });
      }
    } finally {
      setStopping(false);
    }
  }

  function stageImage(file: File) {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  }

  function unstageImage() {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
  }

  function cancelRecording() {
    recordGen.current += 1;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRecording(false);
    setElapsed(0);
  }

  async function startRecording() {
    if (!conversationId || recording || stopping || armingRef.current) return;
    const gen = recordGen.current + 1;
    recordGen.current = gen;
    armingRef.current = true;
    setMicError(null);
    setArming(true);
    const recorder = new WavRecorder();
    recorderRef.current = recorder;
    try {
      await recorder.start();
      if (recordGen.current !== gen) {
        recorder.cancel();
        return;
      }
      startedAt.current = Date.now();
      setElapsed(0);
      setRecording(true);
    } catch {
      recorder.cancel();
      if (recorderRef.current === recorder) recorderRef.current = null;
      if (recordGen.current === gen) setMicError(t.micDenied);
      setRecording(false);
    } finally {
      if (recordGen.current === gen) {
        armingRef.current = false;
        setArming(false);
      }
    }
  }

  async function stopAndStage() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    const seconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    setRecording(false);
    setStopping(true);
    setMicError(null);
    try {
      const blob = await recorder?.stop();
      if (!blob) {
        setMicError(t.tooShort);
        return;
      }
      setVoice({ blob, url: URL.createObjectURL(blob), seconds });
    } catch {
      setMicError(t.recordFailed);
    } finally {
      setStopping(false);
      setElapsed(0);
    }
  }

  function renderMessage(message: SimMessage) {
    if (message.kind === "pin_link" && message.body) {
      try {
        const parsed = JSON.parse(message.body) as { text: string; url: string };
        return (
          <div className="flex flex-col gap-2.5">
            <span dir="auto" className="leading-relaxed">{parsed.text}</span>
            <a
              href={parsed.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-saffron px-3.5 py-1.5 text-xs font-semibold text-surface-ink shadow-2xs transition-transform duration-150 ease-[var(--ease-out)] hover:brightness-95 active:scale-[0.97]"
            >
              <MapPin className="size-3.5" />
              {t.confirmPin}
            </a>
          </div>
        );
      } catch {
        return <span dir="auto">{message.body}</span>;
      }
    }
    if (message.kind === "buttons" && message.body) {
      try {
        const parsed = JSON.parse(message.body) as { text: string; buttons: Array<{ id: string; title: string }> };
        return (
          <div className="flex flex-col gap-2.5">
            <span dir="auto" className="whitespace-pre-wrap leading-relaxed">{parsed.text}</span>
            <div className="flex flex-col gap-1.5 pt-0.5">
              {parsed.buttons.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => void send({ kind: "button", body: b.title })}
                  className={`h-9 cursor-pointer rounded-full px-3.5 text-xs font-semibold transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
                    b.id === "akked"
                      ? "bg-surface-ink text-white shadow-2xs hover:bg-surface-ink/90"
                      : "bg-muted/60 text-foreground ring-1 ring-border hover:bg-muted"
                  }`}
                >
                  {b.title}
                </button>
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
          <img
            src={message.mediaUrl}
            alt="buyer upload"
            className="max-h-64 w-auto max-w-[235px] rounded-xl border border-black/5 object-cover"
          />
        ) : null}
        {message.mediaUrl && message.kind === "audio" ? (
          <audio controls src={message.mediaUrl} className="w-[235px]" />
        ) : null}
        {message.body ? (
          <span dir="auto" className="whitespace-pre-wrap leading-relaxed">
            {message.body}
          </span>
        ) : null}
        <span
          className={`self-end font-mono text-[10px] leading-none tabular-nums ${
            message.direction === "in" ? "text-white/55" : "text-muted-foreground"
          }`}
        >
          {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    );
  }

  const hasComposerPayload = Boolean(draft.trim()) || Boolean(pendingImage) || Boolean(pendingVoice);
  const showSend = hasComposerPayload && !recording;
  const visibleSlots = Object.entries(slots).filter(([, v]) => v !== null && typeof v !== "object");

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[410px_1fr]">
      {/* Left Column: Buyer Phone Frame */}
      <div className="flex flex-col items-center gap-3.5">
        <div className="flex w-full max-w-[392px] items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{t.title}</h1>
            <p className="text-xs text-muted-foreground">Buyer preview · Live session</p>
          </div>
          <div className="flex rounded-full bg-card p-0.5 text-xs ring-1 ring-border shadow-2xs">
            {(["en", "fr"] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`cursor-pointer rounded-full px-3 py-1 font-medium uppercase transition-colors ${
                  lang === l ? "bg-surface-ink text-white" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Persona Switcher */}
        <div className="flex flex-wrap justify-center gap-1.5">
          {PERSONAS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={persona === p.id ? "default" : "outline"}
              onClick={() => void startConversation(p.id)}
            >
              {lang === "fr" ? p.label : p.labelEn}
            </Button>
          ))}
        </div>

        {/* Active Buyer Pill */}
        <div className="flex w-full max-w-[392px] items-center justify-between rounded-xl border border-border/80 bg-card/85 px-3 py-1.5 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <UserCheck className="size-3.5 text-brand-terracotta" />
            {activePersona.customerName}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {activePersona.phone}
          </span>
        </div>

        {/* Mobile Device Frame */}
        <div className="w-full max-w-[392px] overflow-hidden rounded-[34px] border-[5px] border-surface-ink bg-chat-pattern shadow-[var(--shadow-elevated)]">
          {/* Top Speaker Notch Bar */}
          <div className="flex items-center justify-center bg-surface-ink pt-1.5 pb-0.5">
            <div className="h-1 w-12 rounded-full bg-white/20" />
          </div>

          {/* WhatsApp Header */}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-surface-ink px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-saffron text-sm font-bold text-surface-ink shadow-xs">
                W
              </div>
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">{t.shop}</span>
                  <ShieldCheck className="size-3.5 shrink-0 text-brand-saffron" />
                </div>
                <span className="flex items-center gap-1.5 text-[11px] text-white/75">
                  <span className={`size-1.5 rounded-full ${aiPaused ? "bg-amber-300" : "bg-emerald-400"}`} />
                  {aiPaused ? t.sellerOnline : awaiting ? t.typing : t.online}
                </span>
              </div>
            </div>
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/80">
              Derja AI
            </span>
          </div>

          {/* Messages Stream */}
          <div
            ref={scrollRef}
            className="flex h-[min(28rem,calc(100dvh-19rem))] flex-col gap-2.5 overflow-y-auto scroll-smooth px-3.5 py-4"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] px-3.5 py-2.5 text-sm shadow-2xs ${
                  m.direction === "in"
                    ? "self-end rounded-2xl rounded-br-xs bg-surface-ink text-white"
                    : "self-start rounded-2xl rounded-bl-xs bg-card text-foreground ring-1 ring-border/90"
                }`}
              >
                {renderMessage(m)}
              </div>
            ))}
            {awaiting && !aiPaused ? (
              <div className="self-start rounded-2xl rounded-bl-xs bg-card px-3.5 py-2.5 ring-1 ring-border/90 shadow-2xs">
                <span className="flex gap-1">
                  <span className="size-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:0ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:120ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:240ms]" />
                </span>
              </div>
            ) : null}
          </div>

          {/* Staged Photo Preview */}
          {pendingImage ? (
            <div className="mx-2.5 mb-1.5 flex items-center gap-3 rounded-2xl bg-card p-2 ring-1 ring-border shadow-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pendingImage.previewUrl}
                alt={pendingImage.file.name}
                className="size-14 rounded-xl border border-border object-cover"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-semibold text-foreground">{pendingImage.file.name}</span>
                <span className="text-[11px] text-muted-foreground">{t.imageAttached}</span>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t.remove}
                onClick={unstageImage}
                className="shrink-0"
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : null}

          {/* Staged Voice Note Preview */}
          {pendingVoice ? (
            <div className="mx-2.5 mb-1.5 flex items-center gap-2 rounded-2xl bg-card p-2 ring-1 ring-border shadow-xs">
              <div className="flex min-w-0 flex-1 flex-col">
                <audio controls src={pendingVoice.url} className="h-8 w-full" />
                <span className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">
                  {formatElapsed(pendingVoice.seconds)} · {t.voiceAttached}
                </span>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t.cancelVoice}
                onClick={() => setVoice(null)}
                className="shrink-0"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ) : null}

          {micError ? (
            <p className="px-3 pt-1.5 text-center text-[11px] font-medium text-status-danger-fg">{micError}</p>
          ) : null}

          {/* Composer Bar */}
          <div className="flex items-end gap-1.5 border-t border-border/80 bg-[#eee8dc] px-2.5 py-2.5">
            <div className="flex flex-1 items-center rounded-full bg-card px-2 ring-1 ring-border/70 shadow-2xs">
              <label
                className={`rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
                  stopping ? "pointer-events-none opacity-40" : "cursor-pointer"
                }`}
                title="Image"
              >
                <ImagePlus className="size-5" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-label="Attach image"
                  disabled={stopping}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) stageImage(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {recording ? (
                <div className="flex h-10 min-w-0 flex-1 items-center gap-2 px-1">
                  <span className="relative flex size-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-red-600" />
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {formatElapsed(elapsed)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {t.recordingHint}
                  </span>
                  <button
                    type="button"
                    onClick={cancelRecording}
                    aria-label={t.cancelVoice}
                    className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ) : (
                <Input
                  value={draft}
                  disabled={!conversationId || stopping}
                  onChange={(e) => {
                    setMicError(null);
                    setDraft(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void sendCurrent();
                  }}
                  placeholder={pendingImage ? t.captionPlaceholder : t.placeholder}
                  className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0"
                  dir="auto"
                />
              )}
              {hasComposerPayload && !recording ? (
                <button
                  type="button"
                  aria-label={t.recordVoice}
                  title={t.recordVoice}
                  disabled={!conversationId || stopping || arming}
                  onClick={() => void startRecording()}
                  className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                >
                  <Mic className="size-5" />
                </button>
              ) : null}
            </div>
            <Button
              size="icon"
              disabled={!conversationId || stopping || arming}
              onClick={() => {
                if (recording) void stopAndStage();
                else if (showSend) void sendCurrent();
                else void startRecording();
              }}
              className="size-10.5 shrink-0 rounded-full bg-surface-ink text-white hover:bg-surface-ink/90"
              aria-label={recording ? t.stageVoice : showSend ? "Send" : t.recordVoice}
              title={recording ? t.stageVoice : showSend ? "Send" : t.recordVoice}
            >
              {recording ? (
                <Square className="size-4.5" />
              ) : showSend ? (
                <Send className="size-4.5 text-brand-saffron" />
              ) : (
                <Mic className="size-5" />
              )}
            </Button>
          </div>
        </div>
        <p className="max-w-[360px] text-center text-xs text-muted-foreground">{t.subtitle}</p>
      </div>

      {/* Right Column: Behind the Scenes AI Telemetry */}
      <Card className="h-fit lg:sticky lg:top-22">
        <CardHeader className="border-b border-border/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-4 text-brand-terracotta" />
                {t.traceTitle}
              </CardTitle>
              <CardDescription className="mt-0.5">{t.traceSub}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {aiPaused ? (
                <Badge variant="destructive">{t.aiPaused}</Badge>
              ) : (
                <Badge variant="success">{t.aiActive}</Badge>
              )}
              <Badge variant="outline" className="font-mono tabular-nums">
                {events.length} events
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {visibleSlots.length > 0 ? (
            <div className="rounded-xl border border-border/80 bg-muted/45 p-3">
              <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {t.slots}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {visibleSlots.map(([k, v]) => (
                  <Badge key={k} variant="outline" className="bg-card font-mono text-[11px]">
                    {k}: {String(v)}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex max-h-[580px] flex-col gap-2.5 overflow-y-auto pr-1">
            {events.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">{t.emptyTrace}</p>
              </div>
            ) : null}
            {events.map((event) => (
              <div
                key={event.id}
                className={`rounded-xl border border-border/80 border-l-4 px-3.5 py-2.5 text-xs shadow-2xs ${
                  event.ok
                    ? "border-l-emerald-600 bg-card"
                    : "border-l-red-600 bg-status-danger-bg/50"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={event.ok ? "info" : "destructive"} className="font-mono">
                    {event.kind}
                  </Badge>
                  {event.provider ? (
                    <span className="font-mono text-[11px] font-medium text-foreground">
                      {event.provider}/{event.model}
                    </span>
                  ) : null}
                  {event.latency_ms !== null ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {event.latency_ms}ms
                    </span>
                  ) : null}
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
                    {new Date(event.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>
                {event.kind === "asr.transcript" ? (
                  <p className="mt-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-foreground" dir="auto">
                    {String((event.detail as { transcript?: string }).transcript ?? "")}
                  </p>
                ) : null}
                {event.kind === "understand" ? (
                  <pre className="mt-2 max-h-44 overflow-auto rounded-lg bg-muted/65 p-2.5 font-mono text-[10px] leading-relaxed">
                    {JSON.stringify((event.detail as { understanding?: unknown }).understanding, null, 2)}
                  </pre>
                ) : null}
                {event.kind.startsWith("vision.") && event.kind !== "vision.pending" ? (
                  <pre className="mt-2 max-h-44 overflow-auto rounded-lg bg-muted/65 p-2.5 font-mono text-[10px] leading-relaxed">
                    {JSON.stringify(event.detail, null, 2)}
                  </pre>
                ) : null}
                {event.kind === "reply.sent" ? (
                  <p className="mt-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-foreground" dir="auto">
                    {String((event.detail as { reply?: string }).reply ?? "")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
