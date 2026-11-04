"use client";

import Link from "next/link";
import { type DragEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { Check, ImagePlus, LayersThree01 as Layers, Stars01 as Sparkles, XClose } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { Toggle } from "@/components/base/toggle/toggle";
import { Alert } from "@/components/foundations/alert/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import { prepareImageForUpload } from "@/lib/media/client-image";
import { samPhrase } from "@/lib/domain/catalog-options";
import { money } from "../bits";
import { useDashboardResource } from "../use-poll";
import { OptionsEditor, type SellerOption, type SellerVariant } from "./options-editor";

interface ProductRow {
  id: string;
  name: string;
  category: string;
  priceMillimes: number;
  floorMillimes: number;
  stock: number;
  aiEnabled: boolean;
  imageCount: number;
  imageUrl: string | null;
}

interface DraftSlot {
  id: string;
  previewUrl: string;
  status: "cutting" | "ready" | "error";
  originalBase64?: string;
  cropBase64?: string;
  usedOriginal?: boolean;
  errorMsg?: string;
}

export function CatalogClient() {
  const { data, error: loadError, reload, mutate } = useDashboardResource<{ products: ProductRow[] }>(
    "/api/dashboard/catalog",
  );
  const products = data?.products ?? null;
  const [actionError, setActionError] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const error = actionError ?? loadError;
  const categories = [...new Set((products ?? []).map((product) => product.category))].sort();
  const visible = (products ?? []).filter((product) => category === "all" || product.category === category);

  async function toggleAi(product: ProductRow, enabled: boolean) {
    setBusyId(product.id);
    setActionError(null);
    // Optimistic update for instant feedback
    mutate((prev) => ({
      products: (prev?.products ?? []).map((row) => (row.id === product.id ? { ...row, aiEnabled: enabled } : row)),
    }));
    const res = await fetch(`/api/dashboard/catalog/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiEnabled: enabled }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setActionError(body?.error ?? "Couldn't update AI.");
      void reload();
    }
  }

  function handleProductCreated(created?: ProductRow) {
    if (created) {
      mutate((prev) => ({
        products: [created, ...(prev?.products ?? []).filter((p) => p.id !== created.id)].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      }));
    } else {
      void reload();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">Catalog</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">Products</h1>
        <p className="mt-0.5 text-sm text-tertiary">
          Any product type. Price, floor, photos, and optional options like size or scent.
        </p>
      </div>
      {error ? <Alert color="error">{error}</Alert> : null}
      {products === null && !error ? <p className="text-sm text-tertiary">Loading products…</p> : null}
      <div className="grid items-start gap-6 lg:grid-cols-[200px_1fr]">
        <aside className="flex flex-row gap-2 overflow-x-auto lg:flex-col">
          <CategoryButton
            label="All"
            count={products?.length ?? 0}
            selected={category === "all"}
            onClick={() => setCategory("all")}
          />
          {categories.map((name) => (
            <CategoryButton
              key={name}
              label={name}
              count={(products ?? []).filter((product) => product.category === name).length}
              selected={category === name}
              onClick={() => setCategory(name)}
            />
          ))}
        </aside>
        <div className="flex flex-col gap-4">
          <AddProduct onCreated={handleProductCreated} />
          {products && visible.length === 0 ? (
            <p className="rounded-xl border border-secondary bg-primary px-4 py-8 text-center text-sm text-tertiary">
              No products in this category yet.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((product) => (
              <Card key={product.id} className="transition-shadow hover:shadow-sm">
                <CardContent className="flex gap-3.5">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.imageUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-20 shrink-0 rounded-xl bg-tertiary object-cover ring-1 ring-secondary"
                    />
                  ) : (
                    <div className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-tertiary text-tertiary">
                      <Layers className="size-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/catalog/${product.id}`}
                      className="block truncate font-semibold text-primary transition-colors hover:text-brand-secondary"
                    >
                      {product.name}
                    </Link>
                    <p className="text-xs text-tertiary">{product.category}</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <p className="font-mono text-sm font-semibold tabular-nums text-primary">
                        {money(product.priceMillimes)}
                      </p>
                      <span className="font-mono text-[11px] tabular-nums text-tertiary">
                        floor {money(product.floorMillimes)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge color={product.stock > 0 ? "gray" : "warning"} size="sm">
                        {product.stock} in stock
                      </Badge>
                      <Badge color="gray" size="sm">
                        {product.imageCount} {product.imageCount === 1 ? "photo" : "photos"}
                      </Badge>
                      <Toggle
                        size="sm"
                        aria-label={`AI for ${product.name}`}
                        isSelected={product.aiEnabled}
                        isDisabled={busyId === product.id}
                        onChange={(selected) => void toggleAi(product, selected)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryButton({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
        selected ? "bg-brand-solid text-white" : "bg-primary text-secondary ring-1 ring-secondary hover:bg-secondary"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="font-mono text-xs tabular-nums">{count}</span>
    </button>
  );
}

function AddProduct({ onCreated }: { onCreated: (created?: ProductRow) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [productType, setProductType] = useState("");
  const [description, setDescription] = useState("");
  const [priceDt, setPriceDt] = useState("120");
  const [floorDt, setFloorDt] = useState("105");
  const [stock, setStock] = useState("4");
  const [options, setOptions] = useState<SellerOption[]>([]);
  const [variants, setVariants] = useState<SellerVariant[]>([]);
  const [slots, setSlots] = useState<DraftSlot[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const slotsRef = useRef<DraftSlot[]>([]);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    return () => {
      for (const s of slotsRef.current) {
        URL.revokeObjectURL(s.previewUrl);
      }
    };
  }, []);

  const readySlots = slots.filter((s) => s.status === "ready" && s.cropBase64 && s.originalBase64);
  const cuttingCount = slots.filter((s) => s.status === "cutting").length;

  async function addFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const files = [...fileList].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(f.name));
    if (files.length === 0) return;
    setError(null);

    const remaining = Math.max(0, 6 - slots.length);
    const chosen = files.slice(0, remaining);
    if (chosen.length === 0) {
      setError("Up to 6 photos per product.");
      return;
    }

    const prepared = await Promise.all(
      chosen.map(async (file, idx) => {
        const prep = await prepareImageForUpload(file);
        return {
          slotId: `${Date.now()}-${idx}-${file.name}`,
          prep,
        };
      }),
    );

    // Render instant thumbnails in 0ms while SAM 3.1 runs in parallel
    setSlots((curr) => [
      ...curr,
      ...prepared.map(({ slotId, prep }) => ({
        id: slotId,
        previewUrl: prep.previewUrl,
        status: "cutting" as const,
        originalBase64: prep.base64,
      })),
    ]);

    const phrase = samPhrase(productType);
    await Promise.all(
      prepared.map(async ({ slotId, prep }) => {
        try {
          const res = await fetch("/api/dashboard/catalog/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: prep.base64,
              mediaExt: prep.mediaExt,
              categoryPhrase: phrase,
            }),
          });
          const body = (await res.json().catch(() => null)) as {
            error?: string;
            cropBase64?: string;
            usedOriginal?: boolean;
          } | null;
          if (!res.ok || !body?.cropBase64) {
            const msg = body?.error ?? "Preview failed.";
            setSlots((curr) =>
              curr.map((s) => (s.id === slotId ? { ...s, status: "error", errorMsg: msg } : s)),
            );
            setError(msg);
            return;
          }
          setSlots((curr) =>
            curr.map((s) =>
              s.id === slotId
                ? {
                    ...s,
                    status: "ready",
                    cropBase64: body.cropBase64,
                    usedOriginal: Boolean(body.usedOriginal),
                  }
                : s,
            ),
          );
        } catch {
          setSlots((curr) =>
            curr.map((s) => (s.id === slotId ? { ...s, status: "error", errorMsg: "Network error" } : s)),
          );
        }
      }),
    );
  }

  function removeSlot(id: string) {
    setSlots((curr) => {
      const target = curr.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return curr.filter((s) => s.id !== id);
    });
  }

  function promoteCover(id: string) {
    setSlots((curr) => {
      const target = curr.find((s) => s.id === id);
      if (!target) return curr;
      return [target, ...curr.filter((s) => s.id !== id)];
    });
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    void addFiles(e.dataTransfer.files);
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    const priceMillimes = Math.round(Number(priceDt) * 1000);
    const floorMillimes = Math.round(Number(floorDt) * 1000);
    if (!name.trim() || readySlots.length === 0 || !Number.isFinite(priceMillimes) || !Number.isFinite(floorMillimes)) {
      setError("Name, price, and at least one ready photo are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const variantStock = variants.reduce((sum, variant) => sum + variant.stock, 0);
    const res = await fetch("/api/dashboard/catalog/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        productType: productType.trim(),
        category: productType.trim() || "General",
        description: description.trim(),
        priceMillimes,
        floorMillimes,
        stock: options.length > 0 ? variantStock : Math.max(0, Math.floor(Number(stock) || 0)),
        askSize: false,
        options,
        variants,
        images: readySlots.map((s) => ({
          originalBase64: s.originalBase64!,
          cropBase64: s.cropBase64!,
          alreadyPreviewed: true,
        })),
      }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string; product?: ProductRow } | null;
    setSaving(false);
    if (!res.ok) {
      setError(body?.error ?? "Couldn't save.");
      return;
    }
    for (const s of slots) URL.revokeObjectURL(s.previewUrl);
    setName("");
    setProductType("");
    setDescription("");
    setOptions([]);
    setVariants([]);
    setSlots([]);
    setOpen(false);
    onCreated(body?.product);
  }

  if (!open) {
    return (
      <Button
        color="primary"
        className="w-fit"
        iconLeading={<ImagePlus data-icon className="size-4" />}
        onClick={() => setOpen(true)}
      >
        Add product
      </Button>
    );
  }

  return (
    <Card className="border-brand/30 shadow-sm">
      <CardHeader className="border-b border-secondary/70">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>New product</CardTitle>
            <CardDescription>
              Photos are compressed client-side, segmented in parallel with Meta SAM 3.1, and indexed in one PE batch.
            </CardDescription>
          </div>
          <Button type="button" size="xs" color="tertiary" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void confirm(event)} className="grid gap-4 sm:grid-cols-2">
          {error ? (
            <div className="sm:col-span-2">
              <Alert color="error">{error}</Alert>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-name">Name</Label>
            <Input
              id="product-name"
              value={name}
              onChange={setName}
              placeholder="e.g. Oversized Olive Hoodie"
              aria-label="Name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-category">Product type</Label>
            <Input
              id="product-category"
              value={productType}
              onChange={setProductType}
              placeholder="Hoodie, phone, honey…"
              aria-label="Product type"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="product-description">Description</Label>
            <textarea
              id="product-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Short note buyers and you can both read"
              rows={2}
              className="rounded-lg bg-primary px-3 py-2 text-sm text-primary ring-1 ring-secondary outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product-price">Price (DT)</Label>
              <Input
                id="product-price"
                value={priceDt}
                onChange={setPriceDt}
                inputMode="decimal"
                inputClassName="font-mono tabular-nums"
                aria-label="Price"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product-floor">Floor (DT)</Label>
              <Input
                id="product-floor"
                value={floorDt}
                onChange={setFloorDt}
                inputMode="decimal"
                inputClassName="font-mono tabular-nums"
                aria-label="Floor"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product-stock">Stock</Label>
              <Input
                id="product-stock"
                value={options.length > 0 ? String(variants.reduce((sum, variant) => sum + variant.stock, 0)) : stock}
                onChange={setStock}
                inputMode="numeric"
                isDisabled={options.length > 0}
                inputClassName="font-mono tabular-nums"
                aria-label="Stock"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <OptionsEditor
              initialOptions={[]}
              initialVariants={[]}
              onChange={(next) => {
                setOptions(next.options);
                setVariants(next.variants);
              }}
            />
          </div>

          <div className="flex flex-col gap-2.5 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="product-photos">Photos ({readySlots.length}/6 ready)</Label>
              {cuttingCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-secondary">
                  <Sparkles className="size-3.5 animate-spin" />
                  Cutting out {cuttingCount} in parallel…
                </span>
              ) : null}
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
                dragging
                  ? "border-brand bg-brand-primary/50"
                  : "border-secondary bg-secondary/40 hover:bg-secondary"
              }`}
            >
              <ImagePlus className="size-5 text-brand-secondary" />
              <p className="text-sm font-medium text-primary">
                Drop up to 6 product photos here, or <span className="text-brand-secondary underline">browse</span>
              </p>
              <p className="text-xs text-tertiary">JPG, PNG, or WebP · auto-resized &amp; segmented with SAM 3.1</p>
              <input
                ref={fileInputRef}
                id="product-photos"
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => {
                  void addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>

            {slots.length > 0 ? (
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
                {slots.map((slot, index) => {
                  const displaySrc = slot.cropBase64
                    ? `data:image/png;base64,${slot.cropBase64}`
                    : slot.previewUrl;
                  return (
                    <div
                      key={slot.id}
                      className="group relative overflow-hidden rounded-xl border border-secondary bg-tertiary aspect-square"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={displaySrc} alt="" className="size-full object-cover" />
                      {slot.status === "cutting" ? (
                        <div className="absolute inset-0 grid place-items-center bg-black/45 text-[11px] font-semibold text-white backdrop-blur-[1px]">
                          SAM 3.1…
                        </div>
                      ) : null}
                      {slot.status === "error" ? (
                        <div className="absolute inset-0 grid place-items-center bg-error-solid/85 p-1 text-center text-[10px] font-semibold text-white">
                          {slot.errorMsg ?? "Failed"}
                        </div>
                      ) : null}
                      {slot.status === "ready" ? (
                        <button
                          type="button"
                          onClick={() => promoteCover(slot.id)}
                          className={`absolute bottom-1 left-1 inline-flex cursor-pointer items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shadow-xs ${
                            index === 0
                              ? "bg-brand-solid text-white"
                              : "bg-primary/90 text-secondary hover:bg-primary"
                          }`}
                        >
                          {index === 0 ? (
                            <>
                              <Check className="size-2.5" />
                              Cover
                            </>
                          ) : (
                            "Set cover"
                          )}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeSlot(slot.id)}
                        aria-label="Remove photo"
                        className="absolute top-1 right-1 grid size-6 cursor-pointer place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      >
                        <XClose className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit" isDisabled={saving || cuttingCount > 0 || readySlots.length === 0}>
              {saving ? "Indexing & saving…" : "Save product"}
            </Button>
            <Button type="button" color="secondary" isDisabled={saving} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
