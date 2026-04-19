"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import MapView from "@/app/components/MapView";
import VesselDetailPanel from "@/app/components/VesselDetail";
import FeatureTour from "@/app/components/FeatureTour";
import RiskDistributionPanel from "@/app/components/RiskDistribution";
import Toast from "@/app/components/Toast";
import FloatingChrome from "@/app/components/FloatingChrome";
import AlertPeeks from "@/app/components/AlertPeeks";
import CommandPalette from "@/app/components/CommandPalette";
import IngestBanner from "@/app/components/IngestBanner";
import ShortcutOverlay from "@/app/components/ShortcutOverlay";
import type { ToastItem } from "@/app/components/Toast";
import type { SatelliteOverlay } from "@/app/components/MapView";
import { api } from "@/app/lib/api";
import type { Vessel, VesselDetail, Alert, Geofence, IngestionStatus, Region, RiskDistribution } from "@/app/lib/api";

const REFRESH_INTERVAL_MS = 5000;

export default function DashboardPage() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsTotal, setAlertsTotal] = useState(0);
  const alertsLimitRef = useRef(50);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [regions, setRegions] = useState<Record<string, Region>>({});
  const [activeRegion, setActiveRegion] = useState<string | null>("la_harbor");
  const [selectedVessel, setSelectedVessel] = useState<VesselDetail | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatus | null>(null);
  const [mapTarget, setMapTarget] = useState<{ center: [number, number]; zoom: number; _t?: number } | null>(null);
  const [satelliteOverlay, setSatelliteOverlay] = useState<SatelliteOverlay | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [mapClickFocus, setMapClickFocus] = useState<[number, number] | null>(null);
  const [alertStatusFilter, setAlertStatusFilter] = useState<string>("active");
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<RiskDistribution | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [detailClosing, setDetailClosing] = useState(false);
  const [analyticsClosing, setAnalyticsClosing] = useState(false);
  const [connectionOk, setConnectionOk] = useState(true);
  const [featureTourActive, setFeatureTourActive] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const searchParams = useSearchParams();
  const autoTour = searchParams.get("tour") === "1";
  const liveVesselsRef = useRef<Vessel[]>([]);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyticsCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showAnalyticsRef = useRef(showAnalytics);
  showAnalyticsRef.current = showAnalytics;

  const showToast = useCallback((message: string, type: ToastItem["type"] = "info") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const verificationFocus = mapClickFocus
    ? { latitude: mapClickFocus[1], longitude: mapClickFocus[0] }
    : mapCenter
      ? { latitude: mapCenter[1], longitude: mapCenter[0] }
      : null;

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const [v, a, g, r] = await Promise.all([
          api.getVessels("la_harbor"),
          api.getAlerts("active", "la_harbor"),
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
        setConnectionOk(true);

        try {
          const status = await api.getIngestionStatus();
          setIngestionStatus(status);
        } catch {}
      } catch {
        // Don't nuke the UI — let the refresh loop retry. Show reconnecting pill instead.
        setConnectionOk(false);
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Auto-start feature tour from URL param
  useEffect(() => {
    if (autoTour && !loading && !featureTourActive) {
      const timer = setTimeout(() => setFeatureTourActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, [autoTour, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh
  useEffect(() => {
    if (refreshTimer.current) clearInterval(refreshTimer.current);

    refreshTimer.current = setInterval(async () => {
      try {
        const regionParam = activeRegion || undefined;
        const [v, a, status] = await Promise.all([
          api.getVessels(regionParam),
          api.getAlerts(alertStatusFilter || undefined, regionParam, alertsLimitRef.current),
          api.getIngestionStatus().catch(() => null),
        ]);
        setVessels(v.items);
        liveVesselsRef.current = v.items;
        setAlerts(a.items);
        setAlertsTotal(a.total);
        if (status) setIngestionStatus(status);
        // Auto-refresh selected vessel detail for live edge node data
        setSelectedVessel((prev) => {
          if (prev && (prev.id.startsWith("dark-") || prev.id.startsWith("seapod-"))) {
            api.getVesselDetail(prev.id).then(setSelectedVessel).catch(() => {});
          }
          return prev;
        });
        setConnectionOk(true);
      } catch {
        if (connectionOk) showToast("Connection lost — retrying...", "error");
        setConnectionOk(false);
      }
    }, REFRESH_INTERVAL_MS);

    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [activeRegion, alertStatusFilter, connectionOk, showToast]);

  // Region change handler
  const handleRegionChange = useCallback(async (regionKey: string | null) => {
    setActiveRegion(regionKey);
    setSelectedVessel(null);
    setSelectedAlertId(null);
    setMapClickFocus(null);
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
        api.getAlerts(alertStatusFilter || undefined, regionParam),
      ]);
      setVessels(v.items);
      setAlerts(a.items);
      setAlertsTotal(a.total);
    } catch {}
  }, [regions, alertStatusFilter]);

  const handleSelectVessel = useCallback(async (vesselId: string) => {
    // Cancel any pending close animation
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; setDetailClosing(false); }
    // Close analytics if open (use ref to avoid stale closure from map markers)
    if (showAnalyticsRef.current) {
      setAnalyticsClosing(true);
      if (analyticsCloseTimerRef.current) clearTimeout(analyticsCloseTimerRef.current);
      analyticsCloseTimerRef.current = setTimeout(() => {
        setShowAnalytics(false);
        setAnalyticsClosing(false);
        analyticsCloseTimerRef.current = null;
      }, 200);
    }
    setSatelliteOverlay(null);
    setMapClickFocus(null);
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
    setSatelliteOverlay(null);
    setMapClickFocus(null);
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
      const a = await api.getAlerts(alertStatusFilter || undefined, regionParam, newLimit);
      alertsLimitRef.current = newLimit;
      setAlerts(a.items);
      setAlertsTotal(a.total);
    } catch {}
  }, [activeRegion, alerts.length, alertStatusFilter]);

  const handleCloseDetail = useCallback(() => {
    setDetailClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setSelectedVessel(null);
      setSelectedAlertId(null);
      setSatelliteOverlay(null);
      setDetailClosing(false);
      closeTimerRef.current = null;
    }, 200);
  }, []);

  const handleAlertAction = useCallback(async (alertId: string, newStatus: string) => {
    setAlerts((prev) =>
      prev.map((a) => a.id === alertId ? { ...a, status: newStatus } : a)
    );
    showToast(
      newStatus === "dismissed" ? "Alert dismissed" : newStatus === "acknowledged" ? "Alert acknowledged" : `Alert ${newStatus}`,
      "success"
    );
    if (newStatus === "dismissed") {
      handleCloseDetail();
    }
  }, [showToast, handleCloseDetail]);



  const handleToggleAnalytics = useCallback(() => {
    if (showAnalytics) {
      setAnalyticsClosing(true);
      analyticsCloseTimerRef.current = setTimeout(() => {
        setShowAnalytics(false);
        setAnalyticsClosing(false);
        analyticsCloseTimerRef.current = null;
      }, 200);
    } else {
      if (analyticsCloseTimerRef.current) { clearTimeout(analyticsCloseTimerRef.current); analyticsCloseTimerRef.current = null; setAnalyticsClosing(false); }
      // Close vessel detail panel if open
      if (selectedVessel) handleCloseDetail();
      setShowAnalytics(true);
      api.getRiskDistribution().then(setAnalyticsData).catch(() => {});
    }
  }, [showAnalytics, selectedVessel, handleCloseDetail]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K → command palette (works from inputs too)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") {
        if (commandOpen) setCommandOpen(false);
        else if (selectedVessel) handleCloseDetail();
        else if (showAnalytics) handleToggleAnalytics();
      }
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        showToast("Shortcuts: ⌘K = command · Esc = close · A = analytics", "info");
      }
      if (e.key === "a" && !e.ctrlKey && !e.metaKey) {
        handleToggleAnalytics();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedVessel, showAnalytics, commandOpen, handleCloseDetail, handleToggleAnalytics, showToast]);

  if (loading) {
    return (
      <div className="h-screen relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_40%_30%,rgba(167,139,250,0.06),transparent_50%),radial-gradient(ellipse_at_70%_70%,rgba(34,211,238,0.04),transparent_50%)]" />
        <div className="absolute top-3 left-3 right-3 flex items-center gap-2">
          <div className="skeleton h-8 w-32 rounded-full" />
          <div className="skeleton h-8 w-40 rounded-full" />
          <div className="skeleton h-8 w-56 rounded-full" />
          <div className="flex-1" />
          <div className="skeleton h-8 w-20 rounded-full" />
          <div className="skeleton h-8 w-24 rounded-full" />
          <div className="skeleton h-8 w-16 rounded-full" />
        </div>
      </div>
    );
  }

  const isLive = ingestionStatus?.running && ingestionStatus?.connected;
  const activeCount = alerts.filter((a) => a.status === "active").length;

  return (
    <div id="main" className="h-screen relative overflow-hidden" data-tour="map">
      {/* Full-bleed map */}
      <MapView
        vessels={vessels}
        geofences={geofences}
        selectedVesselId={selectedVessel?.id ?? null}
        onSelectVessel={handleSelectVessel}
        flyTo={mapTarget}
        satelliteOverlay={satelliteOverlay}
        onMapCenterChange={setMapCenter}
        onMapClick={setMapClickFocus}
      />

      {/* Floating top strip */}
      <FloatingChrome
        regions={regions}
        activeRegion={activeRegion}
        onSelectRegion={handleRegionChange}
        alertCount={activeCount}
        isLive={!!isLive}
        connectionOk={connectionOk}
        onToggleAnalytics={handleToggleAnalytics}
        analyticsOpen={showAnalytics}
        onOpenCommandPalette={() => setCommandOpen(true)}
      />

      {/* Ingest banner */}
      <IngestBanner
        vesselCount={vessels.length}
        status={ingestionStatus}
        isLive={!!isLive}
        connectionOk={connectionOk}
      />

      {/* Alert peeks, bottom-left */}
      <AlertPeeks
        alerts={alerts}
        onSelectAlert={handleSelectAlert}
        selectedAlertId={selectedAlertId}
      />

      {/* Command palette (⌘K) */}
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        alerts={alerts}
        vessels={vessels}
        regions={regions}
        activeRegion={activeRegion}
        onSelectAlert={handleSelectAlert}
        onSelectRegion={handleRegionChange}
        onToggleAnalytics={handleToggleAnalytics}
      />

      <FeatureTour
        active={featureTourActive}
        onComplete={() => setFeatureTourActive(false)}
        onSelectRegion={handleRegionChange}
        onSelectVessel={handleSelectVessel}
        onDeselectVessel={() => { if (selectedVessel) handleCloseDetail(); }}
        onToggleAnalytics={handleToggleAnalytics}
        onFlyTo={(center, zoom) => setMapTarget({ center, zoom, _t: Date.now() })}
        analyticsOpen={showAnalytics}
        activeRegion={activeRegion}
      />

      {(showAnalytics || analyticsClosing) && (
        <RiskDistributionPanel
          data={analyticsData}
          onClose={handleToggleAnalytics}
          closing={analyticsClosing}
        />
      )}

      {selectedVessel && (
        <VesselDetailPanel
          vessel={selectedVessel}
          alertId={selectedAlertId}
          onSatelliteOverlay={setSatelliteOverlay}
          verificationFocus={verificationFocus}
          onClose={handleCloseDetail}
          onAlertAction={handleAlertAction}
          closing={detailClosing}
        />
      )}

      {/* Inline reconnecting pill — non-destructive, keeps map visible */}
      {!connectionOk && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-[rgba(18,22,36,0.92)] backdrop-blur-xl border border-amber-400/30 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
            <span className="relative flex items-center justify-center w-2 h-2">
              <span className="absolute w-2 h-2 rounded-full bg-amber-400/40" style={{ animation: "ring-pulse 1.6s infinite" }} />
              <span className="relative w-1.5 h-1.5 rounded-full bg-amber-400" />
            </span>
            <span className="text-[12px] font-semibold text-amber-200">Reconnecting to backend…</span>
            <span className="font-mono text-[10px] text-slate-500 tracking-[0.12em] uppercase">port 3003</span>
          </div>
        </div>
      )}

      <ShortcutOverlay />

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
