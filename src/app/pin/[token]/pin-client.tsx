"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { CheckCircle as CheckCircle2, ChevronDown, ChevronUp, Target03 as LocateFixed, MarkerPin01 as MapPin } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Input } from "@/components/base/input/input";
import type { PendingAddress } from "@/lib/pipeline/address";

/** Same box the confirmation API accepts (Tunisia). */
function inTunisia(lat: number, lng: number): boolean {
  return lat >= 30 && lat <= 38 && lng >= 7 && lng <= 12;
}

/** Pin sits above the sheet, so it is not the geometric center of the map. */
const PIN_LIFT = 108;

type MapHandle = {
  remove: () => void;
  setView: (center: [number, number], zoom: number) => MapHandle;
  panBy: (offset: [number, number], options?: { animate?: boolean }) => MapHandle;
  getSize: () => { x: number; y: number };
  containerPointToLatLng: (point: { x: number; y: number }) => { lat: number; lng: number };
  invalidateSize: () => void;
  on: (event: string, handler: () => void) => void;
};

export default function PinClient({ token, pending }: { token: string; pending: PendingAddress }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<MapHandle | null>(null);
  const [coords, setCoords] = useState({ lat: pending.lat, lng: pending.lng });
  const [floor, setFloor] = useState("");
  const [driverNote, setDriverNote] = useState("");
  const [details, setDetails] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  const pinOk = inTunisia(coords.lat, coords.lng);

  useEffect(() => {
    const container = mapRef.current;
    if (!container) return;
    let cancelled = false;

    void (async () => {
      try {
        const L = await import("leaflet");
        if (cancelled || !container.isConnected) return;
        const node = container as HTMLElement & { _leaflet_id?: number };
        if (node._leaflet_id != null) return;

        const leafletMap = L.map(container, { zoomControl: false }).setView([pending.lat, pending.lng], 17);
        if (cancelled) {
          leafletMap.remove();
          return;
        }
        const map = leafletMap as unknown as MapHandle;
        mapInstance.current = map;
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 19,
        }).addTo(leafletMap);
        map.panBy([0, PIN_LIFT], { animate: false });

        const read = () => {
          const size = map.getSize();
          if (size.x < 10 || size.y < 10) return;
          const under = map.containerPointToLatLng({ x: size.x / 2, y: size.y / 2 - PIN_LIFT });
          if (!Number.isFinite(under.lat) || !Number.isFinite(under.lng)) return;
          setCoords({ lat: under.lat, lng: under.lng });
        };
        map.on("move", read);
        map.on("zoomend", read);
        read();
        window.setTimeout(() => {
          map.invalidateSize();
          read();
        }, 80);
      } catch {
        if (!cancelled) setMapFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, [pending.lat, pending.lng]);

  function focus(lat: number, lng: number, zoom = 17) {
    const map = mapInstance.current;
    if (!map) return;
    map.setView([lat, lng], zoom);
    map.panBy([0, PIN_LIFT], { animate: false });
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setGeoMessage("This browser can't share your location. Drag the map to your door.");
      return;
    }
    setLocating(true);
    setGeoMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!inTunisia(next.lat, next.lng)) {
          setGeoMessage("That location is outside Tunisia. Drag the map to your door.");
          return;
        }
        setCoords(next);
        focus(next.lat, next.lng);
      },
      () => {
        setLocating(false);
        setGeoMessage("Location blocked. Allow it, or drag the map to your door.");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  }

  async function confirm() {
    if (!pinOk) return;
    setState("sending");
    setErrorDetail(null);
    const res = await fetch(`/api/pin/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: coords.lat, lng: coords.lng, floor: floor || null, driverNote: driverNote || null }),
    });
    if (res.ok) {
      mapInstance.current?.remove();
      mapInstance.current = null;
      setState("done");
      return;
    }
    setState("error");
    setErrorDetail(
      res.status === 400
        ? "Keep the pin inside Tunisia, then confirm."
        : "This link expired or was already used. Go back to the chat and ask for a new one.",
    );
  }

  if (state === "done") {
    return (
      <div className="grid h-dvh place-items-center bg-dot-grid px-6">
        <div className="max-w-sm rounded-3xl border border-secondary bg-primary p-8 text-center shadow-lg">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-success-primary text-success-primary ring-1 ring-utility-green-200">
            <CheckCircle2 className="size-6" />
          </div>
          <p className="mt-4 text-[11px] font-semibold tracking-[0.18em] text-tertiary uppercase">
            Wassalha
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary">
            Location saved
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-tertiary">
            Head back to the chat. Your order summary is waiting there.
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-tertiary px-3 py-1 font-mono text-xs tabular-nums text-primary">
            <MapPin className="size-3.5 text-brand-secondary" />
            {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#e7e2d8]">
      {mapFailed ? (
        <div className="grid h-full place-items-center px-6 text-center text-sm text-stone-700">
          The map didn&apos;t open. You can still confirm the landmark, or reload the page.
        </div>
      ) : (
        <div ref={mapRef} className="pin-map absolute inset-0" />
      )}

      {/* Top Floating Coordinate HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-4 z-[500] flex justify-center px-4">
        <div className="flex items-center gap-2.5 rounded-full border border-secondary/90 bg-primary/90 px-4 py-1.5 shadow-md backdrop-blur-md">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary-solid text-[10px] font-bold text-brand-200">
            W
          </span>
          <span className="text-xs font-semibold text-primary">Wassalha Pin</span>
          <span className="font-mono text-xs tabular-nums text-tertiary">
            {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
          </span>
        </div>
      </div>

      {/* Central Target Pin */}
      <div className="pointer-events-none absolute top-[calc(50%-108px)] left-1/2 z-[500] -translate-x-1/2 -translate-y-full">
        <div className="flex flex-col items-center drop-shadow-[0_10px_14px_rgba(28,25,23,0.32)]">
          <div className="relative size-11 rounded-full bg-primary-solid ring-4 ring-white">
            <span className="absolute top-1/2 left-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-solid" />
          </div>
          <span className="-mt-1.5 size-3.5 rotate-45 bg-primary-solid" />
          <span className="mt-1 h-1.5 w-5 rounded-full bg-black/25 blur-[1px]" />
        </div>
      </div>

      {/* Locate Me Button */}
      <button
        type="button"
        onClick={locateMe}
        disabled={locating || mapFailed}
        aria-label="Use my location"
        className="absolute right-4 bottom-[248px] z-[500] grid size-12 cursor-pointer place-items-center rounded-full bg-primary text-primary shadow-lg ring-1 ring-secondary transition-transform duration-150 ease-linear hover:bg-tertiary active:scale-[0.96] disabled:opacity-50"
      >
        <LocateFixed className={`size-5 ${locating ? "animate-pulse text-brand-secondary" : ""}`} />
      </button>

      {/* Bottom Sheet */}
      <div className="absolute inset-x-0 bottom-0 z-[500]">
        <div className="mx-auto w-full max-w-lg rounded-t-[28px] border-t border-secondary bg-primary px-5 pt-3 pb-6 shadow-[0_-12px_40px_rgba(28,25,23,0.14)]">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold tracking-wider text-brand-secondary uppercase">
              Deliver here
            </p>
            {pending.governorate ? (
              <Badge color="gray" className="text-[11px]">
                {pending.governorate}
              </Badge>
            ) : null}
          </div>

          <h1 className="mt-1 text-lg font-semibold tracking-tight text-primary">
            Near {pending.landmarkName}
          </h1>
          <p className="mt-0.5 text-sm text-tertiary">
            Drag the map until the pin sits directly on your door.
          </p>

          {geoMessage ? <p className="mt-2 text-xs font-medium text-warning-primary">{geoMessage}</p> : null}
          {!pinOk ? <p className="mt-2 text-xs font-medium text-error-primary">Keep the pin inside Tunisia.</p> : null}
          {state === "error" && errorDetail ? (
            <p className="mt-2 text-xs font-medium text-error-primary">{errorDetail}</p>
          ) : null}

          <button
            type="button"
            className="mt-3 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-tertiary transition-colors hover:text-primary"
            onClick={() => setDetails((open) => !open)}
          >
            <span>{details ? "Hide details" : "Floor or a note for the driver"}</span>
            {details ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>

          {details ? (
            <div className="mt-2.5 flex flex-col gap-2">
              <Input
                value={floor}
                onChange={setFloor}
                placeholder="Floor / apartment"
                inputClassName="h-10"
              />
              <Input
                value={driverNote}
                onChange={setDriverNote}
                placeholder="Blue door, call when you arrive"
                inputClassName="h-10"
              />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void confirm()}
            disabled={state === "sending" || !pinOk}
            className="mt-4 h-12 w-full cursor-pointer rounded-full bg-brand-solid text-sm font-semibold text-primary shadow-[0_2px_8px_rgba(28,25,23,0.14)] transition-[transform,filter] duration-150 ease-linear hover:brightness-95 active:scale-[0.98] disabled:opacity-50"
          >
            {state === "sending" ? "Saving…" : "Confirm this spot"}
          </button>
        </div>
      </div>
    </div>
  );
}
