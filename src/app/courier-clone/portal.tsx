"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Barcode, Lock, PackagePlus, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(form: HTMLFormElement) {
    setSending(true);
    setError(null);
    const data = new FormData(form);
    const res = await fetch("/api/courier-clone/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: data.get("user"), password: data.get("password") }),
    });
    if (!res.ok) {
      setSending(false);
      setError("Identifiants refusés.");
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next") || "/courier-clone/nouveau";
    router.push(next.startsWith("/courier-clone/") ? next : "/courier-clone/nouveau");
  }

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const form = event.currentTarget.form;
    if (!form || sending) return;
    void submit(form);
  }

  return (
    <Card className="mx-auto w-full max-w-md bg-white">
      <CardHeader className="border-b border-slate-200">
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <Lock className="size-4 text-[#093552]" />
          Connexion agent
        </CardTitle>
        <CardDescription>Accès sécurisé au portail d&apos;expédition First Delivery.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3.5" onSubmit={(event) => event.preventDefault()}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user">Identifiant</Label>
            <Input id="user" name="user" autoComplete="username" required className="bg-white" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="bg-white"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={sending} onClick={onClick} className="bg-[#093552] text-white hover:bg-[#093552]/90">
            Se connecter
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const FIELDS: Array<{ name: string; label: string; mono?: boolean }> = [
  { name: "clientName", label: "Nom du client" },
  { name: "phone", label: "Téléphone", mono: true },
  { name: "governorate", label: "Gouvernorat" },
  { name: "delegation", label: "Délégation" },
  { name: "localityId", label: "locality_id", mono: true },
  { name: "landmark", label: "Repère" },
  { name: "floor", label: "Étage" },
  { name: "driverNote", label: "Note livreur" },
  { name: "lat", label: "Latitude", mono: true },
  { name: "lng", label: "Longitude", mono: true },
  { name: "prixMillimes", label: "Prix (millimes, livraison comprise)", mono: true },
  { name: "designation", label: "Désignation" },
  { name: "orderId", label: "Commande", mono: true },
];

export function ParcelForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancel = false;
    void fetch("/api/courier-clone/session").then((res) => {
      if (cancel) return;
      if (!res.ok) {
        router.replace("/courier-clone/login?next=/courier-clone/nouveau");
        return;
      }
      setReady(true);
    });
    return () => {
      cancel = true;
    };
  }, [router]);

  async function submit(form: HTMLFormElement) {
    setSending(true);
    setError(null);
    const data = new FormData(form);
    const str = (key: string) => String(data.get(key) ?? "").trim();
    const optional = (key: string) => str(key) || null;
    const res = await fetch("/api/fd-mock/v2/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: str("clientName"),
        phone: str("phone"),
        governorate: str("governorate"),
        delegation: optional("delegation"),
        localityId: Number(str("localityId")),
        landmark: str("landmark"),
        floor: optional("floor"),
        driverNote: optional("driverNote"),
        lat: Number(str("lat")),
        lng: Number(str("lng")),
        prixMillimes: Number(str("prixMillimes")),
        designation: str("designation"),
        orderId: str("orderId"),
      }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string; barcode?: string } | null;
    if (!res.ok || !body?.barcode) {
      setSending(false);
      setError(body?.error ?? "Création refusée.");
      return;
    }
    router.push(`/courier-clone/colis/${body.barcode}`);
  }

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const form = event.currentTarget.form;
    if (!form || sending) return;
    void submit(form);
  }

  if (!ready) return <p className="text-sm text-slate-600">Connexion au portail…</p>;

  return (
    <Card className="bg-white">
      <CardHeader className="border-b border-slate-200">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <PackagePlus className="size-4 text-[#093552]" />
              Nouveau colis
            </CardTitle>
            <CardDescription>
              Saisie du bordereau d&apos;expédition avec validation obligatoire de <code>locality_id</code>.
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono">
            13 champs
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3.5 sm:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
          {FIELDS.map((field) => (
            <div key={field.name} className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>{field.label}</Label>
              <Input
                id={field.name}
                name={field.name}
                className={`bg-white ${field.mono ? "font-mono tabular-nums" : ""}`}
              />
            </div>
          ))}
          {error ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {error}
            </p>
          ) : null}
          <div className="pt-2 sm:col-span-2">
            <Button
              type="submit"
              disabled={sending}
              onClick={onClick}
              className="bg-[#093552] text-white hover:bg-[#093552]/90"
            >
              Créer le colis
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function ColisView({ barcode }: { barcode: string }) {
  const [parcel, setParcel] = useState<{ fields: Record<string, unknown>; printUrl: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/fd-mock/v2/parcels/${barcode}`).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Colis introuvable.");
        return;
      }
      setParcel(data);
    });
  }, [barcode]);

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!parcel) return <p className="text-sm text-slate-600">Chargement du colis…</p>;
  const fields = parcel.fields ?? {};

  return (
    <Card className="bg-white">
      <CardHeader className="border-b border-slate-200">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Barcode className="size-4 text-[#093552]" />
            Colis {barcode}
          </CardTitle>
          <Badge variant="success" className="font-mono">Enregistré</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p className="rounded-xl bg-slate-100 px-3.5 py-2">
          Code <span className="font-mono font-semibold">{barcode}</span>
        </p>
        <dl className="grid gap-1.5">
          {Object.entries(fields).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-4 border-b border-slate-200/80 py-1.5">
              <dt className="font-mono text-xs text-slate-500">{key}</dt>
              <dd className="text-right font-medium text-slate-900">
                {value == null || value === "" ? "—" : String(value)}
              </dd>
            </div>
          ))}
        </dl>
        <a
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-[#093552] px-4 py-2 text-xs font-semibold text-white underline-offset-4 hover:bg-[#093552]/90"
          href={parcel.printUrl}
        >
          <Printer className="size-3.5" />
          Imprimer le bordereau
        </a>
      </CardContent>
    </Card>
  );
}
