"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { Toggle } from "@/components/base/toggle/toggle";
import { Alert } from "@/components/foundations/alert/alert";
import { prepareImageForUpload } from "@/lib/media/client-image";
import { samPhrase } from "@/lib/domain/catalog-options";
import { invalidateDashboardUrl } from "../../use-poll";
import { OptionsEditor, type SellerOption, type SellerVariant } from "../options-editor";

interface ProductImage {
  id: string;
  url: string | null;
  isPrimary: boolean;
}

interface Product {
  id: string;
  name: string;
  category: string;
  productType?: string;
  description?: string;
  sizePolicy?: "required" | "none" | "options";
  priceMillimes: number;
  floorMillimes: number;
  stock: number;
  aiEnabled: boolean;
  options?: SellerOption[];
  variants?: SellerVariant[];
  images: ProductImage[];
}

export function ProductEditor({ id }: { id: string }) {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [productType, setProductType] = useState("");
  const [description, setDescription] = useState("");
  const [priceDt, setPriceDt] = useState("");
  const [floorDt, setFloorDt] = useState("");
  const [stock, setStock] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [askSize, setAskSize] = useState(false);
  const [options, setOptions] = useState<SellerOption[]>([]);
  const [variants, setVariants] = useState<SellerVariant[]>([]);
  const [editorKey, setEditorKey] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/dashboard/catalog/${id}`);
    const body = (await res.json().catch(() => null)) as { product?: Product; error?: string } | null;
    if (!res.ok || !body?.product) {
      setError(body?.error ?? "Product not found.");
      return;
    }
    setProduct(body.product);
    setName(body.product.name);
    setProductType(body.product.productType || body.product.category);
    setDescription(body.product.description ?? "");
    setPriceDt(String(body.product.priceMillimes / 1000));
    setFloorDt(String(body.product.floorMillimes / 1000));
    setStock(String(body.product.stock));
    setAiEnabled(body.product.aiEnabled);
    setAskSize(body.product.sizePolicy === "required");
    setOptions(body.product.options ?? []);
    setVariants(body.product.variants ?? []);
    setEditorKey((key) => key + 1);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const priceMillimes = Math.round(Number(priceDt) * 1000);
    const floorMillimes = Math.round(Number(floorDt) * 1000);
    setBusy(true);
    setSaved(false);
    setError(null);
    const res = await fetch(`/api/dashboard/catalog/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        productType: productType.trim(),
        category: productType.trim() || "General",
        description: description.trim(),
        priceMillimes,
        floorMillimes,
        stock: options.length > 0 ? variants.reduce((sum, variant) => sum + variant.stock, 0) : Math.max(0, Math.floor(Number(stock) || 0)),
        aiEnabled,
        askSize: options.length > 0 ? false : askSize,
        options,
        variants,
      }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res.ok) {
      setError(body?.error ?? "Couldn't save.");
      return;
    }
    invalidateDashboardUrl("/api/dashboard/catalog");
    setSaved(true);
    await load();
  }

  async function addPhoto(file: File | undefined) {
    if (!file || !productType.trim()) {
      if (!productType.trim()) setError("Add a product type before another photo.");
      return;
    }
    setBusy(true);
    setError(null);
    const prep = await prepareImageForUpload(file);
    URL.revokeObjectURL(prep.previewUrl);
    const preview = await fetch("/api/dashboard/catalog/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: prep.base64, mediaExt: prep.mediaExt, categoryPhrase: samPhrase(productType) }),
    });
    const previewBody = (await preview.json().catch(() => null)) as { error?: string; cropBase64?: string } | null;
    if (!preview.ok || !previewBody?.cropBase64) {
      setBusy(false);
      setError(previewBody?.error ?? "Preview failed.");
      return;
    }
    const res = await fetch(`/api/dashboard/catalog/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalBase64: prep.base64, cropBase64: previewBody.cropBase64 }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res.ok) {
      setError(body?.error ?? "Couldn't add the photo.");
      return;
    }
    invalidateDashboardUrl("/api/dashboard/catalog");
    await load();
  }

  async function remove() {
    if (!window.confirm("Delete this product?")) return;
    setBusy(true);
    const res = await fetch(`/api/dashboard/catalog/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Couldn't delete.");
      return;
    }
    invalidateDashboardUrl("/api/dashboard/catalog");
    router.push("/dashboard/catalog");
  }

  if (!product && !error) return <p className="text-sm text-tertiary">Loading the product…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard/catalog" className="text-xs font-medium text-tertiary hover:text-primary">
          ← Products
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary">{name || "Product"}</h1>
      </div>
      {error ? <Alert color="error">{error}</Alert> : null}
      {saved ? <Alert color="success">Saved.</Alert> : null}
      <div className="flex flex-wrap gap-3">
        {(product?.images ?? []).map((image) =>
          image.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={image.id}
              src={image.url}
              alt=""
              loading="lazy"
              className="size-28 rounded-xl object-cover ring-1 ring-secondary"
            />
          ) : null,
        )}
      </div>
      <label className="text-sm font-medium text-secondary">
        Add another photo
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          className="mt-1 block text-sm text-tertiary"
          onChange={(event) => void addPhoto(event.target.files?.[0])}
        />
      </label>
      <form onSubmit={(event) => void save(event)} className="grid max-w-xl gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-name">Name</Label>
          <Input id="edit-name" value={name} onChange={setName} aria-label="Name" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-category">Product type</Label>
          <Input
            id="edit-category"
            value={productType}
            onChange={setProductType}
            placeholder="Hoodie, phone, honey…"
            aria-label="Product type"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-description">Description</Label>
          <textarea
            id="edit-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="rounded-lg bg-primary px-3 py-2 text-sm text-primary ring-1 ring-secondary outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-price">Price (DT)</Label>
            <Input
              id="edit-price"
              value={priceDt}
              onChange={setPriceDt}
              inputClassName="font-mono tabular-nums"
              aria-label="Price"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-floor">Floor (DT)</Label>
            <Input
              id="edit-floor"
              value={floorDt}
              onChange={setFloorDt}
              inputClassName="font-mono tabular-nums"
              aria-label="Floor"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-stock">Stock</Label>
            <Input
              id="edit-stock"
              value={options.length > 0 ? String(variants.reduce((sum, variant) => sum + variant.stock, 0)) : stock}
              onChange={setStock}
              isDisabled={options.length > 0}
              inputClassName="font-mono tabular-nums"
              aria-label="Stock"
            />
          </div>
        </div>
        <OptionsEditor
          key={editorKey}
          initialOptions={options}
          initialVariants={variants}
          onChange={(next) => {
            setOptions(next.options);
            setVariants(next.variants);
          }}
        />
        {options.length === 0 ? (
          <Toggle size="sm" label="Ask the buyer for a size" isSelected={askSize} onChange={setAskSize} />
        ) : null}
        <Toggle size="sm" label="AI on this product" isSelected={aiEnabled} onChange={setAiEnabled} />
        <div className="flex gap-2">
          <Button type="submit" isDisabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button type="button" color="secondary" isDisabled={busy} onClick={() => void remove()}>
            Delete product
          </Button>
        </div>
      </form>
    </div>
  );
}
