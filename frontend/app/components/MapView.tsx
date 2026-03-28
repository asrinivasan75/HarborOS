"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { api } from "@/app/lib/api";
import type { Vessel, Geofence } from "@/app/lib/api";

interface MapViewProps {
  vessels: Vessel[];
  geofences: Geofence[];
  selectedVesselId: string | null;
  onSelectVessel: (vesselId: string) => void;
  flyTo?: { center: [number, number]; zoom: number } | null;
}

function vesselColor(score: number | null): string {
  if (!score || score < 25) return "#22c55e";
  if (score < 45) return "#f59e0b";
  if (score < 70) return "#f97316";
  return "#ef4444";
}

function geofenceColor(zoneType: string): string {
  switch (zoneType) {
    case "restricted": return "#ef4444";
    case "security": return "#f97316";
    case "shipping_lane": return "#3b82f6";
    case "anchorage": return "#22c55e";
    case "environmental": return "#8b5cf6";
    default: return "#64748b";
  }
}

/** Returns an SVG path `d` attribute and viewBox for each vessel type. */
function vesselSvgPath(vesselType: string): { d: string; viewBox: string } {
  switch (vesselType) {
    // Cargo: rectangle with pointed bow (container ship)
    case "cargo":
      return { d: "M6 22 L6 6 L12 2 L18 6 L18 22 Z", viewBox: "0 0 24 24" };
    // Tanker: wider rectangle with rounded bow
    case "tanker":
      return { d: "M4 22 L4 8 Q4 4 12 2 Q20 4 20 8 L20 22 Z", viewBox: "0 0 24 24" };
    // Fishing: diamond shape
    case "fishing":
      return { d: "M12 2 L20 12 L12 22 L4 12 Z", viewBox: "0 0 24 24" };
    // Tug: small square with pointed top
    case "tug":
      return { d: "M7 20 L7 8 L12 3 L17 8 L17 20 Z", viewBox: "0 0 24 24" };
    // Passenger: tall narrow rectangle (cruise ship)
    case "passenger":
      return { d: "M8 22 L8 5 L10 2 L14 2 L16 5 L16 22 Z", viewBox: "0 0 24 24" };
    // Law enforcement / military: triangle with flat base (patrol boat)
    case "law_enforcement":
    case "military":
      return { d: "M12 2 L22 20 L2 20 Z", viewBox: "0 0 24 24" };
    // Pleasure craft: circle
    case "pleasure":
      return { d: "M12 2 A10 10 0 1 1 12 22 A10 10 0 1 1 12 2 Z", viewBox: "0 0 24 24" };
    // Default / other: original arrow/chevron
    default:
      return { d: "M12 2 L4 20 L12 15 L20 20 Z", viewBox: "0 0 24 24" };
  }
}

export default function MapView({ vessels, geofences, selectedVesselId, onSelectVessel, flyTo }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Record<string, { marker: maplibregl.Marker; el: HTMLDivElement }>>({});

  const updateMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentVesselIds = new Set<string>();

    vessels.forEach((vessel) => {
      if (!vessel.latest_position) return;
      currentVesselIds.add(vessel.id);

      const score = vessel.risk_score ?? 0;
      const color = vesselColor(vessel.risk_score);
      const isSelected = vessel.id === selectedVesselId;
      const size = isSelected ? 22 : score >= 45 ? 18 : 14;
      const course = vessel.latest_position.course_over_ground ?? 0;
      const strokeColor = isSelected ? "#e2e8f0" : "rgba(0,0,0,0.5)";
      const strokeWidth = isSelected ? 1.5 : 1;
      const { d: pathD, viewBox } = vesselSvgPath(vessel.vessel_type ?? "other");

      let markerData = markersRef.current[vessel.id];

      // 1. Create marker if it doesn't exist
      if (!markerData) {
        const el = document.createElement("div");
        el.style.cursor = "pointer";
        // Do NOT add CSS transition to transform or it breaks map-pan tracking
        
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectVessel(vessel.id);
        });

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([vessel.latest_position.longitude, vessel.latest_position.latitude])
          .addTo(map);

        markerData = { marker, el };
        markersRef.current[vessel.id] = markerData;
      }

      // 2. Update existing marker properties
      const { marker, el } = markerData;
      
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      // We apply MapLibre's Z-index fix visually using pointer-events:none if it was overlapping
      el.style.filter = `drop-shadow(0 0 ${score >= 70 ? "6" : score >= 45 ? "4" : "2"}px ${color}${score >= 45 ? "cc" : "80"})`;
      
      // Keep it subtle: A simple animated wrapper for pulsing, and a separate SVG for rotating
      el.innerHTML = `
      <div style="width: 100%; height: 100%; ${score >= 70 ? 'animation: pulse 2s infinite;' : ''}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}" style="transform: rotate(${course}deg); transition: transform 0.5s ease;">
          <path d="${pathD}" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round" style="transition: fill 0.5s ease;"/>
        </svg>
      </div>`;

      el.title = `${vessel.name} (${vessel.mmsi})`;

      // 3. Move marker to new coordinates
      marker.setLngLat([vessel.latest_position.longitude, vessel.latest_position.latitude]);
    });

    // 4. Clean up stale markers for vessels that left the region or disconnected
    Object.keys(markersRef.current).forEach((vesselId) => {
      if (!currentVesselIds.has(vesselId)) {
        markersRef.current[vesselId].marker.remove();
        delete markersRef.current[vesselId];
      }
    });

  }, [vessels, selectedVesselId, onSelectVessel]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          "carto-dark": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            maxzoom: 18,
            attribution: "&copy; CARTO &copy; OpenStreetMap contributors",
          },
        },
        layers: [
          {
            id: "carto-dark",
            type: "raster",
            source: "carto-dark",
            minzoom: 0,
            maxzoom: 20,
          },
        ],
      },
      center: [-118.265, 33.725],
      zoom: 12.5,
      pitch: 0,
    });

    map.on("error", (e) => {
      console.error("MapLibre error:", e);
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      mapRef.current = map;

      geofences.forEach((gf) => {
        const color = geofenceColor(gf.zone_type);
        map.addSource(`geofence-${gf.id}`, {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: gf.geometry,
            properties: { name: gf.name, zone_type: gf.zone_type },
          },
        });

        map.addLayer({
          id: `geofence-fill-${gf.id}`,
          type: "fill",
          source: `geofence-${gf.id}`,
          paint: {
            "fill-color": color,
            "fill-opacity": 0.06,
          },
        });

        map.addLayer({
          id: `geofence-line-${gf.id}`,
          type: "line",
          source: `geofence-${gf.id}`,
          paint: {
            "line-color": color,
            "line-width": 1,
            "line-dasharray": [4, 3],
            "line-opacity": 0.4,
          },
        });
      });

      updateMarkers();
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    updateMarkers();
  }, [updateMarkers]);

  useEffect(() => {
    if (!flyTo || !mapRef.current) return;
    mapRef.current.flyTo({
      center: flyTo.center,
      zoom: flyTo.zoom,
      duration: 2000,
    });
  }, [flyTo]);

  // Vessel trail when selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clean up previous trail
    if (map.getLayer("vessel-trail")) map.removeLayer("vessel-trail");
    if (map.getSource("vessel-trail")) map.removeSource("vessel-trail");

    if (!selectedVesselId) return;

    const selectedVessel = vessels.find((v) => v.id === selectedVesselId);
    const trailColor = vesselColor(selectedVessel?.risk_score ?? null);

    let cancelled = false;
    api.getVesselDetail(selectedVesselId).then((detail) => {
      if (cancelled || !mapRef.current) return;
      const positions = detail.positions;
      if (!positions || positions.length < 2) return;

      const coordinates = positions.map((p) => [p.longitude, p.latitude]);

      mapRef.current.addSource("vessel-trail", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates,
          },
        },
      });

      mapRef.current.addLayer({
        id: "vessel-trail",
        type: "line",
        source: "vessel-trail",
        paint: {
          "line-color": trailColor,
          "line-width": 2,
          "line-opacity": 0.6,
        },
      });
    }).catch((err) => {
      console.error("Failed to fetch vessel trail:", err);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedVesselId, vessels]);

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }} />
      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-[#0d1320]/95 backdrop-blur-md border border-[#1a2235] rounded-xl p-3.5 text-[10px] shadow-xl shadow-black/30">
        <div className="text-[9px] text-slate-500 uppercase tracking-[0.15em] mb-2.5 font-semibold">Risk Level</div>
        <div className="space-y-2">
          <LegendItem color="#22c55e" label="Normal" />
          <LegendItem color="#f59e0b" label="Monitor" />
          <LegendItem color="#f97316" label="Verify" />
          <LegendItem color="#ef4444" label="Escalate" />
        </div>
        <div className="border-t border-[#1a2235] mt-3 pt-3 text-[9px] text-slate-500 uppercase tracking-[0.15em] mb-2.5 font-semibold">
          Zones
        </div>
        <div className="space-y-2">
          <LegendItem color="#ef4444" label="Restricted" dashed />
          <LegendItem color="#f97316" label="Security" dashed />
          <LegendItem color="#3b82f6" label="Shipping Lane" dashed />
          <LegendItem color="#22c55e" label="Anchorage" dashed />
        </div>
      </div>
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.4); }
        }
      `}</style>
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {dashed ? (
        <div className="w-4 h-0 border-t-[1.5px] border-dashed" style={{ borderColor: color }} />
      ) : (
        <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}60` }} />
      )}
      <span className="text-slate-400">{label}</span>
    </div>
  );
}
