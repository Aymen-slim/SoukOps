"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, ImagePlus, Layers, Scissors, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function extOf(file: File): "jpg" | "png" | "webp" {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "png" || ext === "webp") return ext;
  return "jpg";
}

export function CatalogClient() {
  const [phrase, setPhrase] = useState("hoodie");
  const [file, setFile] = useState<File | null>(null);
  const [originalBase64, setOriginalBase64] = useState<string | null>(null);
  const [cropBase64, setCropBase64] = useState<string | null>(null);
  const [usedOriginal, setUsedOriginal] = useState(false);
  const [name, setName] = useState("");
  const [priceDt, setPriceDt] = useState("120");
  const [floorDt, setFloorDt] = useState("105");
  const [stock, setStock] = useState("4");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function preview(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setCropBase64(null);
    const imageBase64 = await fileToBase64(file);
    setOriginalBase64(imageBase64);
    const res = await fetch("/api/dashboard/catalog/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64, mediaExt: extOf(file), categoryPhrase: phrase }),
    });
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      cropBase64?: string;
      usedOriginal?: boolean;
    } | null;
    setBusy(false);
    if (!res.ok || !body?.cropBase64) {
      setError(body?.error ?? "Preview failed.");
      return;
    }
    setCropBase64(body.cropBase64);
    setUsedOriginal(Boolean(body.usedOriginal));
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!cropBase64 || !originalBase64) return;
    const priceMillimes = Math.round(Number(priceDt) * 1000);
    const floorMillimes = Math.round(Number(floorDt) * 1000);
    if (!name.trim() || !Number.isFinite(priceMillimes) || !Number.isFinite(floorMillimes)) {
      setError("Name and price are required.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/dashboard/catalog/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        categoryPhrase: phrase,
        priceMillimes,
        floorMillimes,
        stock: Math.max(0, Math.floor(Number(stock) || 0)),
        cropBase64,
        originalBase64,
      }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string; name?: string } | null;
    setBusy(false);
    if (!res.ok) {
      setError(body?.error ?? "Couldn't save.");
      return;
    }
    setMessage(`${body?.name ?? name} is in the catalog.`);
    setCropBase64(null);
    setFile(null);
  }

  const maxDiscountDt = Math.max(0, (Number(priceDt) || 0) - (Number(floorDt) || 0));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-terracotta uppercase">
            Vision &amp; Vector Index
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Catalog
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Photo, cutout, then save. The embedding runs only after you confirm.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="info" className="font-mono">SAM 3.1 Cutout</Badge>
          <Badge variant="outline" className="font-mono">PE 1024-dim</Badge>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-fg">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="flex items-center gap-2 rounded-xl border border-status-success-border bg-status-success-bg px-4 py-2.5 text-sm font-medium text-status-success-fg">
          <CheckCircle2 className="size-4" />
          {message}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-fit">
          <CardHeader className="border-b border-border/70">
            <CardTitle className="flex items-center gap-2">
              <ImagePlus className="size-4 text-brand-terracotta" />
              New photo
            </CardTitle>
            <CardDescription>
              Blur check runs first, then SAM 3.1 isolates the garment on a clean studio canvas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void preview(event)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="photo">Photo</Label>
                <Input
                  id="photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phrase">Category (short English, for the cutout)</Label>
                <Input
                  id="phrase"
                  value={phrase}
                  onChange={(event) => setPhrase(event.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy || !file} className="w-fit">
                <Scissors className="size-3.5" />
                Preview cutout
              </Button>
            </form>
          </CardContent>
        </Card>

        {cropBase64 ? (
          <Card>
            <CardHeader className="border-b border-border/70">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-brand-cobalt" />
                Preview
              </CardTitle>
              <CardDescription>
                Verify the SAM cutout and set the deterministic floor price before embedding.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(event) => void confirm(event)} className="flex flex-col gap-4">
                {usedOriginal ? (
                  <p className="text-xs text-status-warning-fg">
                    No cutout found. The full photo will be used.
                  </p>
                ) : null}
                <div className="flex justify-center rounded-2xl border border-border bg-checkerboard p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/png;base64,${cropBase64}`}
                    alt="Cutout preview"
                    className="size-52 rounded-xl object-contain"
                  />
                </div>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="price">Price (DT)</Label>
                    <Input
                      id="price"
                      value={priceDt}
                      onChange={(event) => setPriceDt(event.target.value)}
                      inputMode="decimal"
                      className="font-mono tabular-nums"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="floor">Floor (DT)</Label>
                    <Input
                      id="floor"
                      value={floorDt}
                      onChange={(event) => setFloorDt(event.target.value)}
                      inputMode="decimal"
                      className="font-mono tabular-nums"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="stock">Stock</Label>
                    <Input
                      id="stock"
                      value={stock}
                      onChange={(event) => setStock(event.target.value)}
                      inputMode="numeric"
                      className="font-mono tabular-nums"
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <div className="rounded-lg bg-muted/65 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">Max negotiation room: </span>
                      <span className="font-mono font-semibold tabular-nums text-foreground">
                        {maxDiscountDt} DT
                      </span>
                    </div>
                  </div>
                </div>
                <Button type="submit" variant="brand" disabled={busy}>
                  <Layers className="size-4" />
                  Save to catalog
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
