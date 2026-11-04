"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import {
  CheckCircle as CheckCircle2,
  ChevronDown,
  ChevronUp,
  Target03 as LocateFixed,
  MarkerPin01 as MapPin,
  SearchLg,
  Stars01 as Sparkles,
  XClose,
} from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Input } from "@/components/base/input/input";
import type { PendingAddress } from "@/lib/pipeline/address";

/** Same box the confirmation API accepts (Tunisia). */
function inTunisia(lat: number, lng: number): boolean {
  return lat >= 30 && lat <= 38 && lng >= 7 && lng <= 12;
}

/** Distance label between the current pin and a candidate ("450 m" / "1.2 km"). */
function distanceLabel(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(to.lat - from.lat);
  const dLng = rad(to.lng - from.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
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

/** Minimal Google Maps JS surface used by the pin page (no @types/google.maps). */
interface GoogleLatLng {
  lat: () => number;
  lng: () => number;
}
interface GoogleProjection {
  fromContainerPixelToLatLng: (point: { x: number; y: number }) => GoogleLatLng | null;
}
interface GoogleOverlayView {
  setMap: (map: GoogleMap | null) => void;
  getProjection: () => GoogleProjection | undefined;
  onAdd?: () => void;
  onRemove?: () => void;
  draw?: () => void;
}
interface GoogleMap {
  setCenter: (center: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  addListener: (event: string, handler: () => void) => { remove: () => void };
}
interface GoogleMapsNamespace {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMap;
    OverlayView: new () => GoogleOverlayView;
  };
}

/** Dashboard map declares `Window.google`; read through a cast to avoid redeclaring it. */
function googleNamespace(): GoogleMapsNamespace | undefined {
  return (window as unknown as { google?: GoogleMapsNamespace }).google;
}

interface SearchCandidate {
  id: string;
  name: string;
  governorate: string | null;
  delegation: string | null;
  lat: number;
  lng: number;
  source: string;
}

interface SearchResponse {
  candidates: SearchCandidate[];
  triangulated: { a: string; b: string; distanceKm: number; midpoint: { lat: number; lng: number } } | null;
  floor: string | null;
  driverNote: string | null;
  aiUsed: boolean;
}

function sourceBadgeMeta(source: string): { label: string; color: "success" | "brand" | "blue" | "gray" } {
  if (source === "triangulated" || source === "ai_triangulated") {
    return { label: "Triangulated midpoint", color: "brand" };
  }
  if (source === "snapshot" || source === "choice") {
    return { label: "Matched landmark", color: "success" };
  }
  if (source === "google") {
    return { label: "Google Maps", color: "blue" };
  }
  if (source === "buyer_manual") {
    return { label: "Place your pin", color: "gray" };
  }
  if (source === "ai_description" || source === "nominatim") {
    return { label: "AI + OpenStreetMap", color: "blue" };
  }
  return { label: "Neighborhood", color: "gray" };
}

export default function PinClient({
  token,
  pending,
  mapsKey,
}: {
  token: string;
  pending: PendingAddress;
  mapsKey?: string | null;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<MapHandle | null>(null);
  const googleMap = useRef<GoogleMap | null>(null);
  const googleOverlay = useRef<GoogleOverlayView | null>(null);
  const googleListeners = useRef<Array<{ remove: () => void }>>([]);
  /** Target the Google map must place under the lifted pin on next idle. */
  const googleAlign = useRef<{ lat: number; lng: number } | null>(null);
  const [mapProvider, setMapProvider] = useState<"google" | "leaflet" | null>(null);
  const [coords, setCoords] = useState({ lat: pending.lat, lng: pending.lng });
  const [activeLandmark, setActiveLandmark] = useState(pending.landmarkName);
  const [activeGovernorate, setActiveGovernorate] = useState<string | null>(pending.governorate);
  const [activeSource, setActiveSource] = useState(pending.source);
  const [landmarkOverride, setLandmarkOverride] = useState<string | null>(null);

  const [floor, setFloor] = useState(pending.floor ?? "");
  const [driverNote, setDriverNote] = useState(pending.driverNote ?? "");
  const [details, setDetails] = useState(Boolean(pending.floor || pending.driverNote));

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

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
    let fallbackTimer: number | undefined;

    const initLeaflet = async () => {
      if (cancelled || googleMap.current || mapInstance.current) return;
      try {
        const L = await import("leaflet");
        if (cancelled || !container.isConnected || googleMap.current || mapInstance.current) return;
        const node = container as HTMLElement & { _leaflet_id?: number };
        if (node._leaflet_id != null) return;

        const leafletMap = L.map(container, { zoomControl: false }).setView([pending.lat, pending.lng], 17);
        if (cancelled) {
          leafletMap.remove();
          return;
        }
        const map = leafletMap as unknown as MapHandle;
        mapInstance.current = map;
        setMapProvider("leaflet");
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
    };

    /** Google Maps is the pin map when a browser key is configured. */
    const initGoogle = (): boolean => {
      const google = googleNamespace();
      if (!google?.maps || cancelled || !container.isConnected) return false;
      try {
        const map = new google.maps.Map(container, {
          center: { lat: pending.lat, lng: pending.lng },
          zoom: 17,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy",
        });
        googleMap.current = map;
        setMapProvider("google");
        const overlay = new google.maps.OverlayView();
        overlay.onAdd = () => undefined;
        overlay.draw = () => undefined;
        overlay.onRemove = () => undefined;
        overlay.setMap(map);
        googleOverlay.current = overlay;

        const read = () => {
          if (googleAlign.current) return; // programmatic focus owns coords until aligned
          const projection = overlay.getProjection();
          if (!projection || container.clientWidth < 10 || container.clientHeight < 10) return;
          const under = projection.fromContainerPixelToLatLng({
            x: container.clientWidth / 2,
            y: container.clientHeight / 2 - PIN_LIFT,
          });
          if (!under) return;
          const lat = under.lat();
          const lng = under.lng();
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          setCoords({ lat, lng });
        };
        const align = () => {
          const target = googleAlign.current;
          if (!target) {
            read();
            return;
          }
          googleAlign.current = null;
          const projection = overlay.getProjection();
          if (projection && container.clientWidth >= 10 && container.clientHeight >= 10) {
            // Centre sits PIN_LIFT below the pin, so the target lands under it.
            const centre = projection.fromContainerPixelToLatLng({
              x: container.clientWidth / 2,
              y: container.clientHeight / 2 + PIN_LIFT,
            });
            if (centre) map.setCenter({ lat: centre.lat(), lng: centre.lng() });
          }
          setCoords({ lat: target.lat, lng: target.lng });
        };
        googleAlign.current = { lat: pending.lat, lng: pending.lng };
        googleListeners.current = [
          map.addListener("center_changed", read),
          map.addListener("idle", align),
        ];
        return true;
      } catch {
        googleMap.current = null;
        return false;
      }
    };

    if (mapsKey) {
      // No key, a blocked script, or a Google error must never leave the
      // buyer without a map: Leaflet/OpenStreetMap takes over.
      fallbackTimer = window.setTimeout(() => {
        if (!cancelled && !googleMap.current && !mapInstance.current) void initLeaflet();
      }, 6_000);
      if (googleNamespace()?.maps) {
        if (!initGoogle()) void initLeaflet();
      } else {
        const startGoogle = () => {
          if (cancelled) return;
          if (!initGoogle()) void initLeaflet();
        };
        const existing = document.getElementById("google-maps-js") as HTMLScriptElement | null;
        if (existing) {
          existing.addEventListener("load", startGoogle);
          existing.addEventListener("error", () => void initLeaflet());
        } else {
          const script = document.createElement("script");
          script.id = "google-maps-js";
          script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsKey)}`;
          script.async = true;
          script.onload = startGoogle;
          script.onerror = () => void initLeaflet();
          document.head.appendChild(script);
        }
      }
    } else {
      void initLeaflet();
    }

    return () => {
      cancelled = true;
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
      for (const listener of googleListeners.current) listener.remove();
      googleListeners.current = [];
      googleOverlay.current?.setMap(null);
      googleOverlay.current = null;
      googleMap.current = null;
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, [pending.lat, pending.lng, mapsKey]);

  function focus(lat: number, lng: number, zoom = 17) {
    setCoords({ lat, lng });
    if (mapProvider === "google" && googleMap.current) {
      googleAlign.current = { lat, lng };
      googleMap.current.setZoom(zoom);
      googleMap.current.setCenter({ lat, lng });
      return;
    }
    const map = mapInstance.current;
    if (!map) return;
    map.setView([lat, lng], zoom);
    map.panBy([0, PIN_LIFT], { animate: false });
  }

  async function runDescriptionSearch(e?: FormEvent, presetQuery?: string) {
    e?.preventDefault();
    const q = (presetQuery ?? searchQuery).trim();
    if (q.length < 2 || searching) return;
    if (presetQuery) setSearchQuery(presetQuery);

    setSearching(true);
    setSearchMessage(null);
    try {
      const res = await fetch(`/api/pin/${token}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) {
        setSearchMessage("Could not search right now. Drag the map directly to your door.");
        return;
      }
      const data = (await res.json()) as SearchResponse;
      setSearchResults(data.candidates ?? []);

      if (data.floor && !floor.trim()) {
        setFloor(data.floor);
        setDetails(true);
      }
      if (data.driverNote && !driverNote.trim()) {
        setDriverNote(data.driverNote);
        setDetails(true);
      }

      if (data.triangulated && inTunisia(data.triangulated.midpoint.lat, data.triangulated.midpoint.lng)) {
        const label = `${data.triangulated.a} · ${data.triangulated.b}`;
        setActiveLandmark(label);
        setLandmarkOverride(label);
        setActiveSource("ai_triangulated");
        setSelectedCandidateId("triangulated");
        focus(data.triangulated.midpoint.lat, data.triangulated.midpoint.lng, 17);
        return;
      }

      const top = data.candidates?.[0];
      if (top && inTunisia(top.lat, top.lng)) {
        setActiveLandmark(top.name);
        setLandmarkOverride(top.name);
        if (top.governorate) setActiveGovernorate(top.governorate);
        setActiveSource(top.source === "google" ? "google" : data.aiUsed ? "ai_description" : top.source);
        setSelectedCandidateId(top.id);
        focus(top.lat, top.lng, 17);
      } else {
        setSearchMessage("No exact spot matched. Try naming a nearby café, pharmacy, mosque, or street.");
      }
    } catch {
      setSearchMessage("Search unavailable offline. Drag the map to your building.");
    } finally {
      setSearching(false);
    }
  }

  function pickCandidate(c: SearchCandidate) {
    if (!inTunisia(c.lat, c.lng)) return;
    setSelectedCandidateId(c.id);
    setActiveLandmark(c.name);
    setLandmarkOverride(c.name);
    if (c.governorate) setActiveGovernorate(c.governorate);
    setActiveSource(c.source);
    focus(c.lat, c.lng, 17);
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
    if (!pinOk) {
      setErrorDetail("Keep the pin inside Tunisia, then confirm.");
      return;
    }
    if (state === "sending") return;
    setState("sending");
    setErrorDetail(null);
    try {
      const res = await fetch(`/api/pin/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: coords.lat,
          lng: coords.lng,
          floor: floor || null,
          driverNote: driverNote || null,
          ...(landmarkOverride ? { landmarkOverride } : {}),
        }),
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
    } catch {
      // Never leave the button stuck on "Saving…": the pin is still on the
      // map and the buyer can simply tap Confirm again.
      setState("error");
      setErrorDetail("Connection hiccup — your pin is still here. Tap Confirm again.");
    }
  }

  function backToChat() {
    if (window.history.length > 1) window.history.back();
    else window.close();
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
          <button
            type="button"
            onClick={backToChat}
            className="mt-5 h-11 w-full cursor-pointer rounded-full bg-brand-solid text-sm font-semibold text-white transition-[transform,filter] duration-150 ease-linear hover:brightness-95 active:scale-[0.98]"
          >
            Return to the chat
          </button>
        </div>
      </div>
    );
  }

  const badge = sourceBadgeMeta(activeSource);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-secondary">
      {mapFailed ? (
        <div className="grid h-full place-items-center px-6 text-center text-sm text-secondary">
          The map didn&apos;t open. You can still confirm the landmark, or reload the page.
        </div>
      ) : (
        <div ref={mapRef} className="pin-map absolute inset-0" />
      )}

      {/* Top Floating HUD + AI Location Description Search */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-[500] flex flex-col items-center gap-2 px-3 sm:px-4">
        <div className="flex items-center gap-2.5 rounded-full border border-secondary bg-primary/95 px-3.5 py-1 shadow-sm backdrop-blur-md">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary-solid text-[10px] font-bold text-white">
            W
          </span>
          <span className="text-xs font-semibold text-primary">Wassalha Pin</span>
          {mapProvider === "google" ? (
            <span className="text-[11px] font-medium text-tertiary">Google Maps</span>
          ) : null}
          <span className="font-mono text-xs tabular-nums text-tertiary">
            {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
          </span>
        </div>

        <form
          onSubmit={(e) => void runDescriptionSearch(e)}
          className="pointer-events-auto flex w-full max-w-lg items-center gap-1.5 rounded-2xl border border-secondary bg-primary/95 p-1.5 shadow-md backdrop-blur-md"
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-brand-secondary">
            <Sparkles className={`size-4 ${searching ? "animate-spin" : ""}`} />
          </div>
          <input
            type="text"
            dir="auto"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Describe your spot (Derja, French, Arabic)…"
            aria-label="Describe your spot"
            className="min-w-0 flex-1 bg-transparent px-1.5 text-sm text-primary placeholder:text-tertiary focus:outline-none"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSearchResults([]);
                setSearchMessage(null);
              }}
              aria-label="Clear search"
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-tertiary hover:bg-tertiary hover:text-primary"
            >
              <XClose className="size-4" />
            </button>
          ) : null}
          <button
            type="submit"
            disabled={searching || searchQuery.trim().length < 2}
            aria-label="Find location"
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-brand-solid px-3 text-xs font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-45"
          >
            <SearchLg className="size-3.5" />
            <span>{searching ? "Finding…" : "Find"}</span>
          </button>
        </form>

        {searchResults.length > 1 ? (
          <div className="pointer-events-auto flex w-full max-w-lg gap-1.5 overflow-x-auto pb-1">
            {searchResults.map((c) => {
              const active = selectedCandidateId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickCandidate(c)}
                  className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium shadow-xs backdrop-blur-md transition-colors ${
                    active
                      ? "border-brand bg-brand-solid text-white"
                      : "border-secondary bg-primary/95 text-secondary hover:bg-tertiary"
                  }`}
                >
                  <MapPin className="size-3 shrink-0" />
                  <span className="max-w-[180px] truncate" dir="auto">
                    {c.name}
                  </span>
                  {c.delegation || c.governorate ? (
                    <span className={active ? "text-white/80" : "text-tertiary"}>
                      · {c.delegation ?? c.governorate}
                    </span>
                  ) : null}
                  <span className={active ? "text-white/80" : "text-tertiary"}>
                    · {distanceLabel(coords, c)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {searchMessage ? (
          <div className="pointer-events-auto rounded-full border border-secondary bg-primary/95 px-3 py-1 text-xs font-medium text-warning-primary shadow-xs">
            {searchMessage}
          </div>
        ) : null}
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
        className="absolute right-4 bottom-[256px] z-[500] grid size-12 cursor-pointer place-items-center rounded-full bg-primary text-primary shadow-lg ring-1 ring-secondary transition-transform duration-150 ease-linear hover:bg-tertiary active:scale-[0.96] disabled:opacity-50"
      >
        <LocateFixed className={`size-5 ${locating ? "animate-pulse text-brand-secondary" : ""}`} />
      </button>

      {/* Bottom Sheet */}
      <div className="absolute inset-x-0 bottom-0 z-[500]">
        <div className="mx-auto w-full max-w-lg rounded-t-[28px] border-t border-secondary bg-primary px-5 pt-3 pb-6 shadow-[0_-12px_40px_rgba(28,25,23,0.14)]">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-quaternary" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold tracking-wider text-brand-secondary uppercase">
                Deliver here
              </p>
              <Badge color={badge.color} size="sm">
                {badge.label}
              </Badge>
            </div>
            {activeGovernorate ? (
              <Badge color="gray" size="sm">
                {activeGovernorate}
              </Badge>
            ) : null}
          </div>

          <h1 className="mt-1.5 truncate text-lg font-semibold tracking-tight text-primary" dir="auto">
            Near {activeLandmark}
          </h1>
          <p className="mt-0.5 text-sm text-tertiary">
            Drag the map until the pin sits directly on your door, or search by landmark above.
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
            className="mt-4 h-12 w-full cursor-pointer rounded-full bg-brand-solid text-sm font-semibold text-white shadow-[0_2px_8px_rgba(28,25,23,0.14)] transition-[transform,filter] duration-150 ease-linear hover:brightness-95 active:scale-[0.98] disabled:opacity-50"
          >
            {state === "sending" ? "Saving…" : "Confirm this spot"}
          </button>
        </div>
      </div>
    </div>
  );
}
