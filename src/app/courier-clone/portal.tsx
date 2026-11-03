"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Scan as Barcode, Lock01 as Lock, PackagePlus, Printer } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/foundations/card/card";
import { Input } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { Alert } from "@/components/foundations/alert/alert";

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
      setError("Invalid credentials.");
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next") || "/courier-clone/nouveau";
    router.push(next.startsWith("/courier-clone/") ? next : "/courier-clone/nouveau");
  }

  function onClick(event: { preventDefault(): void; target: EventTarget | null }) {
    event.preventDefault();
    const form = (event.target as HTMLElement | null)?.closest("form");
    if (!form || sending) return;
    void submit(form);
  }

  return (
    <Card className="mx-auto w-full max-w-md bg-primary">
      <CardHeader className="border-b border-secondary">
        <CardTitle className="flex items-center gap-2 text-primary">
          <Lock className="size-4 text-brand-secondary" />
          Agent login
        </CardTitle>
        <CardDescription>Secure access to the First Delivery shipping portal.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3.5" onSubmit={(event) => event.preventDefault()}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user">Username</Label>
            <Input aria-label="Username" id="user" name="user" autoComplete="username" isRequired inputClassName="bg-primary" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input aria-label="Password"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              isRequired
              inputClassName="bg-primary"
            />
          </div>
          {error ? (
            <Alert color="error">{error}</Alert>
          ) : null}
          <Button type="submit" isDisabled={sending} onClick={onClick} className="bg-brand-solid text-white hover:bg-brand-solid/90">
            Log in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const FIELDS: Array<{ name: string; label: string; mono?: boolean }> = [
  { name: "clientName", label: "Customer name" },
  { name: "phone", label: "Phone", mono: true },
  { name: "governorate", label: "Governorate" },
  { name: "delegation", label: "Delegation" },
  { name: "localityId", label: "locality_id", mono: true },
  { name: "landmark", label: "Landmark" },
  { name: "floor", label: "Floor" },
  { name: "driverNote", label: "Driver note" },
  { name: "lat", label: "Latitude", mono: true },
  { name: "lng", label: "Longitude", mono: true },
  { name: "prixMillimes", label: "Price (millimes, delivery included)", mono: true },
  { name: "designation", label: "Designation" },
  { name: "orderId", label: "Order", mono: true },
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
      setError(body?.error ?? "Creation refused.");
      return;
    }
    router.push(`/courier-clone/colis/${body.barcode}`);
  }

  function onClick(event: { preventDefault(): void; target: EventTarget | null }) {
    event.preventDefault();
    const form = (event.target as HTMLElement | null)?.closest("form");
    if (!form || sending) return;
    void submit(form);
  }

  if (!ready) return <p className="text-sm text-tertiary">Connecting to the portal…</p>;

  return (
    <Card className="bg-primary">
      <CardHeader className="border-b border-secondary">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-primary">
              <PackagePlus className="size-4 text-brand-secondary" />
              New parcel
            </CardTitle>
            <CardDescription>
              Waybill entry with mandatory validation of <code>locality_id</code>.
            </CardDescription>
          </div>
          <Badge color="gray" className="font-mono">
            13 fields
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
                aria-label={field.label}
                className={`bg-primary ${field.mono ? "font-mono tabular-nums" : ""}`}
              />
            </div>
          ))}
          {error ? (
            <Alert color="error">{error}</Alert>
          ) : null}
          <div className="pt-2 sm:col-span-2">
            <Button
              type="submit"
              isDisabled={sending}
              onClick={onClick}
              className="bg-brand-solid text-white hover:bg-brand-solid/90"
            >
              Create parcel
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
        setError(data?.error ?? "Parcel not found.");
        return;
      }
      setParcel(data);
    });
  }, [barcode]);

  if (error) return <Alert color="error">{error}</Alert>;
  if (!parcel) return <p className="text-sm text-tertiary">Loading parcel…</p>;
  const fields = parcel.fields ?? {};

  return (
    <Card className="bg-primary">
      <CardHeader className="border-b border-secondary">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-primary">
            <Barcode className="size-4 text-brand-secondary" />
            Parcel {barcode}
          </CardTitle>
          <Badge color="success" className="font-mono">Saved</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p className="rounded-xl bg-secondary px-3.5 py-2">
          Code <span className="font-mono font-semibold">{barcode}</span>
        </p>
        <dl className="grid gap-1.5">
          {Object.entries(fields).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-4 border-b border-secondary py-1.5">
              <dt className="font-mono text-xs text-tertiary">{key}</dt>
              <dd className="text-right font-medium text-primary">
                {value == null || value === "" ? "—" : String(value)}
              </dd>
            </div>
          ))}
        </dl>
        <a
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-brand-solid px-4 py-2 text-xs font-semibold text-white underline-offset-4 hover:bg-brand-solid/90"
          href={parcel.printUrl}
        >
          <Printer className="size-3.5" />
          Print waybill
        </a>
      </CardContent>
    </Card>
  );
}
