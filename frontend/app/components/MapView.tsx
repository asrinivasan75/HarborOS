"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { api } from "@/app/lib/api";
import type { Vessel, Geofence } from "@/app/lib/api";
import { riskHex, RISK_THRESHOLDS } from "@/app/lib/risk";

export interface SatelliteOverlay {
  imageSrc: string;
  bbox: [number, number, number, number];
  renderToken?: string;
}

interface MapViewProps {
  vessels: Vessel[];
  geofences: Geofence[];
  selectedVesselId: string | null;
  onSelectVessel: (vesselId: string) => void;
  flyTo?: { center: [number, number]; zoom: number } | null;
  satelliteOverlay?: SatelliteOverlay | null;
  onMapCenterChange?: (center: [number, number]) => void;
  onMapClick?: (coords: [number, number]) => void;
}

const vesselColor = riskHex;

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

function resolveSatelliteOverlayUrl(imageSrc?: string, renderToken?: string): string | null {
  if (!imageSrc) return null;

  const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/api$/, "");
  const absoluteUrl = imageSrc.startsWith("/api/") ? `${apiBase}${imageSrc}` : imageSrc;
  if (!renderToken) return absoluteUrl;
  return `${absoluteUrl}${absoluteUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(renderToken)}`;
}

/**
 * Returns top-down ship silhouette SVG paths for each vessel type.
 * Uses a tall narrow viewBox (10x28) so ships render with realistic proportions.
 * Three layers: hull (colored), deck (subtle), bridge (bright white block).
 */
function vesselSvgPaths(vesselType: string): {
  hull: string; deck: string; bridge: string; viewBox: string; ratio: number;
} {
  // ratio = width / height for the marker element
  switch (vesselType) {
    // Cargo / container: long boxy hull, container bays, bridge block at stern
    case "cargo":
      return {
        hull: "M5 0 L2.5 3 L1.5 6 L1.5 25 L2.5 28 L7.5 28 L8.5 25 L8.5 6 L7.5 3 Z",
        deck: "M2.5 5.5 L7.5 5.5 L7.5 8 L2.5 8 Z M2.5 9 L7.5 9 L7.5 11.5 L2.5 11.5 Z M2.5 12.5 L7.5 12.5 L7.5 15 L2.5 15 Z M2.5 16 L7.5 16 L7.5 18.5 L2.5 18.5 Z",
        bridge: "M2 21 L8 21 L8 26.5 L2 26.5 Z",
        viewBox: "0 0 10 28",
        ratio: 0.36,
      };
    // Tanker: wide rounded bow, center pipe, bridge at stern
    case "tanker":
      return {
        hull: "M5 0 Q1 4 1 7 L1 25 L2 28 L8 28 L9 25 L9 7 Q9 4 5 0 Z",
        deck: "M4 6 L6 6 L6 20 L4 20 Z",
        bridge: "M2 22 L8 22 L8 27 L2 27 Z",
        viewBox: "0 0 10 28",
        ratio: 0.36,
      };
    // Fishing: shorter wider hull, wheelhouse forward, boom line aft
    case "fishing":
      return {
        hull: "M5 0 L2 3 L0.5 7 L0.5 18 L2 22 L8 22 L9.5 18 L9.5 7 L8 3 Z",
        deck: "M4.5 10 L5.5 10 L5.5 19 L4.5 19 Z",
        bridge: "M2 3.5 L8 3.5 L8 9 L2 9 Z",
        viewBox: "0 0 10 22",
        ratio: 0.45,
      };
    // Tug: very short & stocky, big wheelhouse
    case "tug":
      return {
        hull: "M5 0 L2 3 L0.5 6 L0.5 14 L2 17 L8 17 L9.5 14 L9.5 6 L8 3 Z",
        deck: "",
        bridge: "M1.5 4 L8.5 4 L8.5 12 L1.5 12 Z",
        viewBox: "0 0 10 17",
        ratio: 0.59,
      };
    // Passenger / cruise: longest hull, massive superstructure, pool deck
    case "passenger":
      return {
        hull: "M5 0 L2.5 2 L1 5 L1 27 L2 30 L8 30 L9 27 L9 5 L7.5 2 Z",
        deck: "M2 3.5 L8 3.5 L8 25 L2 25 Z",
        bridge: "M2.5 3.5 L7.5 3.5 L7.5 8 L2.5 8 Z",
        viewBox: "0 0 10 30",
        ratio: 0.33,
      };
    // Military / law enforcement: narrow aggressive hull, weapons deck
    case "law_enforcement":
    case "military":
      return {
        hull: "M5 0 L3 3 L2 7 L1.5 24 L3 28 L7 28 L8.5 24 L8 7 L7 3 Z",
        deck: "M3.5 7 L6.5 7 L6.5 11 L3.5 11 Z M3.5 14 L6.5 14 L6.5 16 L3.5 16 Z",
        bridge: "M3 18 L7 18 L7 24 L3 24 Z",
        viewBox: "0 0 10 28",
        ratio: 0.36,
      };
    // Pleasure / yacht: small sleek hull, open cockpit aft
    case "pleasure":
      return {
        hull: "M5 0 L2.5 3 L1.5 7 L1.5 19 L3 23 L7 23 L8.5 19 L8.5 7 L7.5 3 Z",
        deck: "",
        bridge: "M2.5 14 L7.5 14 L7.5 21 L2.5 21 Z",
        viewBox: "0 0 10 23",
        ratio: 0.43,
      };
    // Default / other: generic vessel
    default:
      return {
        hull: "M5 0 L2 4 L1.5 8 L1.5 24 L3 28 L7 28 L8.5 24 L8.5 8 L8 4 Z",
        deck: "",
        bridge: "M2.5 20 L7.5 20 L7.5 26 L2.5 26 Z",
        viewBox: "0 0 10 28",
        ratio: 0.36,
      };
  }
}

type BaseMap = "dark" | "satellite";

function buildMapStyle(baseMap: BaseMap): maplibregl.StyleSpecification {
  if (baseMap === "satellite") {
    return {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        "satellite": {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          maxzoom: 18,
          attribution: "&copy; Esri, Maxar, Earthstar Geographics",
        },
        "carto-labels": {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png",
            "https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png",
          ],
          tileSize: 256,
          maxzoom: 18,
        },
      },
      layers: [
        {
          id: "satellite",
          type: "raster",
          source: "satellite",
          minzoom: 0,
          maxzoom: 22,
        },
        {
          id: "labels",
          type: "raster",
          source: "carto-labels",
          minzoom: 3,
          maxzoom: 22,
          paint: { "raster-opacity": 0.8 },
        },
      ],
    };
  }
  return {
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
  };
}

export default function MapView({
  vessels,
  geofences,
  selectedVesselId,
  onSelectVessel,
  flyTo,
  satelliteOverlay,
  onMapCenterChange,
  onMapClick,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Record<string, { marker: maplibregl.Marker; el: HTMLDivElement }>>({});
  const [baseMap, setBaseMap] = useState<BaseMap>("satellite");
  const [heatmap, setHeatmap] = useState(false);
  const [hideNormal, setHideNormal] = useState(false);
  const centerChangeRef = useRef(onMapCenterChange);
  const mapClickRef = useRef(onMapClick);

  useEffect(() => {
    centerChangeRef.current = onMapCenterChange;
    mapClickRef.current = onMapClick;
  }, [onMapCenterChange, onMapClick]);

  const updateMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentVesselIds = new Set<string>();

    vessels.forEach((vessel) => {
      if (!vessel.latest_position) return;

      // Filter out normal vessels when toggle is active
      const hasAnomaly = (vessel.risk_score ?? 0) >= RISK_THRESHOLDS.monitor || (vessel.recommended_action && vessel.recommended_action !== "ignore");
      if (hideNormal && !hasAnomaly && vessel.id !== selectedVesselId) {
        // Remove marker if it exists
        if (markersRef.current[vessel.id]) {
          markersRef.current[vessel.id].marker.remove();
          delete markersRef.current[vessel.id];
        }
        return;
      }

      currentVesselIds.add(vessel.id);

      const score = vessel.risk_score ?? 0;
      const isMuted = vessel.is_inactive || vessel.is_resolved;
      const color = isMuted ? "#64748b" : vesselColor(vessel.risk_score);
      const isSelected = vessel.id === selectedVesselId;
      const h = isSelected ? 42 : score >= RISK_THRESHOLDS.verify ? 34 : 26;
      const course = vessel.latest_position.course_over_ground ?? 0;
      const strokeColor = isSelected ? "#cbd5e1" : "rgba(0,0,0,0.7)";
      const strokeWidth = isSelected ? 1.2 : 0.6;
      const { hull, deck, bridge, viewBox, ratio } = vesselSvgPaths(vessel.vessel_type ?? "other");
      const w = Math.round(h * ratio);

      let markerData = markersRef.current[vessel.id];

      if (!markerData) {
        const el = document.createElement("div");
        el.style.cursor = "pointer";

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

      const { marker, el } = markerData;

      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      const glowSize = isMuted ? 0 : score >= RISK_THRESHOLDS.escalate ? 8 : score >= RISK_THRESHOLDS.verify ? 5 : 3;
      const glowAlpha = isMuted ? "00" : score >= RISK_THRESHOLDS.verify ? "cc" : "80";
      const pulseAnimation = (!isMuted && score >= RISK_THRESHOLDS.escalate) ? 'animation:pulse 2s infinite;' : '';

      el.innerHTML = `
      <div style="width:100%;height:100%;${pulseAnimation}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${w}" height="${h}"
             style="transform:rotate(${course}deg);transition:transform 0.5s ease;filter:drop-shadow(0 0 ${glowSize}px ${color}${glowAlpha})">
          <path d="${hull}" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>
          ${deck ? `<path d="${deck}" fill="rgba(255,255,255,0.10)" stroke="none"/>` : ""}
          <path d="${bridge}" fill="rgba(255,255,255,0.30)" stroke="rgba(255,255,255,0.12)" stroke-width="0.3"/>
        </svg>
      </div>`;

      el.title = `${vessel.name} (${vessel.mmsi})${vessel.is_inactive && vessel.status_reason ? ` — ${vessel.status_reason}` : ""}`;
      marker.setLngLat([vessel.latest_position.longitude, vessel.latest_position.latitude]);
    });

    Object.keys(markersRef.current).forEach((vesselId) => {
      if (!currentVesselIds.has(vesselId)) {
        markersRef.current[vesselId].marker.remove();
        delete markersRef.current[vesselId];
      }
    });
  }, [vessels, selectedVesselId, onSelectVessel, hideNormal]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: buildMapStyle(baseMap),
      center: [-118.265, 33.725],
      zoom: 12.5,
      pitch: 0,
      attributionControl: false,
    });

    map.on("error", () => {
      // Suppress tile loading errors (403s from tile providers are normal)
    });

    map.on("load", () => {
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      const center = map.getCenter();
      centerChangeRef.current?.([center.lng, center.lat]);

      map.on("moveend", () => {
        const nextCenter = map.getCenter();
        centerChangeRef.current?.([nextCenter.lng, nextCenter.lat]);
      });

      map.on("click", (event) => {
        mapClickRef.current?.([event.lngLat.lng, event.lngLat.lat]);
      });

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

      // Heatmap source & layer
      map.addSource("vessel-heatmap", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "vessel-heatmap-layer",
        type: "heatmap",
        source: "vessel-heatmap",
        layout: { visibility: "none" },
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "risk"], 0, 0.2, 100, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 15, 2],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 20, 15, 40],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.2, "rgba(0,0,255,0.4)",
            0.4, "rgba(0,255,255,0.6)",
            0.6, "rgba(255,255,0,0.7)",
            1, "rgba(255,0,0,0.9)",
          ],
          "heatmap-opacity": 0.6,
        },
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

  // Update heatmap source data and visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!map.getSource("vessel-heatmap")) return;

    if (heatmap) {
      const features = vessels
        .filter((v) => v.latest_position)
        .map((v) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [v.latest_position!.longitude, v.latest_position!.latitude],
          },
          properties: { risk: v.risk_score ?? 0 },
        }));

      (map.getSource("vessel-heatmap") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features,
      });
      map.setLayoutProperty("vessel-heatmap-layer", "visibility", "visible");
    } else {
      map.setLayoutProperty("vessel-heatmap-layer", "visibility", "none");
    }
  }, [vessels, heatmap]);

  // Switch base map style
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    const zoom = map.getZoom();
    map.setStyle(buildMapStyle(baseMap));
    map.once("styledata", () => {
      map.setCenter(center);
      map.setZoom(zoom);
      // Re-add geofences after style change
      geofences.forEach((gf) => {
        const color = geofenceColor(gf.zone_type);
        if (!map.getSource(`geofence-${gf.id}`)) {
          map.addSource(`geofence-${gf.id}`, {
            type: "geojson",
            data: { type: "Feature", geometry: gf.geometry, properties: {} },
          });
          map.addLayer({
            id: `geofence-fill-${gf.id}`, type: "fill", source: `geofence-${gf.id}`,
            paint: { "fill-color": color, "fill-opacity": 0.1 },
          });
          map.addLayer({
            id: `geofence-line-${gf.id}`, type: "line", source: `geofence-${gf.id}`,
            paint: { "line-color": color, "line-width": 1.5, "line-dasharray": [4, 2], "line-opacity": 0.6 },
          });
        }
      });
      // Re-add heatmap source & layer after style change
      if (!map.getSource("vessel-heatmap")) {
        map.addSource("vessel-heatmap", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "vessel-heatmap-layer",
          type: "heatmap",
          source: "vessel-heatmap",
          layout: { visibility: heatmap ? "visible" : "none" },
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["get", "risk"], 0, 0.2, 100, 1],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 15, 2],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 20, 15, 40],
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0, "rgba(0,0,0,0)",
              0.2, "rgba(0,0,255,0.4)",
              0.4, "rgba(0,255,255,0.6)",
              0.6, "rgba(255,255,0,0.7)",
              1, "rgba(255,0,0,0.9)",
            ],
            "heatmap-opacity": 0.6,
          },
        });
      }
      updateMarkers();
    });
  }, [baseMap]); // eslint-disable-line react-hooks/exhaustive-deps

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

      // Break trail into segments at implausible position jumps
      // (avoids drawing straight lines over land when AIS data teleports)
      const segments: [number, number][][] = [];
      let currentSegment: [number, number][] = [[positions[0].longitude, positions[0].latitude]];

      for (let i = 1; i < positions.length; i++) {
        const prev = positions[i - 1];
        const curr = positions[i];
        const dtHours = (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 3_600_000;
        if (dtHours <= 0) {
          currentSegment.push([curr.longitude, curr.latitude]);
          continue;
        }
        // Approximate distance in nautical miles using equirectangular projection
        const dLat = (curr.latitude - prev.latitude) * 60;
        const dLon = (curr.longitude - prev.longitude) * 60 * Math.cos((curr.latitude * Math.PI) / 180);
        const distNm = Math.sqrt(dLat * dLat + dLon * dLon);
        const impliedSpeed = distNm / dtHours;

        if (impliedSpeed > 60) {
          // Break — this jump is physically impossible, start a new segment
          if (currentSegment.length >= 2) segments.push(currentSegment);
          currentSegment = [[curr.longitude, curr.latitude]];
        } else {
          currentSegment.push([curr.longitude, curr.latitude]);
        }
      }
      if (currentSegment.length >= 2) segments.push(currentSegment);
      if (segments.length === 0) return;

      mapRef.current.addSource("vessel-trail", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "MultiLineString",
            coordinates: segments,
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

  // Satellite imagery overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.getLayer("sat-imagery")) map.removeLayer("sat-imagery");
    if (map.getSource("sat-imagery")) map.removeSource("sat-imagery");

    if (!satelliteOverlay) return;

    const [west, south, east, north] = satelliteOverlay.bbox;
    const overlayUrl = resolveSatelliteOverlayUrl(satelliteOverlay.imageSrc, satelliteOverlay.renderToken);
    if (!overlayUrl) return;

    map.addSource("sat-imagery", {
      type: "image",
      url: overlayUrl,
      coordinates: [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ],
    });

    map.addLayer({
      id: "sat-imagery",
      type: "raster",
      source: "sat-imagery",
      paint: {
        "raster-opacity": 0.9,
        "raster-fade-duration": 0,
      },
    });
  }, [satelliteOverlay, baseMap]);

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }} />
      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-[#0d1320]/95 backdrop-blur-md border border-[#1a2235] rounded-xl p-3.5 text-[10px] shadow-2xl shadow-black/50 ring-1 ring-white/[0.03]">
        <div className="text-[9px] text-slate-500 uppercase tracking-[0.15em] mb-2.5 font-semibold">Risk Level</div>
        <div className="space-y-2">
          <LegendItem color="#22c55e" label="Normal" />
          <LegendItem color="#f59e0b" label="Monitor" />
          <LegendItem color="#f97316" label="Verify" />
          <LegendItem color="#ef4444" label="Escalate" />
        </div>
        <button
          onClick={() => setHideNormal(!hideNormal)}
          className={`mt-3 w-full text-[9px] font-semibold uppercase tracking-wider px-2 py-1.5 rounded-md transition-all ${
            hideNormal
              ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
              : "text-slate-500 hover:text-slate-400 border border-[#1a2235] hover:bg-[#111827]"
          }`}
        >
          {hideNormal ? "Show all vessels" : "Hide normal vessels"}
        </button>
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
      {/* Base map toggle */}
      <div className="absolute bottom-4 right-4 bg-[#0d1320]/95 backdrop-blur-md border border-[#1a2235] rounded-xl overflow-hidden shadow-2xl shadow-black/50 ring-1 ring-white/[0.03] flex">
        <button
          onClick={() => setBaseMap("satellite")}
          className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
            baseMap === "satellite"
              ? "bg-blue-500/20 text-blue-400 border-r border-[#1a2235]"
              : "text-slate-500 hover:text-slate-300 border-r border-[#1a2235]"
          }`}
        >
          Satellite
        </button>
        <button
          onClick={() => setBaseMap("dark")}
          className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
            baseMap === "dark"
              ? "bg-blue-500/20 text-blue-400 border-r border-[#1a2235]"
              : "text-slate-500 hover:text-slate-300 border-r border-[#1a2235]"
          }`}
        >
          Dark
        </button>
        <button
          onClick={() => setHeatmap((prev) => !prev)}
          className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
            heatmap
              ? "bg-blue-500/20 text-blue-400"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Heatmap
        </button>
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
  const legendHull = "M5 0 L2 4 L1.5 8 L1.5 24 L3 28 L7 28 L8.5 24 L8.5 8 L8 4 Z";
  const legendBridge = "M2.5 20 L7.5 20 L7.5 26 L2.5 26 Z";
  return (
    <div className="flex items-center gap-2.5">
      {dashed ? (
        <div className="w-4 h-0 border-t-[1.5px] border-dashed" style={{ borderColor: color }} />
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 28" width="5" height="14" style={{ filter: `drop-shadow(0 0 3px ${color}80)` }}>
          <path d={legendHull} fill={color} stroke="rgba(0,0,0,0.5)" strokeWidth="0.6" strokeLinejoin="round" />
          <path d={legendBridge} fill="rgba(255,255,255,0.3)" stroke="none" />
        </svg>
      )}
      <span className="text-slate-400">{label}</span>
    </div>
  );
}
