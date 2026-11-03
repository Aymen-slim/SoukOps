"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { TextArea } from "@/components/base/textarea/textarea";
import { Alert } from "@/components/foundations/alert/alert";
import { getCachedDashboard, setCachedDashboard } from "../use-poll";

const TEMPLATES = [
  { id: "derja", label: "Tunisian Darija", hint: "Default. Arabizi, the way a Tunis shop texts." },
  { id: "ar", label: "Arabic", hint: "Modern Standard Arabic." },
  { id: "en", label: "English", hint: "Clear English replies." },
  { id: "fr", label: "French", hint: "Clear French replies." },
] as const;

const COMING = ["Spanish", "Italian", "German", "Turkish"];

interface AiPayload {
  replyLanguage?: string;
  aiInstructions?: string;
}

export function AiClient() {
  const cached = getCachedDashboard<AiPayload>("/api/dashboard/ai");
  const [language, setLanguage] = useState(cached?.replyLanguage ?? "derja");
  const [note, setNote] = useState(cached?.aiInstructions ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/dashboard/ai")
      .then((res) => res.json())
      .then((body: AiPayload & { error?: string }) => {
        if (!active) return;
        if (body.error) setError(body.error);
        else {
          setCachedDashboard("/api/dashboard/ai", body);
          setLanguage(body.replyLanguage ?? "derja");
          setNote(body.aiInstructions ?? "");
        }
      })
      .catch(() => {
        if (active) setError("Couldn't load AI settings.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(null);
    const res = await fetch("/api/dashboard/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyLanguage: language, aiInstructions: note }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res.ok) {
      setError(body?.error ?? "Couldn't save.");
      return;
    }
    setCachedDashboard("/api/dashboard/ai", { replyLanguage: language, aiInstructions: note });
    setSaved(true);
  }

  return (
    <form onSubmit={(event) => void save(event)} className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">Templates</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">How the AI talks</h1>
        <p className="mt-0.5 text-sm text-tertiary">
          Pick a language template, or add a short note about tone. Prices still come from your catalog.
        </p>
      </div>
      {error ? <Alert color="error">{error}</Alert> : null}
      {saved ? <Alert color="success">Saved. New replies use this voice.</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {TEMPLATES.map((template) => {
          const selected = language === template.id;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => setLanguage(template.id)}
              className={`cursor-pointer rounded-2xl border p-4 text-left transition-colors ${
                selected ? "border-brand-solid bg-brand-primary/40" : "border-secondary bg-primary hover:bg-secondary/50"
              }`}
            >
              <p className="font-medium text-primary">{template.label}</p>
              <p className="mt-1 text-sm text-tertiary">{template.hint}</p>
            </button>
          );
        })}
        {COMING.map((name) => (
          <div key={name} className="rounded-2xl border border-dashed border-secondary bg-secondary/40 p-4 opacity-70">
            <p className="font-medium text-tertiary">{name}</p>
            <p className="mt-1 text-sm text-tertiary">Coming soon</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-primary">Custom note</p>
        <TextArea
          value={note}
          onChange={setNote}
          rows={4}
          placeholder="Warm, short replies. Always greet with the shop name."
          aria-label="How the AI should talk"
        />
      </div>
      <Button type="submit" className="w-fit" isDisabled={busy}>
        {busy ? "Saving…" : "Save voice"}
      </Button>
    </form>
  );
}
