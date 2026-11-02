"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

/** Confirmed pin, not draggable. Same tiles as the buyer pin page. */
export function StaticPinMap({ lat, lng }: { lat: number; lng: number }) {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = mapRef.current;
    if (!container) return;
    let cancelled = false;
    let map: { remove: () => void } | null = null;
    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !container.isConnected) return;
      const node = container as HTMLElement & { _leaflet_id?: number };
      if (node._leaflet_id != null) return;
      const leafletMap = L.map(container, {
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
      }).setView([lat, lng], 16);
      if (cancelled) {
        leafletMap.remove();
        return;
      }
      map = leafletMap;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(leafletMap);
      L.marker([lat, lng], {
        icon: L.divIcon({
          className: "",
          html: '<div style="font-size:22px;line-height:1">📍</div>',
          iconSize: [22, 22],
          iconAnchor: [11, 20],
        }),
      }).addTo(leafletMap);
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng]);

  return <div ref={mapRef} className="h-56 w-full rounded-xl border border-secondary/80" />;
}
