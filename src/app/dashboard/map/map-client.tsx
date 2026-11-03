"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
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
  governorate: string | null;
  landmark: string | null;
  totalMillimes: number;
  status: string;
}

type GoogleMaps = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => { fitBounds: (bounds: unknown) => void };
    Marker: new (opts: Record<string, unknown>) => { addListener: (event: string, fn: () => void) => void };
    LatLngBounds: new () => { extend: (point: { lat: number; lng: number }) => void };
  };
};

declare global {
  interface Window {
    google?: GoogleMaps;
  }
}

export function MapClient() {
  const router = useRouter();
  const { data, error } = useDashboardResource<{ pins: Pin[]; mapsKey?: string | null }>("/api/dashboard/map");
  const pins = data?.pins ?? null;
  const mapsKey = data?.mapsKey ?? null;
  const canvas = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapsKey || !pins?.length || !canvas.current) return;
    const node = canvas.current;
    const draw = () => {
      const google = window.google;
      if (!google) return;
      const map = new google.maps.Map(node, {
        center: { lat: 34.2, lng: 9.5 },
        zoom: 6,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      const bounds = new google.maps.LatLngBounds();
      for (const pin of pins) {
        bounds.extend({ lat: pin.lat, lng: pin.lng });
        const marker = new google.maps.Marker({
          map,
          position: { lat: pin.lat, lng: pin.lng },
          title: pin.label,
        });
        marker.addListener("click", () => {
          router.push(`/dashboard/orders/${pin.orderId}`);
        });
      }
      map.fitBounds(bounds);
    };
    if (window.google?.maps) {
      draw();
      return;
    }
    const existing = document.getElementById("google-maps-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", draw);
      return () => existing.removeEventListener("load", draw);
    }
    const script = document.createElement("script");
    script.id = "google-maps-js";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsKey)}`;
    script.async = true;
    script.onload = draw;
    document.head.appendChild(script);
  }, [mapsKey, pins, router]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">Tunisia</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">Where orders come from</h1>
        <p className="mt-0.5 text-sm text-tertiary">
          A pin is the confirmed door. A hollow dot is the governorate when the door pin is missing.
        </p>
      </div>
      {error ? <Alert color="error">{error}</Alert> : null}
      {mapsKey ? (
        <div ref={canvas} className="h-[32rem] overflow-hidden rounded-2xl border border-secondary bg-tertiary" />
      ) : (
        <FallbackMap pins={pins ?? []} />
      )}
      <ul className="flex flex-col divide-y divide-secondary overflow-hidden rounded-xl bg-primary ring-1 ring-secondary">
        {(pins ?? []).map((pin) => (
          <li key={pin.orderId}>
            <Link
              href={`/dashboard/orders/${pin.orderId}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/60"
            >
              <span>
                <span className="font-medium text-primary">{pin.label}</span>
                <span className="mt-0.5 block text-xs text-tertiary">
                  {pin.governorate ?? "Tunisia"}
                  {pin.landmark ? ` · ${pin.landmark}` : ""}
                  {pin.approximated ? " · governorate" : ""}
                </span>
              </span>
              <span className="font-mono text-sm tabular-nums text-primary">{money(pin.totalMillimes)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FallbackMap({ pins }: { pins: Pin[] }) {
  const { south, north, west, east } = TUNISIA_BOUNDS;
  return (
    <div className="relative h-[32rem] overflow-hidden rounded-2xl border border-secondary bg-[radial-gradient(circle_at_30%_20%,rgba(127,86,217,0.18),transparent_45%),linear-gradient(180deg,#f8f6ff,#efeafb)]">
      <p className="absolute top-3 left-3 rounded-full bg-primary/90 px-3 py-1 text-xs text-tertiary ring-1 ring-secondary">
        Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY for Google Maps. Pins are placed on Tunisia in the meantime.
      </p>
      {pins.map((pin) => {
        const left = ((pin.lng - west) / (east - west)) * 100;
        const top = ((north - pin.lat) / (north - south)) * 100;
        return (
          <Link
            key={pin.orderId}
            href={`/dashboard/orders/${pin.orderId}`}
            title={pin.label}
            className={`absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${
              pin.approximated ? "bg-transparent ring-brand-solid" : "bg-brand-solid"
            }`}
            style={{ left: `${Math.min(96, Math.max(4, left))}%`, top: `${Math.min(96, Math.max(4, top))}%` }}
          />
        );
      })}
    </div>
  );
}
