"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/foundations/alert/alert";
import { TUNISIA_BOUNDS } from "@/lib/geo/tunisia";
import { money } from "../bits";
import { useDashboardResource } from "../use-poll";

interface Pin {
  orderId: string;
  lat: number;
  lng: number;
  approximated: boolean;
  label: string;
  phone: string | null;
  governorate: string | null;
  landmark: string | null;
  delegation: string | null;
  itemSummary: string;
  totalMillimes: number;
  status: string;
  canPrint: boolean;
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "CONFIRMED_BY_BUYER", label: "Confirmed" },
  { id: "APPROVED", label: "Approved" },
  { id: "WAYBILL_CREATED", label: "Waybill" },
  { id: "SHIPPED", label: "Shipped" },
];

const MAP_STYLE = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { elementType: "geometry", stylers: [{ color: "#f4f1ea" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b6375" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f7f4ee" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "water", stylers: [{ color: "#d5e3ee" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#d9d3c7" }] },
];

type GoogleMarker = { setMap: (map: unknown) => void; addListener: (event: string, fn: () => void) => void };
type GoogleMap = {
  fitBounds: (bounds: unknown) => void;
  getZoom: () => number;
  setZoom: (zoom: number) => void;
  addListener: (event: string, fn: () => void) => void;
};
type GoogleMaps = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMap;
    Marker: new (opts: Record<string, unknown>) => GoogleMarker;
    LatLngBounds: new () => { extend: (point: { lat: number; lng: number }) => void };
    Size: new (w: number, h: number) => unknown;
    Point: new (x: number, y: number) => unknown;
  };
};

declare global {
  interface Window {
    google?: GoogleMaps;
  }
}

function statusLabel(status: string): string {
  return FILTERS.find((filter) => filter.id === status)?.label ?? status.replaceAll("_", " ").toLowerCase();
}

function pinSvg(filled: boolean): string {
  const body = filled ? "#7F56D9" : "#ffffff";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 1C8 1 2 7.2 2 15.2 2 25.4 16 41 16 41s14-15.6 14-25.8C30 7.2 24 1 16 1z" fill="${body}" stroke="#7F56D9" stroke-width="2"/><circle cx="16" cy="15" r="4.5" fill="${filled ? "#ffffff" : "#7F56D9"}"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function clusterSvg(count: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="16" fill="#7F56D9"/><text x="20" y="25" text-anchor="middle" font-size="13" font-family="sans-serif" fill="white">${count}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function groupPins(pins: Pin[], zoom: number): Array<{ key: string; lat: number; lng: number; pins: Pin[] }> {
  const cell = 160 / Math.pow(2, Math.max(zoom, 3));
  const groups = new Map<string, Pin[]>();
  for (const pin of pins) {
    const key = `${Math.floor(pin.lat / cell)}:${Math.floor(pin.lng / cell)}`;
    groups.set(key, [...(groups.get(key) ?? []), pin]);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    lat: group.reduce((sum, pin) => sum + pin.lat, 0) / group.length,
    lng: group.reduce((sum, pin) => sum + pin.lng, 0) / group.length,
    pins: group,
  }));
}

export function MapClient() {
  const { data, error } = useDashboardResource<{ pins: Pin[]; mapsKey?: string | null }>("/api/dashboard/map");
  const pins = data?.pins ?? null;
  const mapsKey = data?.mapsKey ?? null;
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [printNote, setPrintNote] = useState<string | null>(null);
  const canvas = useRef<HTMLDivElement | null>(null);
  const visible = useMemo(
    () => (pins ?? []).filter((pin) => filter === "all" || pin.status === filter),
    [pins, filter],
  );
  const selected = visible.find((pin) => pin.orderId === selectedId) ?? null;

  useEffect(() => {
    if (!mapsKey || !canvas.current) return;
    const node = canvas.current;
    let map: GoogleMap | null = null;
    const markers: GoogleMarker[] = [];
    let zoomListener = false;

    const draw = (zoom: number) => {
      const google = window.google;
      if (!google || !map) return;
      for (const marker of markers) marker.setMap(null);
      markers.length = 0;
      for (const group of groupPins(visible, zoom)) {
        const single = group.pins.length === 1 ? group.pins[0] : null;
        const marker = new google.maps.Marker({
          map,
          position: { lat: group.lat, lng: group.lng },
          title: single ? single.label : `${group.pins.length} orders`,
          icon: {
            url: single ? pinSvg(!single.approximated) : clusterSvg(group.pins.length),
            scaledSize: new google.maps.Size(single ? 32 : 40, single ? 42 : 40),
            anchor: new google.maps.Point(single ? 16 : 20, single ? 42 : 20),
          },
        });
        marker.addListener("click", () => {
          if (single) {
            setSelectedId(single.orderId);
            return;
          }
          const next = Math.min((map?.getZoom() ?? zoom) + 2, 16);
          map?.setZoom(next);
        });
        markers.push(marker);
      }
    };

    const mount = () => {
      const google = window.google;
      if (!google) return;
      map = new google.maps.Map(node, {
        center: { lat: 34.2, lng: 9.5 },
        zoom: 6,
        styles: MAP_STYLE,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
      });
      if (visible.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        for (const pin of visible) bounds.extend({ lat: pin.lat, lng: pin.lng });
        map.fitBounds(bounds);
      }
      if (!zoomListener) {
        zoomListener = true;
        map.addListener("idle", () => draw(map?.getZoom() ?? 6));
      }
      draw(map.getZoom() ?? 6);
    };

    if (window.google?.maps) {
      mount();
      return () => {
        for (const marker of markers) marker.setMap(null);
      };
    }
    const existing = document.getElementById("google-maps-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", mount);
      return () => existing.removeEventListener("load", mount);
    }
    const script = document.createElement("script");
    script.id = "google-maps-js";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsKey)}`;
    script.async = true;
    script.onload = mount;
    document.head.appendChild(script);
  }, [mapsKey, visible]);

  function printSlip(pin: Pin) {
    if (!pin.canPrint) {
      setPrintNote("Confirm the buyer pin before printing a courier slip.");
      return;
    }
    setPrintNote(null);
    window.open(`/api/dashboard/orders/${pin.orderId}/slip`, "_blank", "noopener");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">Tunisia</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">Orders map</h1>
        <p className="mt-0.5 text-sm text-tertiary">
          A filled pin is the door the buyer confirmed. A hollow pin is only the governorate.
        </p>
      </div>
      {error ? <Alert color="error">{error}</Alert> : null}
      {printNote ? <Alert color="warning">{printNote}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setFilter(item.id);
              setSelectedId(null);
            }}
            className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ${
              filter === item.id ? "bg-brand-solid text-white" : "bg-primary text-secondary ring-1 ring-secondary"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="max-h-[36rem] overflow-y-auto rounded-2xl bg-primary ring-1 ring-secondary">
          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-tertiary">No orders on this map.</p>
          ) : (
            <ul className="divide-y divide-secondary">
              {visible.map((pin) => (
                <li key={pin.orderId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(pin.orderId)}
                    className={`flex w-full cursor-pointer flex-col gap-0.5 px-4 py-3 text-left ${
                      selectedId === pin.orderId ? "bg-secondary" : "hover:bg-secondary/60"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-primary">{pin.label}</span>
                      <span className="font-mono text-xs tabular-nums text-primary">{money(pin.totalMillimes)}</span>
                    </span>
                    <span className="truncate text-xs text-tertiary">{pin.itemSummary}</span>
                    <span className="text-xs text-tertiary">
                      {statusLabel(pin.status)}
                      {pin.approximated ? " · governorate" : ""}
                      {pin.landmark ? ` · ${pin.landmark}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <div className="relative min-h-[32rem]">
          {mapsKey ? (
            <div ref={canvas} className="h-[36rem] overflow-hidden rounded-2xl border border-secondary bg-[#f4f1ea]" />
          ) : (
            <FallbackMap pins={visible} selectedId={selectedId} onSelect={setSelectedId} />
          )}
          {selected ? <OrderCard pin={selected} onPrint={() => printSlip(selected)} /> : null}
        </div>
      </div>
    </div>
  );
}

function OrderCard({ pin, onPrint }: { pin: Pin; onPrint: () => void }) {
  return (
    <div className="absolute right-3 bottom-3 left-3 z-10 rounded-2xl bg-primary p-4 shadow-lg ring-1 ring-secondary sm:left-auto sm:w-80">
      <p className="text-xs font-semibold tracking-wide text-brand-secondary uppercase">{statusLabel(pin.status)}</p>
      <p className="mt-1 font-semibold text-primary">{pin.label}</p>
      <p className="text-sm text-secondary">{pin.itemSummary}</p>
      <p className="mt-1 text-xs text-tertiary">
        {[pin.governorate, pin.delegation, pin.landmark].filter(Boolean).join(" · ") || "Tunisia"}
        {pin.approximated ? " · governorate only" : ""}
      </p>
      {pin.phone ? <p className="font-mono text-xs text-tertiary">{pin.phone}</p> : null}
      <p className="mt-2 font-mono text-sm font-semibold tabular-nums text-primary">{money(pin.totalMillimes)}</p>
      <div className="mt-3 flex gap-2">
        <Link
          href={`/dashboard/orders/${pin.orderId}`}
          className="rounded-lg bg-brand-solid px-3 py-1.5 text-sm font-semibold text-white"
        >
          Open order
        </Link>
        <button
          type="button"
          onClick={onPrint}
          className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-secondary ring-1 ring-secondary"
        >
          Print slip
        </button>
      </div>
    </div>
  );
}

function FallbackMap({
  pins,
  selectedId,
  onSelect,
}: {
  pins: Pin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { south, north, west, east } = TUNISIA_BOUNDS;
  return (
    <div className="relative h-[36rem] overflow-hidden rounded-2xl border border-secondary bg-[radial-gradient(circle_at_30%_20%,rgba(127,86,217,0.12),transparent_42%),linear-gradient(180deg,#f7f4ee,#e7eef5)]">
      <p className="absolute top-3 left-3 rounded-full bg-primary/90 px-3 py-1 text-xs text-tertiary ring-1 ring-secondary">
        Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY for the live map. Pins stay on Tunisia until then.
      </p>
      {pins.map((pin) => {
        const left = ((pin.lng - west) / (east - west)) * 100;
        const top = ((north - pin.lat) / (north - south)) * 100;
        return (
          <button
            key={pin.orderId}
            type="button"
            title={pin.label}
            onClick={() => onSelect(pin.orderId)}
            className={`absolute size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full ring-2 ring-white ${
              pin.approximated ? "bg-transparent ring-brand-solid" : "bg-brand-solid"
            } ${selectedId === pin.orderId ? "scale-125" : ""}`}
            style={{ left: `${Math.min(96, Math.max(4, left))}%`, top: `${Math.min(96, Math.max(8, top))}%` }}
          />
        );
      })}
    </div>
  );
}
