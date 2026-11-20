"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { TextArea } from "@/components/base/textarea/textarea";
import { AiControlsPanel } from "@/components/context/ai-controls-panel";
import { ContextChatPanel } from "@/components/context/context-chat-panel";
import { Alert } from "@/components/foundations/alert/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import { getCachedDashboard, setCachedDashboard } from "../use-poll";

interface AiPayload {
  replyLanguage?: string;
  aiInstructions?: string;
}

export function AiClient() {
  const cached = getCachedDashboard<AiPayload>("/api/dashboard/ai");
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
      body: JSON.stringify({ aiInstructions: note }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res.ok) {
      setError(body?.error ?? "Couldn't save.");
      return;
    }
    setCachedDashboard("/api/dashboard/ai", { ...(cached ?? {}), aiInstructions: note });
    setSaved(true);
  }

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">
          Gemini AI &amp; Shop Knowledge
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
          How the AI talks &amp; what it knows
        </h1>
        <p className="mt-0.5 text-sm text-tertiary">
          Tune message length, casual vs formal style, emojis, and language rules in 1 click — and type or dictate live shop knowledge in any language.
        </p>
      </div>

      {/* AI Reply Control Panel (Length, Casual Style, Emojis, Languages) */}
      <AiControlsPanel apiBase="/api/ai-controls" mode="ecommerce" />

      {/* Live Chat + Any-Language Voice Context Updater */}
      <ContextChatPanel apiBase="/api/context" mode="ecommerce" />

      {/* Extra Tone & Personality Guidelines */}
      <Card>
        <CardHeader className="border-b border-secondary/70">
          <CardTitle className="text-base">Extra Personality &amp; Brand Voice Notes</CardTitle>
          <CardDescription>
            Optional free-form instructions about your shop&apos;s personality. Prices and floor limits always come strictly from your catalog.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={(event) => void save(event)} className="flex flex-col gap-4">
            {error ? <Alert color="error">{error}</Alert> : null}
            {saved ? <Alert color="success">Saved. New replies use these brand guidelines.</Alert> : null}
            <TextArea
              value={note}
              onChange={setNote}
              rows={4}
              placeholder="e.g. Warm, natural Tunis boutique owner vibe. Mention our showroom in Lac 2 when buyers ask to try on sizes."
              aria-label="Extra personality guidelines"
            />
            <Button type="submit" className="w-fit" isDisabled={busy}>
              {busy ? "Saving…" : "Save guidelines"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
