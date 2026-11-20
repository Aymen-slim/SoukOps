"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Edit03,
  MessageChatCircle,
  Microphone01,
  PauseCircle,
  PlayCircle,
  Send01,
  Square,
  Stars01,
  Trash01,
  X,
} from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/foundations/alert/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import type { ContextCategory, WorkspaceContextEntry } from "@/lib/context/workspace-context";
import { blobToBase64, WavRecorder } from "@/lib/media/wav-recorder";
import type { ProCategory } from "@/lib/pro/types";

interface ContextApiResponse {
  entries?: WorkspaceContextEntry[];
  autoSummary?: {
    track: "ecommerce" | "pro";
    primaryLabel: string;
    secondaryLabel: string;
    activeNotes: number;
  };
  error?: string;
}

const CATEGORY_LABELS: Record<ContextCategory, string> = {
  general: "General",
  policy: "Policy / Delivery",
  hours: "Hours",
  pricing_note: "Pricing Note",
  promo: "Promo",
  faq: "FAQ / Link",
  location: "Location",
  availability: "Availability",
  style: "Style",
};

function quickSuggestionsFor(mode: "ecommerce" | "pro", preset?: ProCategory | null): string[] {
  if (mode === "ecommerce") {
    return [
      "Delivery takes 24h in Grand Tunis and 48h in other governorates, cash on delivery.",
      "Free size exchange within 7 days if tags are intact.",
      "Showroom in Lac 2 is open Mon–Sat 10h to 20h, closed Sundays.",
    ];
  }
  if (preset === "doctor") {
    return [
      "Clinic open Mon–Fri 9h–17h and Saturday 9h–13h. CNAM card accepted.",
      "Free parking is available right behind Immeuble Médical Le Lac.",
      "Please bring your latest lab results and arrive 10 minutes early.",
    ];
  }
  if (preset === "cameraman") {
    return [
      "30% deposit is required to lock any shoot date. Raw files available on request.",
      "Fully booked this weekend — next open shoot dates start Monday.",
      "Travel outside Grand Tunis (Hammamet, Sousse, Djerba) includes transport.",
    ];
  }
  if (preset === "creator") {
    return [
      "Audience: 180K followers (75% Tunisia, 18–34). Media kit ready on request.",
      "No gifted-only Reels; paid ad usage rights (whitelisting) are billed separately.",
      "Delivery takes 4–5 days after receiving the product and confirmed brief.",
    ];
  }
  return [
    "Available Mon–Fri 9h–18h for online or Tunis in-person sessions.",
    "Custom proposals are sent within 24h after the discovery session.",
  ];
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ContextChatPanel({
  apiBase,
  mode,
  preset = null,
  compact = false,
  onCountChange,
}: {
  apiBase: string;
  mode: "ecommerce" | "pro";
  preset?: ProCategory | null;
  compact?: boolean;
  onCountChange?: (activeCount: number) => void;
}) {
  const [entries, setEntries] = useState<WorkspaceContextEntry[]>([]);
  const [autoSummary, setAutoSummary] = useState<ContextApiResponse["autoSummary"] | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  // Voice context entry (any language via Gemini ASR)
  const [recording, setRecording] = useState(false);
  const [arming, setArming] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [autoSendVoice, setAutoSendVoice] = useState(false);
  const [voiceBanner, setVoiceBanner] = useState<string | null>(null);
  const recorderRef = useRef<WavRecorder | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(apiBase);
      const body = (await res.json().catch(() => null)) as ContextApiResponse | null;
      if (!res.ok || body?.error) {
        setError(body?.error ?? "Couldn't load AI context.");
        return;
      }
      const list = body?.entries ?? [];
      setEntries(list);
      setAutoSummary(body?.autoSummary ?? null);
      onCountChange?.(list.filter((e) => e.active).length);
    } catch {
      setError("Couldn't load AI context.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, onCountChange]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      recorderRef.current = null;
    };
  }, []);

  async function sendNote(contentRaw: string) {
    const content = contentRaw.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    setVoiceBanner(null);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body = (await res.json().catch(() => null)) as { entry?: WorkspaceContextEntry; error?: string } | null;
      if (!res.ok || !body?.entry) {
        setError(body?.error ?? "Couldn't save context note.");
        return;
      }
      setDraft("");
      setLastSavedId(body.entry.id);
      setEntries((prev) => {
        const next = [...prev, body.entry!];
        onCountChange?.(next.filter((e) => e.active).length);
        return next;
      });
      requestAnimationFrame(() => {
        feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
      });
    } finally {
      setSending(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await sendNote(draft);
  }

  async function startVoiceRecording() {
    if (recording || arming || transcribing || sending) return;
    setError(null);
    setVoiceBanner(null);
    setArming(true);
    const recorder = new WavRecorder();
    recorderRef.current = recorder;
    try {
      await recorder.start();
      setElapsed(0);
      setRecording(true);
    } catch {
      recorder.cancel();
      recorderRef.current = null;
      setError("Microphone access blocked. Allow microphone permission in your browser and try again.");
    } finally {
      setArming(false);
    }
  }

  function cancelVoiceRecording() {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRecording(false);
    setElapsed(0);
  }

  async function stopAndTranscribeVoice() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    setRecording(false);
    setTranscribing(true);
    setError(null);
    try {
      const wavBlob = await recorder.stop();
      recorderRef.current = null;
      setElapsed(0);
      if (!wavBlob) {
        setError("Voice clip was too short. Hold and speak for at least 1 second.");
        return;
      }
      const audioBase64 = await blobToBase64(wavBlob);
      const transcribeUrl = `${apiBase.replace(/\/$/, "")}/transcribe`;
      const res = await fetch(transcribeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64, mimeType: "audio/wav" }),
      });
      const body = (await res.json().catch(() => null)) as { transcript?: string; error?: string } | null;
      if (!res.ok || !body?.transcript) {
        setError(body?.error ?? "Couldn't transcribe voice note.");
        return;
      }
      const transcript = body.transcript.trim();
      if (autoSendVoice) {
        await sendNote(transcript);
        setVoiceBanner("Voice context transcribed & saved live.");
      } else {
        setDraft((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
        setVoiceBanner("Transcribed from voice (any language) — review or press Update.");
      }
    } catch {
      setError("Voice transcription failed. Try again.");
    } finally {
      setTranscribing(false);
    }
  }

  async function saveEdit(id: string) {
    const content = editText.trim();
    if (!content) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, content }),
      });
      const body = (await res.json().catch(() => null)) as { entry?: WorkspaceContextEntry; error?: string } | null;
      if (!res.ok || !body?.entry) {
        setError(body?.error ?? "Couldn't update note.");
        return;
      }
      setEntries((prev) => prev.map((e) => (e.id === id ? body.entry! : e)));
      setEditingId(null);
      setEditText("");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(entry: WorkspaceContextEntry) {
    setBusyId(entry.id);
    setError(null);
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, active: !entry.active }),
      });
      const body = (await res.json().catch(() => null)) as { entry?: WorkspaceContextEntry; error?: string } | null;
      if (!res.ok || !body?.entry) {
        setError(body?.error ?? "Couldn't toggle note.");
        return;
      }
      setEntries((prev) => {
        const next = prev.map((e) => (e.id === entry.id ? body.entry! : e));
        onCountChange?.(next.filter((e) => e.active).length);
        return next;
      });
    } finally {
      setBusyId(null);
    }
  }

  async function removeEntry(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const sep = apiBase.includes("?") ? "&" : "?";
      const res = await fetch(`${apiBase}${sep}id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Couldn't delete note.");
        return;
      }
      setEntries((prev) => {
        const next = prev.filter((e) => e.id !== id);
        onCountChange?.(next.filter((e) => e.active).length);
        return next;
      });
    } finally {
      setBusyId(null);
    }
  }

  const activeCount = entries.filter((e) => e.active).length;
  const suggestions = quickSuggestionsFor(mode, preset);

  const innerContent = (
    <div className="flex flex-col gap-3.5">
      {/* Auto-Synced Knowledge Strip */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-secondary bg-tertiary/45 px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1 font-medium text-primary">
          <Stars01 className="size-3.5 text-brand-secondary" aria-hidden="true" />
          Auto-known by Gemini:
        </span>
        {autoSummary ? (
          <>
            <Badge color="gray" size="sm" className="font-mono text-[11px]">
              {autoSummary.primaryLabel}
            </Badge>
            <Badge color="gray" size="sm" className="font-mono text-[11px]">
              {autoSummary.secondaryLabel}
            </Badge>
          </>
        ) : (
          <Badge color="gray" size="sm" className="font-mono text-[11px]">
            {mode === "pro" ? "Services & schedule synced" : "Catalog, fees & schedule synced"}
          </Badge>
        )}
        <Badge color="brand" size="sm" className="font-mono text-[11px]">
          {activeCount} live note{activeCount === 1 ? "" : "s"}
        </Badge>
      </div>

      {error ? <Alert color="error">{error}</Alert> : null}
      {voiceBanner ? (
        <div className="rounded-xl border border-[#A4F4CF] bg-[#F2FBF7] px-3 py-1.5 font-mono text-[11px] text-[#15704C]">
          ✓ {voiceBanner}
        </div>
      ) : null}

      {/* Chat-Style Context Stream */}
      <div
        ref={feedRef}
        className={`flex flex-col gap-2.5 overflow-y-auto rounded-xl border border-secondary bg-[#FAFAF9] p-3 ${
          compact ? "max-h-[260px]" : "max-h-[380px] min-h-[220px]"
        }`}
      >
        {/* Assistant welcome bubble */}
        <div className="max-w-[90%] self-start rounded-2xl rounded-tl-sm border border-[#E4E4E7] bg-white px-3.5 py-2.5 text-xs leading-relaxed text-[#27272A] shadow-2xs">
          <p className="font-medium text-[#09090B]">
            {mode === "pro"
              ? "Type or speak in any language to teach me hours, availability, CNAM, parking, links, or rules."
              : "Type or speak in any language to teach me delivery times, exchange rules, showroom hours, promos, or materials."}
          </p>
          <p className="mt-1 text-[#52525B]">
            Text updates save instantly (0 AI calls). Tap the microphone to dictate context in Derja, Arabic, French, English, or any language.
          </p>
        </div>

        {loading ? (
          <p className="py-4 text-center text-xs text-tertiary">Loading context notes…</p>
        ) : null}

        {!loading && entries.length === 0 ? (
          <p className="py-2 text-center text-xs text-tertiary">
            No custom notes yet. Tap a quick example below, type, or use the mic.
          </p>
        ) : null}

        {entries.map((entry) => {
          const isEditing = editingId === entry.id;
          const isBusy = busyId === entry.id;
          return (
            <div key={entry.id} className="flex flex-col gap-1">
              <div
                className={`max-w-[92%] self-end rounded-2xl rounded-tr-sm border px-3.5 py-2.5 text-sm shadow-2xs transition-opacity ${
                  entry.active
                    ? "border-[#1B8A5E]/30 bg-[#F2FBF7] text-[#09090B]"
                    : "border-[#E4E4E7] bg-white/80 text-[#71717A] opacity-70"
                }`}
              >
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Badge color={entry.active ? "brand" : "gray"} size="sm" className="font-mono text-[10px] uppercase">
                      {CATEGORY_LABELS[entry.category] ?? entry.category}
                    </Badge>
                    {!entry.active ? (
                      <span className="font-mono text-[10px] uppercase text-[#71717A]">Paused</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={isBusy}
                      aria-label="Edit context note"
                      onClick={() => {
                        setEditingId(entry.id);
                        setEditText(entry.content);
                      }}
                      className="cursor-pointer rounded p-1 text-[#52525B] hover:bg-black/5 hover:text-[#09090B] disabled:opacity-40"
                    >
                      <Edit03 className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      aria-label={entry.active ? "Pause context note" : "Enable context note"}
                      onClick={() => void toggleActive(entry)}
                      className="cursor-pointer rounded p-1 text-[#52525B] hover:bg-black/5 hover:text-[#09090B] disabled:opacity-40"
                    >
                      {entry.active ? <PauseCircle className="size-3.5" /> : <PlayCircle className="size-3.5" />}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      aria-label="Delete context note"
                      onClick={() => void removeEntry(entry.id)}
                      className="cursor-pointer rounded p-1 text-[#52525B] hover:bg-red-50 hover:text-[#D13C2E] disabled:opacity-40"
                    >
                      <Trash01 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      dir="auto"
                      className="w-full rounded-lg border border-[#D4D4D8] bg-white px-2.5 py-1.5 text-sm text-[#09090B] outline-none focus:border-[#1B8A5E]"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        size="xs"
                        color="tertiary"
                        iconLeading={X}
                        onClick={() => {
                          setEditingId(null);
                          setEditText("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        color="primary"
                        iconLeading={Check}
                        isDisabled={isBusy || !editText.trim()}
                        onClick={() => void saveEdit(entry.id)}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p dir="auto" className="whitespace-pre-wrap text-[13.5px] leading-relaxed">
                    {entry.content}
                  </p>
                )}
              </div>

              {lastSavedId === entry.id ? (
                <div className="self-start rounded-full border border-[#A4F4CF] bg-white px-2.5 py-1 font-mono text-[10.5px] text-[#15704C]">
                  ✓ Got it — Gemini now knows this for all replies.
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Quick Starter Chips */}
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={sending || recording || transcribing}
            onClick={() => void sendNote(chip)}
            className="cursor-pointer rounded-full border border-secondary bg-white px-2.5 py-1 text-left text-[11.5px] text-secondary transition-colors hover:border-[#1B8A5E] hover:bg-[#F2FBF7] hover:text-[#15704C] disabled:opacity-50"
          >
            + {chip.length > 64 ? `${chip.slice(0, 62)}…` : chip}
          </button>
        ))}
      </div>

      {/* Voice Mode Options Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-tertiary">
        <span>Speak context in any language (Derja, AR, FR, EN, ES, IT…)</span>
        <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-primary">
          <input
            type="checkbox"
            checked={autoSendVoice}
            onChange={(e) => setAutoSendVoice(e.target.checked)}
            className="size-3.5 accent-[#1B8A5E]"
          />
          Auto-send voice
        </label>
      </div>

      {/* Active Recording Bar OR Chat + Voice Input Composer */}
      {recording ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[#F5C6C2] bg-[#FBF3F2] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-[#D13C2E]" />
            </span>
            <span className="font-mono text-xs font-semibold tabular-nums text-[#09090B]">
              {formatTimer(elapsed)}
            </span>
            <span className="text-xs text-[#52525B]">Listening in any language…</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="xs"
              color="tertiary"
              aria-label="Cancel voice recording"
              iconLeading={Trash01}
              onClick={cancelVoiceRecording}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="xs"
              color="primary"
              iconLeading={Square}
              onClick={() => void stopAndTranscribeVoice()}
            >
              {autoSendVoice ? "Stop & Save" : "Stop & Transcribe"}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendNote(draft);
              }
            }}
            rows={2}
            dir="auto"
            disabled={sending || transcribing}
            aria-label="Send an AI context update"
            placeholder={
              transcribing
                ? "Transcribing voice note via Gemini…"
                : mode === "pro"
                  ? "Type or click mic to dictate (e.g. Closed Friday afternoon, CNAM accepted, parking behind building)…"
                  : "Type or click mic to dictate (e.g. Free delivery over 150DT, closed Sunday, 24h Tunis delivery)…"
            }
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-secondary bg-white px-3 py-2 text-sm text-primary outline-none transition-colors placeholder:text-tertiary focus:border-[#1B8A5E] disabled:opacity-50"
          />
          <Button
            type="button"
            size="md"
            color="secondary"
            iconLeading={Microphone01}
            aria-label="Record voice context in any language"
            isDisabled={sending || arming || transcribing}
            onClick={() => void startVoiceRecording()}
            className="shrink-0"
          >
            {compact ? "" : transcribing ? "…" : "Voice"}
          </Button>
          <Button
            type="submit"
            size="md"
            color="primary"
            iconLeading={Send01}
            isDisabled={sending || transcribing || !draft.trim()}
            className="shrink-0"
          >
            {sending ? "Saving…" : "Update"}
          </Button>
        </form>
      )}
    </div>
  );

  if (compact) {
    return innerContent;
  }

  return (
    <Card>
      <CardHeader className="border-b border-[#E4E4E7]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageChatCircle className="size-4 text-brand-secondary" aria-hidden="true" />
              Live AI Context &amp; Voice Knowledge Chat
            </CardTitle>
            <CardDescription>
              Type or dictate in any language to teach your Gemini assistant policies, hours, availability, promos, or FAQs — applied immediately.
            </CardDescription>
          </div>
          <Badge color="success" size="sm" className="font-mono text-[10px] uppercase">
            Text + Any-Language Voice
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4">{innerContent}</CardContent>
    </Card>
  );
}
