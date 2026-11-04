"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Attachment01 as Paperclip,
  Camera01 as Camera,
  Check,
  ChevronLeft,
  DotsVertical as MoreVertical,
  FaceSmile as Smile,
  Heart,
  ImagePlus,
  Lock01 as Lock,
  MarkerPin01 as MapPin,
  Microphone01 as Mic,
  Phone01 as Phone,
  Send01 as Send,
  ShieldTick as ShieldCheck,
  Stars01 as Sparkles,
  Square,
  Trash01 as Trash2,
  UserCheck01 as UserCheck,
  VideoRecorder as Video,
  X,
} from "@untitledui/icons";
import { InstagramIcon, MessengerIcon, WhatsAppIcon } from "@/components/brand-icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import { blobToBase64, fileToBase64, WavRecorder } from "@/lib/media/wav-recorder";
import { formatClock, isNearBottom, mediaExtFromMime, repairMojibake, sameMessages, stabilizeMediaUrls } from "@/lib/sim/chat-ui";
import { getPersona, PERSONAS, type PersonaId } from "@/lib/sim/personas";

export type DemoPlatform = "whatsapp" | "instagram" | "messenger";

const PLATFORM_META: Record<
  DemoPlatform,
  {
    label: string;
    shortTitle: string;
    channelTag: string;
    capabilityLine: string;
    onlineLabel: string;
    typingLabel: string;
    introNotice: string;
    askCta: string;
  }
> = {
  whatsapp: {
    label: "WhatsApp",
    shortTitle: "WhatsApp Business",
    channelTag: "Cloud API",
    capabilityLine: "Derja voice notes (Muse Voice ASR), native reply buttons & magic-link GPS door pin.",
    onlineLabel: "Business Account · online",
    typingLabel: "typing...",
    introNotice: "Messages with this business are answered by Wassalha AI. Prices are floor-locked.",
    askCta: "Ask on WhatsApp",
  },
  instagram: {
    label: "Instagram",
    shortTitle: "Instagram Direct",
    channelTag: "Stories + DM",
    capabilityLine: "Story reply screenshot matching (SAM 3.1 + PE-Core), DM quick pills & instant Derja checkout.",
    onlineLabel: "Active now · Instagram Shop",
    typingLabel: "typing...",
    introNotice: "Instagram Business · Replies instantly to Story screenshots & Derja DMs",
    askCta: "Reply to Story",
  },
  messenger: {
    label: "Messenger",
    shortTitle: "Facebook Messenger",
    channelTag: "Page Inbox",
    capabilityLine: "Facebook Page shop DMs, structured quick replies, landmark-to-GPS pin & COD waybill.",
    onlineLabel: "Active now on Messenger",
    typingLabel: "typing...",
    introNotice: "Typically replies instantly · Powered by Wassalha Meta AI",
    askCta: "Ask in Messenger",
  },
};

const QUICK_SCENARIOS = [
  {
    label: "1. Bargain in Derja",
    prompt: "Ghalia chwaya, na9esli nakhdhou tawa taille L",
  },
  {
    label: "2. Fuzzy landmark + floor",
    prompt: "Noskon fi Ennasr 2 wra 9ahwet Cosmitto, 2ème étage, tel 55 123 456",
  },
  {
    label: "3. Triangulate 2 spots",
    prompt: "Fi Tunis entre Pharmacie de Nuit El Manar et Campus El Manar, 98 333 444",
  },
] as const;

const t = {
  subtitle: "Switch platforms live or pick a buyer persona to test risk scoring & floor bargaining.",
  shop: "Demo Shop",
  sellerOnline: "seller online (AI paused)",
  placeholder: "Message...",
  captionPlaceholder: "Add text to the image...",
  traceTitle: "Behind the scenes",
  traceSub: "Deterministic pipeline · Meta Model API + Baseten",
  aiActive: "AI active",
  aiPaused: "AI paused",
  slots: "Understood so far",
  emptyTrace: "Send a message or tap a product / prompt chip: every AI step appears here with model, provider & latency.",
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

const WAVE_BARS = [10, 16, 22, 14, 24, 18, 12, 20, 26, 15, 21, 11, 17, 23, 13, 19, 25, 14, 10, 18];

/** WhatsApp-style voice note: stable <audio> (src set once per mount), play/pause + seekable waveform. */
function VoiceNotePlayer({ src, light }: { src: string; light?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const progress = duration > 0 ? current / duration : 0;

  return (
    <div className="flex w-[218px] items-center gap-2 py-0.5">
      <button
        type="button"
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (playing) audio.pause();
          else void audio.play().catch(() => setPlaying(false));
        }}
        className={`flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[13px] ${
          light ? "bg-white/25 text-white" : "bg-[#00A884] text-white"
        }`}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <button
          type="button"
          aria-label="Seek voice note"
          className="flex h-6 cursor-pointer items-center gap-[2px]"
          onClick={(e) => {
            const audio = audioRef.current;
            if (!audio || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            audio.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
          }}
        >
          {WAVE_BARS.map((h, i) => (
            <span
              key={i}
              style={{ height: `${h}px` }}
              className={`w-[3px] shrink-0 rounded-full ${i / WAVE_BARS.length <= progress ? (light ? "bg-white" : "bg-[#00A884]") : light ? "bg-white/45" : "bg-neutral-400/70"}`}
            />
          ))}
        </button>
        <span className={`text-[10px] tabular-nums ${light ? "text-white/85" : "text-neutral-500"}`}>
          {formatClock(playing || current > 0 ? current : duration)}
        </span>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onTimeUpdate={() => setCurrent(audioRef.current?.currentTime ?? 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
      />
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export interface DemoProductCard {
  id: string;
  name: string;
  category: string;
  priceMillimes: number;
  stock: number;
  imageUrl: string | null;
}

function formatPrice(millimes: number): string {
  const dinars = Math.floor(millimes / 1000);
  const rest = millimes % 1000;
  if (rest === 0) return `${dinars}DT`;
  return `${dinars},${String(rest).padEnd(3, "0")} DT`;
}

export default function SimulatorClient({
  initialConversationId = null,
  initialPlatform = "whatsapp",
  products = [],
  slug = null,
  shopName,
}: {
  initialConversationId?: string | null;
  initialPlatform?: DemoPlatform;
  products?: DemoProductCard[];
  slug?: string | null;
  shopName?: string;
}) {
  const [platform, setPlatform] = useState<DemoPlatform>(initialPlatform);
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
  const enteredName = typeof slots.customerName === "string" && slots.customerName.trim() ? slots.customerName.trim() : null;
  const enteredPhone = typeof slots.phone === "string" && slots.phone.trim() ? slots.phone.trim() : null;
  const shownName = enteredName ?? (slug ? "Your buyer" : activePersona.customerName);
  const shownPhone = enteredPhone ?? (slug ? "Saved from what you type" : activePersona.phone);
  const displayShopName = shopName ?? t.shop;
  const igHandle = `@${(slug ?? displayShopName).toLowerCase().replace(/[^a-z0-9]+/g, "")}.tn`;
  const meta = PLATFORM_META[platform];

  const refreshBusy = useRef(false);
  const mediaUrlCache = useRef(new Map<string, string>());
  const nearBottomRef = useRef(true);
  const refresh = useCallback(async () => {
    if (!conversationId) return;
    refreshBusy.current = true;
    try {
      const [msgRes, traceRes] = await Promise.all([
        fetch(`/api/sim/conversations/${conversationId}/messages`),
        fetch(`/api/sim/conversations/${conversationId}/trace`),
      ]);
      if (msgRes.ok) {
        const data = await msgRes.json();
        const stable = stabilizeMediaUrls(mediaUrlCache.current, data.messages as SimMessage[]);
        setMessages((curr) => (sameMessages(curr, stable) ? curr : stable));
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
    } finally {
      refreshBusy.current = false;
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    let timer = 0;
    let stop = false;
    const loop = () => {
      if (stop) return;
      const wait = document.hidden ? 2_000 : awaiting ? 600 : 1_500;
      timer = window.setTimeout(() => {
        if (!refreshBusy.current) void refresh();
        loop();
      }, wait);
    };
    const initial = window.setTimeout(() => void refresh(), 0);
    loop();
    return () => {
      stop = true;
      window.clearTimeout(initial);
      window.clearTimeout(timer);
    };
  }, [conversationId, refresh, awaiting]);

  // Follow new messages only when already near the bottom; never yank a
  // reader who scrolled up back down on the next poll.
  useEffect(() => {
    if (!nearBottomRef.current) return;
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
    mediaUrlCache.current.clear();
    nearBottomRef.current = true;
    setMessages([]);
    setEvents([]);
    setSlots({});
    setPendingImage(null);
    setVoice(null);
    setDraft("");
    lastOutCount.current = 0;
    const res = await postJson("/api/sim/conversations", { persona: nextPersona, slug });
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
    nearBottomRef.current = true;
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

  /** Tapping a product sends its real photo + caption, like forwarding the shop photo in chat. */
  async function askAboutProduct(product: DemoProductCard) {
    if (!conversationId || recording || stopping) return;
    const text =
      platform === "instagram"
        ? `Merhba! 3jebni hedha fel story: ${product.name}, b9addech w mawjoud?`
        : `Merhba, b9addech ${product.name}?`;
    if (product.imageUrl) {
      try {
        const res = await fetch(product.imageUrl);
        if (res.ok) {
          const blob = await res.blob();
          await send({
            kind: "image",
            body: text,
            mediaBase64: await blobToBase64(blob),
            mediaExt: mediaExtFromMime(blob.type),
          });
          return;
        }
      } catch {
        // Photo unreachable (offline/CORS): fall through to text-only.
      }
    }
    void send({ kind: "text", body: text });
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

  // Platform-specific styling tokens inside the phone mockup
  const incomingBubbleClass =
    platform === "whatsapp"
      ? "self-end rounded-lg rounded-tr-none bg-[#D9FDD3] text-[#111B21] shadow-[0_1px_1px_rgb(11_20_26/0.13)]"
      : platform === "instagram"
        ? "self-end rounded-[22px] rounded-br-[4px] bg-gradient-to-b from-[#A033FF] via-[#C135B4] to-[#F74D6B] text-white"
        : "self-end rounded-[18px] rounded-br-[4px] bg-[#0084FF] text-white";

  const outgoingBubbleClass =
    platform === "whatsapp"
      ? "self-start rounded-lg rounded-tl-none bg-white text-[#111B21] shadow-[0_1px_1px_rgb(11_20_26/0.13)]"
      : platform === "instagram"
        ? "self-start rounded-[22px] rounded-bl-[4px] bg-[#EFEFEF] text-neutral-900"
        : "self-start rounded-[18px] rounded-bl-[4px] bg-[#F0F0F0] text-neutral-900";

  const pinButtonClass =
    platform === "whatsapp"
      ? "bg-[#00A884] text-white"
      : platform === "instagram"
        ? "bg-gradient-to-r from-[#833AB4] via-[#D62976] to-[#4F5BD5] text-white"
        : "bg-[#0084FF] text-white";

  const sendButtonClass =
    platform === "whatsapp"
      ? "bg-[#00A884] text-white shadow-[0_2px_6px_rgb(0_168_132/0.4)] hover:bg-[#008F6F]"
      : platform === "instagram"
        ? "bg-neutral-900 text-white hover:bg-neutral-800"
        : "bg-[#0084FF] text-white shadow-[0_2px_6px_rgb(0_132_255/0.35)] hover:bg-[#0073E6]";

  function renderMessage(message: SimMessage) {
    if (message.kind === "pin_link" && message.body) {
      try {
        const parsed = JSON.parse(message.body) as { text: string; url: string };
        return (
          <div className="flex flex-col gap-2.5">
            <span dir="auto" className="leading-relaxed">
              {repairMojibake(parsed.text)}
            </span>
            <a
              href={parsed.url}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-2xs transition-transform duration-150 ease-linear hover:brightness-95 active:scale-[0.97] ${pinButtonClass}`}
            >
              <MapPin className="size-3.5" />
              {t.confirmPin}
            </a>
          </div>
        );
      } catch {
        return <span dir="auto">{repairMojibake(message.body)}</span>;
      }
    }
    if (message.kind === "buttons" && message.body) {
      try {
        const parsed = JSON.parse(message.body) as { text: string; buttons: Array<{ id: string; title: string }> };
        return (
          <div className="flex flex-col gap-2.5">
            <span dir="auto" className="whitespace-pre-wrap leading-relaxed">
              {repairMojibake(parsed.text)}
            </span>
            <div className="flex flex-col gap-1.5 pt-0.5">
              {parsed.buttons.map((b) => (
                <Button
                  key={b.id}
                  size="sm"
                  color={b.id === "akked" ? "primary" : "secondary"}
                  onClick={() => void send({ kind: "button", body: b.title })}
                  className="w-full rounded-full"
                >
                  {repairMojibake(b.title)}
                </Button>
              ))}
            </div>
          </div>
        );
      } catch {
        return <span dir="auto">{repairMojibake(message.body)}</span>;
      }
    }

    const timeColor =
      message.direction === "in"
        ? platform === "whatsapp"
          ? "text-[#667781]"
          : "text-white/75"
        : "text-neutral-500";

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
          <VoiceNotePlayer
            key={message.id}
            src={message.mediaUrl}
            light={message.direction === "in" && platform !== "whatsapp"}
          />
        ) : null}
        {message.body ? (
          <span dir="auto" className="whitespace-pre-wrap leading-relaxed">
            {repairMojibake(message.body)}
          </span>
        ) : null}
        <span className={`inline-flex items-center gap-1 self-end font-mono text-[10px] leading-none tabular-nums ${timeColor}`}>
          {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {message.direction === "in" && platform === "whatsapp" ? (
            <span className="inline-flex -space-x-1.5 text-[#53BDEB]" aria-hidden="true">
              <Check className="size-3" />
              <Check className="size-3" />
            </span>
          ) : null}
        </span>
      </div>
    );
  }

  const hasComposerPayload = Boolean(draft.trim()) || Boolean(pendingImage) || Boolean(pendingVoice);
  const showSend = hasComposerPayload && !recording;
  const visibleSlots = Object.entries(slots).filter(([, v]) => v !== null && typeof v !== "object");
  const draftItems = Array.isArray(slots.items) ? (slots.items as Array<Record<string, unknown>>) : [];
  const draftSummary =
    draftItems.length > 0
      ? draftItems
          .map((i) => `${typeof i.productName === "string" ? i.productName : "produit"}${i.size ? ` (${String(i.size)})` : ""} x${typeof i.quantity === "number" ? i.quantity : 1}`)
          .join(" · ")
      : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* Top Omnichannel Header & Live Platform Switcher */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-secondary bg-primary p-4 shadow-xs lg:flex-row lg:items-center sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color="brand" size="sm">
              Omnichannel Live Sandbox
            </Badge>
            <span className="font-mono text-xs text-tertiary">{meta.channelTag}</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-primary sm:text-2xl">
            {meta.shortTitle} Simulator
          </h1>
          <p className="mt-0.5 text-xs text-tertiary sm:text-sm">{meta.capabilityLine}</p>
        </div>

        {/* Platform Switcher Tabs */}
        <div
          role="tablist"
          aria-label="Messaging platform"
          className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-secondary bg-secondary p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={platform === "whatsapp"}
            onClick={() => setPlatform("whatsapp")}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all sm:text-sm ${
              platform === "whatsapp"
                ? "bg-[#00A884] text-white shadow-xs"
                : "text-tertiary hover:text-primary"
            }`}
          >
            <span className="flex size-5 items-center justify-center rounded-md bg-[#25D366] text-white">
              <WhatsAppIcon className="size-3.5" />
            </span>
            WhatsApp
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={platform === "instagram"}
            onClick={() => setPlatform("instagram")}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all sm:text-sm ${
              platform === "instagram"
                ? "bg-gradient-to-r from-[#833AB4] via-[#D62976] to-[#F77737] text-white shadow-xs"
                : "text-tertiary hover:text-primary"
            }`}
          >
            <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white">
              <InstagramIcon className="size-3.5" />
            </span>
            Instagram
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={platform === "messenger"}
            onClick={() => setPlatform("messenger")}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all sm:text-sm ${
              platform === "messenger"
                ? "bg-[#0084FF] text-white shadow-xs"
                : "text-tertiary hover:text-primary"
            }`}
          >
            <span className="flex size-5 items-center justify-center rounded-md bg-[#0084FF] text-white">
              <MessengerIcon className="size-3.5" />
            </span>
            Messenger
          </button>
        </div>
      </div>

      {/* Main 3-Column Stage */}
      <div className="grid items-start gap-7 lg:grid-cols-[405px_minmax(0,1fr)] xl:grid-cols-[248px_405px_minmax(0,1fr)]">
        {/* Column 1: Interactive Shop Catalog */}
        <aside className="order-2 flex flex-col gap-3 xl:order-1 xl:max-h-[calc(100dvh-9rem)] xl:overflow-y-auto xl:pr-1">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">Catalog</p>
              <h2 className="mt-0.5 text-base font-semibold tracking-tight text-primary">Shop items</h2>
            </div>
            <span className="font-mono text-xs tabular-nums text-tertiary">{products.length} items</span>
          </div>
          {products.length === 0 ? (
            <p className="rounded-xl border border-secondary bg-primary px-3 py-4 text-sm text-tertiary">
              No products in this shop yet.
            </p>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
              {products.map((product) => (
                <article
                  key={product.id}
                  className="group flex flex-col gap-2.5 rounded-xl border border-secondary bg-primary p-3 shadow-2xs transition-colors hover:border-brand/40"
                >
                  <div className="flex gap-3">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.imageUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="size-14 shrink-0 rounded-lg bg-tertiary object-cover ring-1 ring-secondary"
                      />
                    ) : (
                      <div className="size-14 shrink-0 rounded-lg bg-tertiary" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-primary">{product.name}</p>
                      <p className="text-xs text-tertiary">{product.category}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold tabular-nums text-primary">
                          {formatPrice(product.priceMillimes)}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${product.stock > 0 ? "text-[#067647]" : "text-[#B42318]"}`}>
                          <span className={`size-1.5 rounded-full ${product.stock > 0 ? "bg-[#12B76A]" : "bg-[#F04438]"}`} />
                          {product.stock > 0 ? `${product.stock} left` : "Out of stock"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!conversationId || awaiting}
                    onClick={() => void askAboutProduct(product)}
                    className={`w-full cursor-pointer rounded-full px-2.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${
                      platform === "whatsapp"
                        ? "bg-[#00A884]"
                        : platform === "instagram"
                          ? "bg-gradient-to-r from-[#833AB4] via-[#D62976] to-[#F77737]"
                          : "bg-[#0084FF]"
                    }`}
                  >
                    {meta.askCta}
                  </button>
                </article>
              ))}
            </div>
          )}
        </aside>

        {/* Column 2: Buyer Phone Frame */}
        <div className="order-1 flex flex-col items-center gap-3 xl:order-2">
          {/* Persona Switcher */}
          <div className="flex w-full max-w-[398px] flex-wrap justify-center gap-1.5">
            {slug ? (
              <Button size="xs" color="primary" onClick={() => void startConversation("new")}>
                New chat
              </Button>
            ) : (
              PERSONAS.map((p) => (
                <Button
                  key={p.id}
                  size="xs"
                  color={persona === p.id ? "primary" : "secondary"}
                  onClick={() => void startConversation(p.id)}
                >
                  {p.labelEn}
                </Button>
              ))
            )}
          </div>

          <div className="flex w-full max-w-[398px] items-center justify-between rounded-xl border border-secondary/80 bg-primary px-3 py-1.5 text-xs shadow-2xs">
            <span className="flex items-center gap-1.5 font-medium text-primary">
              <UserCheck className="size-3.5 text-brand-secondary" />
              {shownName}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-tertiary">{shownPhone}</span>
          </div>

          {/* Mobile Device Mockup */}
          <div className="relative w-full max-w-[398px] overflow-hidden rounded-[44px] bg-neutral-900 p-[10px] shadow-[0_24px_60px_-18px_rgb(16_24_40/0.45)] ring-1 ring-neutral-900">
            {/* Side buttons */}
            <span aria-hidden="true" className="absolute top-28 -left-[2px] h-14 w-[3px] rounded-full bg-neutral-700" />
            <span aria-hidden="true" className="absolute top-48 -left-[2px] h-10 w-[3px] rounded-full bg-neutral-700" />
            <span aria-hidden="true" className="absolute top-36 -right-[2px] h-16 w-[3px] rounded-full bg-neutral-700" />
            <div className="relative overflow-hidden rounded-[36px] bg-white">
            {/* Status Bar + Dynamic Island */}
            <div
              className={`relative flex items-center justify-between px-7 pt-2.5 pb-1 text-[11px] font-semibold ${
                platform === "whatsapp" ? "bg-[#008069] text-white" : "bg-white text-neutral-900"
              }`}
            >
              <span className="w-12 tabular-nums">9:41</span>
              <span aria-hidden="true" className="absolute left-1/2 h-[22px] w-[92px] -translate-x-1/2 rounded-full bg-black" />
              <span className="flex w-16 items-center justify-end gap-1.5" aria-hidden="true">
                <span className="flex items-end gap-[2px]">
                  <span className="w-[3px] rounded-sm bg-current h-[5px]" /><span className="w-[3px] rounded-sm bg-current h-[7px]" /><span className="w-[3px] rounded-sm bg-current h-[9px]" /><span className="w-[3px] rounded-sm bg-current/40 h-[11px]" />
                </span>
                <span className="text-[10px] font-bold">5G</span>
                <span className="flex h-[11px] w-[24px] items-center rounded-[3px] border border-current/60 p-[1.5px]"><span className="h-full w-[82%] rounded-[1.5px] bg-current" /></span>
              </span>
            </div>

            {/* Platform-Specific App Header */}
            {platform === "whatsapp" ? (
              <div className="flex items-center gap-1 bg-[#008069] px-2 py-2 text-white">
                <ChevronLeft className="size-6 shrink-0" aria-hidden="true" />
                <span className="-ml-1 font-medium">3</span>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#DFE5E7] text-sm font-bold text-[#008069]">W</div>
                <div className="flex min-w-0 flex-1 flex-col pl-1">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-[15px] font-semibold leading-tight">{displayShopName}</span>
                    <ShieldCheck className="size-3.5 shrink-0 text-[#25D366]" />
                  </div>
                  <span className="truncate text-[11px] leading-tight text-white/85">
                    {aiPaused ? t.sellerOnline : awaiting ? meta.typingLabel : "online"}
                  </span>
                </div>
                <Video className="size-6 shrink-0" aria-hidden="true" />
                <Phone className="ml-3 size-5 shrink-0" aria-hidden="true" />
                <MoreVertical className="ml-3 size-5 shrink-0" aria-hidden="true" />
              </div>
            ) : platform === "instagram" ? (
              <div className="bg-white">
                <div className="flex items-center gap-2 px-3 py-2 text-neutral-900">
                  <ChevronLeft className="size-7 shrink-0" aria-hidden="true" />
                  <div className="relative shrink-0 rounded-full bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] p-[2px]">
                    <div className="flex size-8 items-center justify-center rounded-full bg-white text-xs font-bold ring-2 ring-white">W</div>
                    <span className="absolute right-0 bottom-0 size-2.5 rounded-full bg-[#31A24C] ring-2 ring-white" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-[14px] font-semibold leading-tight">{displayShopName}</span>
                      <ShieldCheck className="size-3.5 shrink-0 text-[#0095F6]" />
                    </div>
                    <span className="truncate text-[11px] leading-tight text-neutral-500">
                      {aiPaused ? t.sellerOnline : awaiting ? meta.typingLabel : `${igHandle} · Active now`}
                    </span>
                  </div>
                  <Phone className="size-6 shrink-0" aria-hidden="true" />
                  <Video className="ml-3 size-7 shrink-0" aria-hidden="true" />
                </div>
                {products.length > 0 ? (
                  <div className="flex gap-4 overflow-x-auto px-4 pt-1 pb-2.5 [scrollbar-width:none]">
                    {products.slice(0, 6).map((item) => (
                      <button key={item.id} type="button" disabled={!conversationId || awaiting} onClick={() => void askAboutProduct(item)} title={`Reply to ${item.name} story`} className="flex w-14 shrink-0 cursor-pointer flex-col items-center gap-1 disabled:opacity-50">
                        <span className="rounded-full bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] p-[2.5px]">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imageUrl} alt="" className="size-12 rounded-full object-cover ring-2 ring-white" />
                          ) : (
                            <span className="block size-12 rounded-full bg-neutral-200 ring-2 ring-white" />
                          )}
                        </span>
                        <span className="w-full truncate text-center text-[10px] text-neutral-700">{item.name}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-white px-3 py-2 text-neutral-900 shadow-[0_1px_4px_rgb(0_0_0/0.08)]">
                <ChevronLeft className="size-7 shrink-0 text-[#0084FF]" aria-hidden="true" />
                <div className="relative shrink-0">
                  <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-b from-[#00C6FF] to-[#0084FF] text-sm font-bold text-white">W</div>
                  <span className="absolute right-0 bottom-0 size-3 rounded-full bg-[#31A24C] ring-2 ring-white" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-[15px] font-semibold leading-tight">{displayShopName}</span>
                    <ShieldCheck className="size-3.5 shrink-0 text-[#0084FF]" />
                  </div>
                  <span className="truncate text-[11px] leading-tight text-neutral-500">
                    {aiPaused ? t.sellerOnline : awaiting ? meta.typingLabel : "Active now"}
                  </span>
                </div>
                <Phone className="size-5 shrink-0 text-[#0084FF]" aria-hidden="true" />
                <Video className="ml-3 size-6 shrink-0 text-[#0084FF]" aria-hidden="true" />
                <MoreVertical className="ml-2 size-5 shrink-0 text-[#0084FF]" aria-hidden="true" />
              </div>
            )}

            {/* Messages Stream */}
            <div
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                nearBottomRef.current = isNearBottom(el.scrollTop, el.clientHeight, el.scrollHeight);
              }}
              className={`flex h-[min(28rem,calc(100dvh-19rem))] touch-pan-y flex-col gap-[3px] overflow-y-auto overscroll-contain scroll-smooth px-3 py-3 ${
                platform === "whatsapp" ? "wa-chat-bg" : "bg-white"
              }`}
            >
              {platform === "whatsapp" ? (
                <>
                  <div className="mx-auto mb-1.5 rounded-lg bg-white px-3 py-1 text-[11px] font-medium text-[#54656F] shadow-[0_1px_1px_rgb(11_20_26/0.13)]">TODAY</div>
                  <div className="mx-auto mb-2 flex max-w-[92%] items-start gap-1.5 rounded-lg bg-[#FEEECD] px-2.5 py-2 text-center text-[11px] leading-snug text-[#54656F] shadow-[0_1px_1px_rgb(11_20_26/0.08)]">
                    <Lock className="mt-px size-3 shrink-0" aria-hidden="true" />
                    <span>{meta.introNotice} Messages are end-to-end encrypted.</span>
                  </div>
                </>
              ) : platform === "instagram" ? (
                <div className="mx-auto flex flex-col items-center px-4 pt-2 pb-3 text-center">
                  <div className="rounded-full bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] p-[3px]">
                    <div className="flex size-16 items-center justify-center rounded-full bg-white text-xl font-bold ring-4 ring-white">W</div>
                  </div>
                  <p className="mt-2 text-[15px] font-semibold text-neutral-900">{displayShopName}</p>
                  <p className="text-xs text-neutral-500">{igHandle} · Instagram</p>
                  <p className="mt-1 text-xs text-neutral-500">{meta.introNotice}</p>
                  <span className="mt-2 rounded-lg bg-[#EFEFEF] px-3 py-1.5 text-xs font-semibold text-neutral-900">View profile</span>
                </div>
              ) : (
                <div className="mx-auto flex flex-col items-center px-4 pt-2 pb-3 text-center">
                  <div className="relative">
                    <div className="flex size-16 items-center justify-center rounded-full bg-gradient-to-b from-[#00C6FF] to-[#0084FF] text-xl font-bold text-white">W</div>
                    <span className="absolute right-0 bottom-0 size-4 rounded-full bg-[#31A24C] ring-[3px] ring-white" />
                  </div>
                  <p className="mt-2 text-[15px] font-semibold text-neutral-900">{displayShopName}</p>
                  <p className="text-xs text-neutral-500">{meta.introNotice}</p>
                  <span className="mt-2 rounded-full bg-[#F0F2F5] px-3 py-1.5 text-xs font-semibold text-neutral-900">View page</span>
                </div>
              )}

              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[78%] px-3 py-[7px] text-[14.5px] leading-snug ${
                    m.direction === "in" ? incomingBubbleClass : outgoingBubbleClass
                  } ${platform !== "whatsapp" ? "mb-[2px]" : "mb-1"}`}
                >
                  {renderMessage(m)}
                </div>
              ))}
              {platform === "instagram" && messages.length > 0 ? (
                <span className="self-end pr-1 pt-0.5 text-[11px] text-neutral-500">Seen</span>
              ) : null}
              {platform === "messenger" && messages.length > 0 ? (
                <span className="self-end flex size-3.5 items-center justify-center rounded-full bg-gradient-to-b from-[#00C6FF] to-[#0084FF] text-[8px] font-bold text-white">W</span>
              ) : null}

              {awaiting && !aiPaused ? (
                <div className={`px-3.5 py-2.5 ${outgoingBubbleClass}`}>
                  <span className="flex gap-1">
                    <span className="size-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:0ms]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:120ms]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:240ms]" />
                  </span>
                </div>
              ) : null}
            </div>

            {/* Staged Photo Preview */}
            {pendingImage ? (
              <div className="mx-2.5 mb-1.5 flex items-center gap-3 rounded-2xl bg-primary p-2 ring-1 ring-secondary shadow-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pendingImage.previewUrl}
                  alt={pendingImage.file.name}
                  className="size-14 rounded-xl border border-secondary object-cover"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-semibold text-primary">{pendingImage.file.name}</span>
                  <span className="text-[11px] text-tertiary">{t.imageAttached}</span>
                </div>
                <Button
                  size="sm"
                  color="tertiary"
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
              <div className="mx-2.5 mb-1.5 flex items-center gap-2 rounded-2xl bg-primary p-2 ring-1 ring-secondary shadow-xs">
                <div className="flex min-w-0 flex-1 flex-col">
                  <VoiceNotePlayer src={pendingVoice.url} />
                  <span className="truncate font-mono text-[11px] tabular-nums text-tertiary">
                    {formatElapsed(pendingVoice.seconds)} · {t.voiceAttached}
                  </span>
                </div>
                <Button
                  size="sm"
                  color="tertiary"
                  aria-label={t.cancelVoice}
                  onClick={() => setVoice(null)}
                  className="shrink-0"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ) : null}

            {micError ? (
              <p className="px-3 pt-1.5 text-center text-[11px] font-medium text-error-primary">{micError}</p>
            ) : null}

            {/* Composer Bar */}
            <div
              className={`flex items-end gap-2 px-2 py-2 ${
                platform === "whatsapp" ? "wa-chat-bg" : "bg-white"
              }`}
            >
              <div
                className={`flex flex-1 items-center px-1.5 ${
                  platform === "whatsapp"
                    ? "rounded-full bg-white shadow-[0_1px_2px_rgb(11_20_26/0.15)]"
                    : platform === "instagram"
                      ? "rounded-full border border-neutral-300 bg-white"
                      : "rounded-full bg-[#F0F2F5]"
                }`}
              >
                {platform === "instagram" ? null : <Smile className={`ml-1 size-6 shrink-0 ${platform === "messenger" ? "text-[#0084FF]" : "text-[#54656F]"}`} aria-hidden="true" />}
                <label
                  className={`shrink-0 rounded-full p-1.5 transition-colors ${
                    platform === "instagram"
                      ? "order-first mr-0.5 flex size-8 items-center justify-center bg-neutral-900 text-white"
                      : platform === "messenger"
                        ? "text-[#0084FF]"
                        : "rotate-45 text-[#54656F]"
                  } ${stopping ? "pointer-events-none opacity-40" : "cursor-pointer"}`}
                  title="Image"
                >
                  {platform === "whatsapp" ? <Paperclip className="size-5" /> : platform === "instagram" ? <Camera className="size-4.5" /> : <Camera className="size-5" />}
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
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-utility-red-400 opacity-75" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-utility-red-600" />
                    </span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-neutral-900">
                      {formatElapsed(elapsed)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{t.recordingHint}</span>
                    <Button
                      color="tertiary"
                      size="sm"
                      onClick={cancelRecording}
                      aria-label={t.cancelVoice}
                      iconLeading={<Trash2 data-icon className="size-4" />}
                    />
                  </div>
                ) : (
                  <input
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
                    dir="auto"
                    aria-label={t.placeholder}
                    className="h-10 min-w-0 flex-1 bg-transparent px-1 text-[15px] text-neutral-900 outline-none placeholder:text-[#667781] disabled:opacity-50"
                  />
                )}
                {!hasComposerPayload && !recording && platform === "whatsapp" ? (
                  <Camera className="mr-1 size-5 shrink-0 text-[#54656F]" aria-hidden="true" />
                ) : null}
                {!hasComposerPayload && !recording && platform === "instagram" ? (
                  <>
                    <Mic className="mx-1 size-5 shrink-0 text-neutral-800" aria-hidden="true" />
                    <ImagePlus className="mx-1 size-5 shrink-0 text-neutral-800" aria-hidden="true" />
                    <Heart className="mx-1 size-5 shrink-0 text-neutral-800" aria-hidden="true" />
                  </>
                ) : null}
                {hasComposerPayload && !recording ? (
                  <Button
                    color="tertiary"
                    size="sm"
                    aria-label={t.recordVoice}
                    isDisabled={!conversationId || stopping || arming}
                    onClick={() => void startRecording()}
                    iconLeading={<Mic data-icon className="size-5" />}
                  />
                ) : null}
              </div>
              <Button
                size="md"
                isDisabled={!conversationId || stopping || arming}
                onClick={() => {
                  if (recording) void stopAndStage();
                  else if (showSend) void sendCurrent();
                  else void startRecording();
                }}
                className={`size-10.5 shrink-0 rounded-full ${sendButtonClass}`}
                aria-label={recording ? t.stageVoice : showSend ? "Send" : t.recordVoice}
              >
                {recording ? (
                  <Square className="size-4.5" />
                ) : showSend ? (
                  <Send className="size-4.5 text-white" />
                ) : (
                  <Mic className="size-5" />
                )}
              </Button>
            </div>
            {/* Home indicator */}
            <div className={`flex justify-center pb-1.5 ${platform === "whatsapp" ? "wa-chat-bg" : "bg-white"}`}>
              <span aria-hidden="true" className="h-[5px] w-32 rounded-full bg-neutral-900/85" />
            </div>
            </div>
          </div>

          {/* Quick-Try Derja Scenario Chips */}
          <div className="flex w-full max-w-[398px] flex-col gap-1.5 rounded-2xl border border-secondary bg-primary p-3 shadow-2xs">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-tertiary uppercase">
              <Sparkles className="size-3.5 text-brand-secondary" />
              Try in 1 click (Bargaining &amp; AI Location)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_SCENARIOS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={!conversationId || awaiting}
                  onClick={() => void send({ kind: "text", body: item.prompt })}
                  className="cursor-pointer rounded-full border border-secondary bg-secondary/70 px-2.5 py-1 text-left text-xs font-medium text-secondary transition-colors hover:border-brand/40 hover:bg-brand-primary/50 hover:text-brand-secondary disabled:opacity-50"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <p className="max-w-[360px] text-center text-xs text-tertiary">{t.subtitle}</p>
        </div>

        {/* Column 3: Behind the Scenes AI Telemetry */}
        <Card className="order-3 h-fit lg:sticky lg:top-20">
          <CardHeader className="border-b border-secondary/70">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="size-4 text-brand-secondary" />
                  {t.traceTitle}
                </CardTitle>
                <CardDescription className="mt-0.5">{t.traceSub}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {aiPaused ? <Badge color="error">{t.aiPaused}</Badge> : <Badge color="success">{t.aiActive}</Badge>}
                <Badge color="gray" className="font-mono tabular-nums">
                  {events.length} events
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {visibleSlots.length > 0 ? (
              <div className="rounded-xl border border-secondary/80 bg-tertiary/45 p-3">
                <p className="mb-2 text-[11px] font-semibold tracking-wider text-tertiary uppercase">{t.slots}</p>
                {draftSummary ? (
                  <p className="mb-2 font-mono text-[11px] text-secondary">Draft: {draftSummary}</p>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  {visibleSlots.map(([k, v]) => (
                    <Badge key={k} color="gray" className="bg-primary font-mono text-[11px]">
                      {k}: {String(v)}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex max-h-[580px] flex-col gap-2.5 overflow-y-auto pr-1">
              {events.length === 0 ? (
                <div className="rounded-xl border border-dashed border-secondary p-8 text-center">
                  <p className="text-sm text-tertiary">{t.emptyTrace}</p>
                </div>
              ) : null}
              {events.map((event) => (
                <div
                  key={event.id}
                  className={`rounded-xl border px-3.5 py-2.5 text-xs shadow-2xs ${
                    event.ok ? "border-secondary/80 bg-primary" : "border-[#FECDCA] bg-[#FFFBEB]"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color={event.ok ? "blue" : "error"} className="font-mono">
                      {event.kind}
                    </Badge>
                    {event.provider ? (
                      <span className="font-mono text-[11px] font-medium text-primary">
                        {event.provider}/{event.model}
                      </span>
                    ) : null}
                    {event.latency_ms !== null ? (
                      <span className="rounded bg-tertiary px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-tertiary">
                        {event.latency_ms}ms
                      </span>
                    ) : null}
                    <span className="ml-auto font-mono text-[10px] tabular-nums text-tertiary">
                      {new Date(event.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                  {event.kind === "asr.transcript" ? (
                    <p className="mt-2 rounded-lg bg-tertiary/50 px-2.5 py-1.5 text-primary" dir="auto">
                      {String((event.detail as { transcript?: string }).transcript ?? "")}
                    </p>
                  ) : null}
                  {event.kind === "understand" ? (
                    <pre className="mt-2 max-h-44 overflow-auto rounded-lg bg-tertiary/65 p-2.5 font-mono text-[10px] leading-relaxed">
                      {JSON.stringify((event.detail as { understanding?: unknown }).understanding, null, 2)}
                    </pre>
                  ) : null}
                  {event.kind.startsWith("vision.") && event.kind !== "vision.pending" ? (
                    <pre className="mt-2 max-h-44 overflow-auto rounded-lg bg-tertiary/65 p-2.5 font-mono text-[10px] leading-relaxed">
                      {JSON.stringify(event.detail, null, 2)}
                    </pre>
                  ) : null}
                  {event.kind.startsWith("address.") ? (
                    <pre className="mt-2 max-h-36 overflow-auto rounded-lg bg-tertiary/65 p-2 font-mono text-[10px] leading-relaxed">
                      {JSON.stringify(event.detail, null, 2)}
                    </pre>
                  ) : null}
                  {event.kind === "reply.sent" ? (
                    <p className="mt-2 rounded-lg bg-tertiary/40 px-2.5 py-1.5 text-primary" dir="auto">
                      {String((event.detail as { reply?: string }).reply ?? "")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
