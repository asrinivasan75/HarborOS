"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Header from "@/app/components/Header";
import AlertFeed from "@/app/components/AlertFeed";
import MapView from "@/app/components/MapView";
import VesselDetailPanel from "@/app/components/VesselDetail";
import DemoMode from "@/app/components/DemoMode";
import type { SatelliteFootprint } from "@/app/components/MapView";
import { api } from "@/app/lib/api";
import type { Vessel, VesselDetail, Alert, Geofence, IngestionStatus, Region } from "@/app/lib/api";

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
  const [mapTarget, setMapTarget] = useState<{ center: [number, number]; zoom: number } | null>(null);
  const [satelliteFootprint, setSatelliteFootprint] = useState<SatelliteFootprint | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const [v, a, g, r] = await Promise.all([
          api.getVessels(),
          api.getAlerts(),
          api.getGeofences(),
          api.getRegions(),
        ]);
        setVessels(v.items);
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
      try {
        const regionParam = activeRegion || undefined;
        const [v, a, status] = await Promise.all([
          api.getVessels(regionParam),
          api.getAlerts(undefined, regionParam, alertsLimitRef.current),
          api.getIngestionStatus().catch(() => null),
        ]);
        setVessels(v.items);
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
      setMapTarget({ center: [r.center[1], r.center[0]], zoom: r.zoom });
    } else {
      // "All regions" — zoom out to world view
      setMapTarget({ center: [20, 0], zoom: 2 });
    }

    // Fetch filtered data immediately
    try {
      const regionParam = regionKey || undefined;
      const [v, a] = await Promise.all([
        api.getVessels(regionParam),
        api.getAlerts(undefined, regionParam),
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
      // Fly to vessel position when clicking an alert
      if (detail.latest_position) {
        setMapTarget({
          center: [detail.latest_position.longitude, detail.latest_position.latitude],
          zoom: 14,
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
      const a = await api.getAlerts(undefined, regionParam, newLimit);
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

  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-[#070a12]">
        <Header alertCount={0} vesselCount={0} isLive={false} regions={{}} activeRegion={null} onRegionChange={() => {}} />
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
        <Header alertCount={0} vesselCount={0} isLive={false} regions={{}} activeRegion={null} onRegionChange={() => {}} />
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
        regions={regions}
        activeRegion={activeRegion}
        onRegionChange={handleRegionChange}
      />
      <div className="flex-1 flex overflow-hidden">
        <AlertFeed
          alerts={alerts}
          alertsTotal={alertsTotal}
          selectedAlertId={selectedAlertId}
          onSelectAlert={handleSelectAlert}
          onLoadMore={handleLoadMoreAlerts}
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
            onFlyTo={(center, zoom) => setMapTarget({ center, zoom })}
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
          />
        )}
      </div>
    </div>
  );
}
