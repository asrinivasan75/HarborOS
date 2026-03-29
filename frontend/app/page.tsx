"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Header from "@/app/components/Header";
import AlertFeed from "@/app/components/AlertFeed";
import MapView from "@/app/components/MapView";
import VesselDetailPanel from "@/app/components/VesselDetail";
import VesselCompare from "@/app/components/VesselCompare";
import DemoMode from "@/app/components/DemoMode";
import RegionSummary from "@/app/components/RegionSummary";
import Timeline from "@/app/components/Timeline";
import type { SatelliteFootprint } from "@/app/components/MapView";
import { api } from "@/app/lib/api";
import type { Vessel, VesselDetail, Alert, Geofence, IngestionStatus, Region, TimePositionEntry } from "@/app/lib/api";

const REFRESH_INTERVAL_MS = 5000;

export default function Dashboard() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsTotal, setAlertsTotal] = useState(0);
  const alertsLimitRef = useRef(50);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [regions, setRegions] = useState<Record<string, Region>>({});
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<VesselDetail | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatus | null>(null);
  const [mapTarget, setMapTarget] = useState<{ center: [number, number]; zoom: number; _t?: number } | null>(null);
  const [satelliteFootprint, setSatelliteFootprint] = useState<SatelliteFootprint | null>(null);
  const [comparedVessels, setComparedVessels] = useState<VesselDetail[]>([]);
  const [timeFilter, setTimeFilter] = useState<string | null>(null);
  const liveVesselsRef = useRef<Vessel[]>([]);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const [v, a, g, r] = await Promise.all([
          api.getVessels(),
          api.getAlerts("active"),
          api.getGeofences(),
          api.getRegions(),
        ]);
        setVessels(v.items);
        liveVesselsRef.current = v.items;
        setAlerts(a.items);
        setAlertsTotal(a.total);
        setGeofences(g);
        setRegions(r);
        setLoading(false);

        try {
          const status = await api.getIngestionStatus();
          setIngestionStatus(status);
        } catch {}
      } catch {
        setError("Failed to connect to HarborOS backend. Make sure the API is running on port 8000.");
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (refreshTimer.current) clearInterval(refreshTimer.current);

    refreshTimer.current = setInterval(async () => {
      if (timeFilter) return; // Pause live refresh during replay
      try {
        const regionParam = activeRegion || undefined;
        const [v, a, status] = await Promise.all([
          api.getVessels(regionParam),
          api.getAlerts("active", regionParam, alertsLimitRef.current),
          api.getIngestionStatus().catch(() => null),
        ]);
        setVessels(v.items);
        liveVesselsRef.current = v.items;
        setAlerts(a.items);
        setAlertsTotal(a.total);
        if (status) setIngestionStatus(status);
      } catch {}
    }, REFRESH_INTERVAL_MS);

    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [activeRegion]);

  // Region change handler
  const handleRegionChange = useCallback(async (regionKey: string | null) => {
    setActiveRegion(regionKey);
    setSelectedVessel(null);
    setSelectedAlertId(null);
    alertsLimitRef.current = 50;

    // Fly to the region
    if (regionKey && regions[regionKey]) {
      const r = regions[regionKey];
      setMapTarget({ center: [r.center[1], r.center[0]], zoom: r.zoom, _t: Date.now() });
    } else {
      // "All regions" — zoom out to world view
      setMapTarget({ center: [20, 0], zoom: 2, _t: Date.now() });
    }

    // Fetch filtered data immediately
    try {
      const regionParam = regionKey || undefined;
      const [v, a] = await Promise.all([
        api.getVessels(regionParam),
        api.getAlerts("active", regionParam),
      ]);
      setVessels(v.items);
      setAlerts(a.items);
      setAlertsTotal(a.total);
    } catch {}
  }, [regions]);

  const handleSelectVessel = useCallback(async (vesselId: string) => {
    setSatelliteFootprint(null); // Clear previous footprint
    try {
      const detail = await api.getVesselDetail(vesselId);
      setSelectedVessel(detail);
      const matchingAlert = alerts.find((a) => a.vessel_id === vesselId);
      setSelectedAlertId(matchingAlert?.id ?? null);
      if (detail.latest_position) {
        setMapTarget({
          center: [detail.latest_position.longitude, detail.latest_position.latitude],
          zoom: 14,
          _t: Date.now(),
        });
      }
    } catch (e) {
      console.error("Failed to load vessel detail:", e);
    }
  }, [alerts]);

  const handleSelectAlert = useCallback(async (alert: Alert) => {
    setSelectedAlertId(alert.id);
    try {
      const detail = await api.getVesselDetail(alert.vessel_id);
      setSelectedVessel(detail);
      
      // Ensure the vessel marker exists on the map even if it was excluded by the background limit
      setVessels((prev) => {
        if (!prev.some((v) => v.id === detail.id)) {
          return [...prev, detail];
        }
        return prev;
      });
      // Fly to vessel position when clicking an alert
      if (detail.latest_position) {
        setMapTarget({
          center: [detail.latest_position.longitude, detail.latest_position.latitude],
          zoom: 14,
          _t: Date.now(),
        });
      }
    } catch (e) {
      console.error("Failed to load vessel detail:", e);
    }
  }, []);

  const handleLoadMoreAlerts = useCallback(async () => {
    try {
      const regionParam = activeRegion || undefined;
      const newLimit = alerts.length + 50;
      const a = await api.getAlerts("active", regionParam, newLimit);
      alertsLimitRef.current = newLimit;
      setAlerts(a.items);
      setAlertsTotal(a.total);
    } catch {}
  }, [activeRegion, alerts.length]);

  const handleCloseDetail = useCallback(() => {
    setSelectedVessel(null);
    setSelectedAlertId(null);
    setSatelliteFootprint(null);
  }, []);

  const handleAlertAction = useCallback(async (alertId: string, newStatus: string) => {
    // Update the alert in-place so the feed reflects the change immediately
    setAlerts((prev) =>
      prev.map((a) => a.id === alertId ? { ...a, status: newStatus } : a)
    );
    // If dismissed, close the detail panel
    if (newStatus === "dismissed") {
      setSelectedVessel(null);
      setSelectedAlertId(null);
      setSatelliteFootprint(null);
    }
  }, []);

  const handleCompareVessel = useCallback(async (alert: Alert) => {
    try {
      const detail = await api.getVesselDetail(alert.vessel_id);
      setComparedVessels((prev) => {
        if (prev.length >= 3) return prev;
        if (prev.some((v) => v.id === detail.id)) return prev;
        return [...prev, detail];
      });
    } catch (e) {
      console.error("Failed to load vessel for comparison:", e);
    }
  }, []);

  const handleRemoveCompareVessel = useCallback((vesselId: string) => {
    setComparedVessels((prev) => prev.filter((v) => v.id !== vesselId));
  }, []);

  const handleClearCompare = useCallback(() => {
    setComparedVessels([]);
  }, []);

  const handleTimeChange = useCallback(async (timestamp: string | null) => {
    setTimeFilter(timestamp);
    if (!timestamp) {
      // Back to live — restore live vessel data
      setVessels(liveVesselsRef.current);
      return;
    }
    try {
      const positions = await api.getPositionsAtTime(timestamp);
      // Map time positions back to Vessel shape for the map
      const replayVessels: Vessel[] = positions.map((p: TimePositionEntry) => ({
        id: p.vessel_id,
        mmsi: p.mmsi ?? "",
        name: p.vessel_name ?? "",
        vessel_type: p.vessel_type ?? "other",
        flag_state: "",
        length: null,
        beam: null,
        draft: null,
        imo: null,
        callsign: null,
        destination: null,
        latest_position: {
          timestamp: p.timestamp,
          latitude: p.latitude,
          longitude: p.longitude,
          speed_over_ground: p.speed_over_ground,
          course_over_ground: p.course_over_ground,
          heading: p.heading,
        },
        risk_score: p.risk_score,
        recommended_action: p.recommended_action,
      }));
      setVessels(replayVessels);
    } catch {
      // If replay fetch fails, stay on current data
    }
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-[#070a12]">
        <Header alertCount={0} vesselCount={0} isLive={false} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-xs text-slate-500 tracking-wider uppercase">Initializing HarborOS</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col bg-[#070a12]">
        <Header alertCount={0} vesselCount={0} isLive={false} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-red-400">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-200 mb-2">Connection Failed</p>
            <p className="text-xs text-slate-500 leading-relaxed">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const isLive = ingestionStatus?.running && ingestionStatus?.connected;

  return (
    <div className="h-screen flex flex-col bg-[#070a12]">
      <Header
        alertCount={alerts.filter((a) => a.status === "active").length}
        vesselCount={vessels.length}
        isLive={!!isLive}
        positionsIngested={ingestionStatus?.positions_ingested}
      />
      <RegionSummary
        regions={regions}
        activeRegion={activeRegion}
        onSelectRegion={handleRegionChange}
      />
      <div className="flex-1 flex overflow-hidden">
        <AlertFeed
          alerts={alerts}
          alertsTotal={alertsTotal}
          selectedAlertId={selectedAlertId}
          onSelectAlert={handleSelectAlert}
          onLoadMore={handleLoadMoreAlerts}
          onCompare={handleCompareVessel}
        />
        <div className="flex-1 relative">
          <MapView
            vessels={vessels}
            geofences={geofences}
            selectedVesselId={selectedVessel?.id ?? null}
            onSelectVessel={handleSelectVessel}
            flyTo={mapTarget}
            satelliteFootprint={satelliteFootprint}
          />
          <DemoMode
            onFlyTo={(center, zoom) => setMapTarget({ center, zoom, _t: Date.now() })}
            onSelectVessel={handleSelectVessel}
            onSelectRegion={handleRegionChange}
            darkHorizonId="v-dark-horizon"
          />
        </div>
        {selectedVessel && (
          <VesselDetailPanel
            vessel={selectedVessel}
            alertId={selectedAlertId}
            onSatelliteFootprint={setSatelliteFootprint}
            onClose={handleCloseDetail}
            onAlertAction={handleAlertAction}
          />
        )}
      </div>
      <Timeline onTimeChange={handleTimeChange} />
      {comparedVessels.length > 0 && (
        <VesselCompare
          vessels={comparedVessels}
          onRemove={handleRemoveCompareVessel}
          onClear={handleClearCompare}
        />
      )}
    </div>
  );
}
