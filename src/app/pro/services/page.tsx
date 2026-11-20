"use client";

import { useState } from "react";
import { Briefcase01, Edit03, Plus, Trash01 } from "@untitledui/icons";
import { invalidateDashboardUrl, useDashboardResource } from "@/app/dashboard/use-poll";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { Alert } from "@/components/foundations/alert/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import { Modal } from "@/components/foundations/modal/modal";
import { formatMillimesForChat } from "@/lib/domain/pricing";
import type { ProCategory, ProPricingMode, ProServiceRow } from "@/lib/pro/types";

interface ServiceFormState {
  id: string | null;
  title: string;
  category: string;
  description: string;
  duration_label: string;
  priceDt: string;
  floorDt: string;
  pricing_mode: ProPricingMode;
  deliverablesText: string;
  intakeQuestionsText: string;
  prep_or_details_template: string;
  active: boolean;
}

const EMPTY_FORM: ServiceFormState = {
  id: null,
  title: "",
  category: "consultation",
  description: "",
  duration_label: "45 min",
  priceDt: "120",
  floorDt: "100",
  pricing_mode: "fixed",
  deliverablesText: "",
  intakeQuestionsText: "",
  prep_or_details_template: "",
  active: true,
};

function parseDtToMillimes(raw: string): number | null {
  const clean = raw.trim().replace(",", ".");
  if (!clean) return null;
  const num = Number(clean);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 1000);
}

export default function ProServicesPage() {
  const { data, error, reload } = useDashboardResource<{ services: ProServiceRow[] }>("/api/pro/services");
  const services = data?.services ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ServiceFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<ProCategory>("creator");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  function openCreate() {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(svc: ProServiceRow) {
    setForm({
      id: svc.id,
      title: svc.title,
      category: svc.category,
      description: svc.description,
      duration_label: svc.duration_label,
      priceDt: svc.price_millimes != null ? String(svc.price_millimes / 1000) : "",
      floorDt: svc.floor_millimes != null ? String(svc.floor_millimes / 1000) : "",
      pricing_mode: svc.pricing_mode,
      deliverablesText: svc.deliverables.join("\n"),
      intakeQuestionsText: svc.intake_questions.join("\n"),
      prep_or_details_template: svc.prep_or_details_template,
      active: svc.active,
    });
    setModalOpen(true);
  }

  async function saveService() {
    const priceMillimes = parseDtToMillimes(form.priceDt);
    const floorMillimes = parseDtToMillimes(form.floorDt);
    if (priceMillimes !== null && floorMillimes !== null && floorMillimes > priceMillimes) {
      setFeedback({ kind: "error", text: "Minimum floor price cannot be higher than the standard price." });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        ...(form.id ? { id: form.id } : {}),
        title: form.title.trim(),
        category: form.category.trim() || "general",
        description: form.description.trim(),
        duration_label: form.duration_label.trim(),
        price_millimes: priceMillimes,
        floor_millimes: floorMillimes,
        pricing_mode: form.pricing_mode,
        deliverables: form.deliverablesText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
        intake_questions: form.intakeQuestionsText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
        prep_or_details_template: form.prep_or_details_template.trim(),
        active: form.active,
      };
      const res = await fetch("/api/pro/services", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setFeedback({ kind: "error", text: body?.error ?? "Could not save service." });
        return;
      }
      setModalOpen(false);
      invalidateDashboardUrl("/api/pro/services");
      await reload();
      setFeedback({ kind: "success", text: form.id ? "Service package updated." : "New service package added." });
    } finally {
      setSaving(false);
    }
  }

  async function deleteService(id: string) {
    setFeedback(null);
    const res = await fetch(`/api/pro/services?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      invalidateDashboardUrl("/api/pro/services");
      await reload();
      setFeedback({ kind: "success", text: "Service deleted." });
    }
  }

  async function loadPresetPack() {
    setLoadingPreset(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/pro/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "load_preset", preset: selectedPreset, replaceExisting: false }),
      });
      if (res.ok) {
        invalidateDashboardUrl("/api/pro/services");
        await reload();
        setFeedback({ kind: "success", text: `Loaded starter Tunisia services for "${selectedPreset}".` });
      }
    } finally {
      setLoadingPreset(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E4E4E7] pb-5">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#52525B]">
            Service Catalog &amp; Floors
          </p>
          <h1 className="mt-1.5 text-2xl font-medium tracking-[-0.03em] text-[#09090B] sm:text-3xl">
            Services, Packages &amp; Rate Floors
          </h1>
          <p className="mt-1 text-sm text-[#52525B]">
            Your assistant quotes exact DT rates from this list and never negotiates below your floor price.
          </p>
        </div>
        <Button color="primary" size="sm" iconLeading={Plus} onClick={openCreate}>
          Add Service
        </Button>
      </div>

      {error ? <Alert color="error">{error}</Alert> : null}
      {feedback ? <Alert color={feedback.kind}>{feedback.text}</Alert> : null}

      {/* Starter Preset Pack Loader */}
      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-4 py-4">
          <div className="min-w-[220px] flex-1">
            <p className="text-sm font-medium text-[#09090B]">Tunisia Starter Pack Loader</p>
            <p className="text-xs text-[#52525B]">
              Append ready-made Tunisia packages (Derja + French prep templates &amp; DT floors) for any track.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <NativeSelect
              aria-label="Choose Tunisia preset pack"
              size="sm"
              className="w-52"
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value as ProCategory)}
              options={[
                { value: "doctor", label: "Doctor / Medical Clinic" },
                { value: "cameraman", label: "Cameraman / Media Studio" },
                { value: "creator", label: "Public Figure / Creator" },
                { value: "custom", label: "Custom Service Provider" },
              ]}
            />
            <Button size="sm" color="secondary" isDisabled={loadingPreset} onClick={() => void loadPresetPack()}>
              {loadingPreset ? "Loading…" : "Load Preset Pack"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Services Grid */}
      {services.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[#52525B]">
            No services configured yet. Add a service package or load a Tunisia preset pack above.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {services.map((svc) => (
            <Card key={svc.id} className="flex flex-col justify-between">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge color="gray" size="sm" className="font-mono text-[10px] uppercase">
                        {svc.category}
                      </Badge>
                      <Badge color={svc.active ? "brand" : "warning"} size="sm" className="font-mono text-[10px] uppercase">
                        {svc.active ? svc.pricing_mode.replace(/_/g, " ") : "Paused"}
                      </Badge>
                    </div>
                    <CardTitle className="mt-2 flex items-center gap-2 text-base" dir="auto">
                      <Briefcase01 className="size-4 shrink-0 text-brand-secondary" aria-hidden="true" />
                      {svc.title}
                    </CardTitle>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <p className="text-base font-semibold text-[#09090B]">
                      {svc.price_millimes != null ? formatMillimesForChat(svc.price_millimes) : svc.price_display || "Custom"}
                    </p>
                    {svc.floor_millimes != null ? (
                      <p className="text-[11px] text-[#15704C]">
                        Floor: {formatMillimesForChat(svc.floor_millimes)}
                      </p>
                    ) : null}
                  </div>
                </div>
                <CardDescription dir="auto">{svc.description}</CardDescription>
              </CardHeader>

              <CardContent className="flex flex-col gap-3 text-xs text-[#52525B]">
                {svc.deliverables.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {svc.deliverables.map((item) => (
                      <span
                        key={item}
                        className="border border-[#E4E4E7] bg-[#FAFAF9] px-2 py-1 text-[#27272A]"
                        dir="auto"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}

                {svc.prep_or_details_template ? (
                  <div className="border-l-2 border-[#1B8A5E] bg-[#FAFAF9] px-3 py-2 text-xs text-[#27272A]" dir="auto">
                    {svc.prep_or_details_template}
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-2 border-t border-[#E4E4E7] pt-3">
                  <span className="font-mono text-[11px] text-[#71717A]">
                    {svc.duration_label || "Flexible"} · {svc.intake_questions.length} intake questions
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button size="xs" color="secondary" iconLeading={Edit03} onClick={() => openEdit(svc)}>
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      color="tertiary"
                      aria-label={`Delete ${svc.title}`}
                      iconLeading={Trash01}
                      onClick={() => void deleteService(svc.id)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onOpenChange={setModalOpen}
        title={form.id ? "Edit Service Package" : "New Service Package"}
        description="Rates are stored in integer millimes and enforced by the Pro Rate Firewall."
        className="max-w-xl"
        footer={
          <>
            <Button size="sm" color="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" color="primary" isDisabled={saving || !form.title.trim()} onClick={() => void saveService()}>
              {saving ? "Saving…" : "Save Service"}
            </Button>
          </>
        }
      >
        <div className="flex max-h-[65dvh] flex-col gap-3.5 overflow-y-auto pr-1">
          <Input
            label="Service title"
            placeholder="e.g. Pack Brand Reels (3 Vidéos 4K)"
            value={form.title}
            onChange={(val) => setForm((f) => ({ ...f, title: val }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Category"
              placeholder="consultation, commercial, sponsorship..."
              value={form.category}
              onChange={(val) => setForm((f) => ({ ...f, category: val }))}
            />
            <Input
              label="Duration / Delivery"
              placeholder="e.g. 30 min · 4 heures · Livraison 72h"
              value={form.duration_label}
              onChange={(val) => setForm((f) => ({ ...f, duration_label: val }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Standard Price (DT)"
              placeholder="750"
              value={form.priceDt}
              onChange={(val) => setForm((f) => ({ ...f, priceDt: val }))}
            />
            <Input
              label="Minimum Floor (DT)"
              placeholder="650"
              value={form.floorDt}
              onChange={(val) => setForm((f) => ({ ...f, floorDt: val }))}
            />
            <NativeSelect
              label="Pricing Mode"
              value={form.pricing_mode}
              onChange={(e) => setForm((f) => ({ ...f, pricing_mode: e.target.value as ProPricingMode }))}
              options={[
                { value: "fixed", label: "Fixed rate" },
                { value: "starting_at", label: "Starting at" },
                { value: "custom_quote", label: "Custom quote" },
              ]}
            />
          </div>
          <TextArea
            label="Description"
            rows={2}
            value={form.description}
            onChange={(val) => setForm((f) => ({ ...f, description: val }))}
          />
          <TextArea
            label="Deliverables (one per line)"
            rows={2}
            value={form.deliverablesText}
            onChange={(val) => setForm((f) => ({ ...f, deliverablesText: val }))}
          />
          <TextArea
            label="Intake Questions (one per line)"
            rows={2}
            value={form.intakeQuestionsText}
            onChange={(val) => setForm((f) => ({ ...f, intakeQuestionsText: val }))}
          />
          <TextArea
            label="Package Details / Prep Card (sent once intake is complete)"
            rows={3}
            value={form.prep_or_details_template}
            onChange={(val) => setForm((f) => ({ ...f, prep_or_details_template: val }))}
          />
        </div>
      </Modal>
    </div>
  );
}
