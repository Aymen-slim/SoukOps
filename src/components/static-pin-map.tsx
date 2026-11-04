"use client";

import { useEffect, useRef } from "react";

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

function pinIcon(): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 1C8 1 2 7.2 2 15.2 2 25.4 16 41 16 41s14-15.6 14-25.8C30 7.2 24 1 16 1z" fill="#7F56D9" stroke="#7F56D9" stroke-width="2"/><circle cx="16" cy="15" r="4.5" fill="#ffffff"/></svg>';
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** Confirmed door pin on Google Maps. Not draggable. */
export function StaticPinMap({ lat, lng }: { lat: number; lng: number }) {
  const canvas = useRef<HTMLDivElement | null>(null);
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const link = mapsUrl(lat, lng);

  useEffect(() => {
    if (!key || !canvas.current) return;
    const node = canvas.current;
    let marker: { setMap: (map: null) => void } | null = null;
    let cancelled = false;

    const draw = () => {
      const google = window.google;
      if (cancelled || !google?.maps || !node.isConnected) return;
      const map = new google.maps.Map(node, {
        center: { lat, lng },
        zoom: 16,
        styles: MAP_STYLE,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
        gestureHandling: "cooperative",
      });
      marker = new google.maps.Marker({
        map,
        position: { lat, lng },
        title: "Confirmed pin",
        icon: {
          url: pinIcon(),
          scaledSize: new google.maps.Size(32, 42),
          anchor: new google.maps.Point(16, 42),
        },
      });
    };

    if (window.google?.maps) {
      draw();
      return () => {
        cancelled = true;
        marker?.setMap(null);
      };
    }

    const existing = document.getElementById("google-maps-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", draw);
      return () => {
        cancelled = true;
        existing.removeEventListener("load", draw);
        marker?.setMap(null);
      };
    }

    const script = document.createElement("script");
    script.id = "google-maps-js";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = draw;
    document.head.appendChild(script);
    return () => {
      cancelled = true;
      script.onload = null;
      marker?.setMap(null);
    };
  }, [key, lat, lng]);

  return (
    <div className="flex flex-col gap-2">
      {key ? (
        <div ref={canvas} className="h-72 w-full overflow-hidden rounded-xl border border-secondary bg-[#f4f1ea]" />
      ) : (
        <p className="rounded-xl border border-secondary bg-secondary px-4 py-6 text-sm text-tertiary">
          Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to show this pin on Google Maps.
        </p>
      )}
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        className="w-fit text-sm font-semibold text-brand-secondary underline underline-offset-4"
      >
        Open this pin in Google Maps
      </a>
    </div>
  );
}
