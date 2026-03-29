"use client";

import { useState, useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import type {
  VesselDetail as VesselDetailType,
  VerificationRequest,
  RiskHistoryPoint,
  SatelliteAcquisition,
  SatelliteInfoResponse,
} from "@/app/lib/api";
import { api } from "@/app/lib/api";
import { riskTextClass, riskLevel, RISK_THRESHOLDS } from "@/app/lib/risk";

import type { SatelliteOverlay } from "./MapView";

interface VesselDetailProps {
  vessel: VesselDetailType;
  alertId: string | null;
  onClose: () => void;
  onSatelliteOverlay?: (overlay: SatelliteOverlay | null) => void;
  onAlertAction?: (alertId: string, newStatus: string) => void;
  closing?: boolean;
  verificationFocus?: { latitude: number; longitude: number } | null;
}

function actionStyle(action: string) {
  switch (action) {
    case "escalate": return "bg-red-500/10 text-red-400 border-red-500/25";
    case "verify": return "bg-orange-500/10 text-orange-400 border-orange-500/25";
    case "monitor": return "bg-yellow-500/10 text-yellow-400 border-yellow-500/25";
    case "normal": return "bg-green-500/10 text-green-400 border-green-500/25";
    default: return "bg-slate-500/10 text-slate-400 border-slate-500/25";
  }
}

const riskColor = riskTextClass;

function severityLabel(severity: number): { text: string; color: string } {
  if (severity >= 0.55) return { text: "Critical", color: "text-red-400" };
  if (severity >= 0.35) return { text: "High", color: "text-orange-400" };
  if (severity >= 0.2) return { text: "Moderate", color: "text-yellow-400" };
  return { text: "Low", color: "text-green-400" };
}

const SIGNAL_LABELS: Record<string, string> = {
  ais_gap: "AIS Dark Period",
  kinematic_implausibility: "Position Spoofing",
  geofence_breach: "Restricted Zone Breach",
  type_mismatch: "Identity Mismatch",
  route_deviation: "Route Deviation",
  loitering: "Loitering",
  zone_lingering: "Zone Lingering",
  speed_anomaly: "Speed Anomaly",
  heading_anomaly: "Course Anomaly",
  statistical_outlier: "Regional Outlier",
  collision_risk: "COLREGS Non-Compliance",
  dark_ship_optical: "Dark Ship (Optical)",
};

function signalLabel(type: string): string {
  return SIGNAL_LABELS[type] ?? type.replace(/_/g, " ");
}

const DEFAULT_BROWSER_SPREAD_DEG = 0.08;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIsoDate(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function buildFocusBBox(latitude: number, longitude: number, spreadDeg = DEFAULT_BROWSER_SPREAD_DEG): [number, number, number, number] {
  return [
    longitude - spreadDeg,
    latitude - spreadDeg,
    longitude + spreadDeg,
    latitude + spreadDeg,
  ];
}

function formatAcquisitionTime(datetimeValue: string | null): string {
  if (!datetimeValue) return "Unknown acquisition";
  return new Date(datetimeValue).toLocaleString();
}


function RiskSparkline({ data }: { data: RiskHistoryPoint[] }) {
  if (data.length < 2) return null;

  const w = 320;
  const h = 56;
  const padX = 1;
  const padTop = 8;
  const padBottom = 1;
  const chartH = h - padTop - padBottom;
  const scores = data.map((d) => d.risk_score);

  // Always show 0-100 so threshold bands are stable
  const points = scores.map((s, i) => {
    const x = padX + (i / (scores.length - 1)) * (w - padX * 2);
    const y = padTop + (1 - s / 100) * chartH;
    return { x, y };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Gradient fill area
  const firstPt = points[0];
  const lastPt = points[points.length - 1];
  const fillPath = `M${firstPt.x},${firstPt.y} ${points.map((p) => `L${p.x},${p.y}`).join(" ")} L${lastPt.x},${padTop + chartH} L${firstPt.x},${padTop + chartH} Z`;

  const last = scores[scores.length - 1];
  const first = scores[0];
  const trend = last - first;
  const trendLabel = trend > 5 ? "Escalating" : trend < -5 ? "De-escalating" : "Stable";
  const trendIcon = trend > 5 ? "\u2197" : trend < -5 ? "\u2198" : "\u2192";
  const trendColor = trend > 5 ? "text-red-400" : trend < -5 ? "text-green-400" : "text-slate-500";

  const lineColor = last >= RISK_THRESHOLDS.escalate ? "#f87171" : last >= RISK_THRESHOLDS.verify ? "#fb923c" : last >= RISK_THRESHOLDS.monitor ? "#facc15" : "#4ade80";
  const fillOpacity = "0.08";

  // Threshold y positions
  const threshY = (score: number) => padTop + (1 - score / 100) * chartH;

  // Time labels
  const firstTime = data[0]?.timestamp;
  const lastTime = data[data.length - 1]?.timestamp;
  const formatTime = (ts: string) => {
    const d = new Date(ts.endsWith("Z") ? ts : ts + "Z");
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="mt-3 bg-[#111827] rounded-lg border border-[#1a2235] overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-[9px] text-slate-600 uppercase tracking-wider font-medium">Risk Trend</span>
        <span className={`text-[9px] font-semibold uppercase tracking-wide flex items-center gap-1 ${trendColor}`}>
          <span>{trendIcon}</span> {trendLabel}
        </span>
      </div>
      <div className="px-2 pb-1">
        <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block">
          <defs>
            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {/* Threshold zone bands */}
          <rect x={0} y={threshY(100)} width={w} height={threshY(RISK_THRESHOLDS.escalate) - threshY(100)} fill="#ef4444" opacity="0.04" />
          <rect x={0} y={threshY(RISK_THRESHOLDS.escalate)} width={w} height={threshY(RISK_THRESHOLDS.verify) - threshY(RISK_THRESHOLDS.escalate)} fill="#f97316" opacity="0.04" />
          <rect x={0} y={threshY(RISK_THRESHOLDS.verify)} width={w} height={threshY(RISK_THRESHOLDS.monitor) - threshY(RISK_THRESHOLDS.verify)} fill="#f59e0b" opacity="0.04" />
          {/* Threshold lines */}
          <line x1={0} y1={threshY(RISK_THRESHOLDS.escalate)} x2={w} y2={threshY(RISK_THRESHOLDS.escalate)} stroke="#ef4444" strokeWidth="0.5" opacity="0.2" strokeDasharray="3,3" />
          <line x1={0} y1={threshY(RISK_THRESHOLDS.verify)} x2={w} y2={threshY(RISK_THRESHOLDS.verify)} stroke="#f97316" strokeWidth="0.5" opacity="0.2" strokeDasharray="3,3" />
          <line x1={0} y1={threshY(RISK_THRESHOLDS.monitor)} x2={w} y2={threshY(RISK_THRESHOLDS.monitor)} stroke="#f59e0b" strokeWidth="0.5" opacity="0.2" strokeDasharray="3,3" />
          {/* Gradient fill */}
          <path d={fillPath} fill="url(#sparkFill)" />
          {/* Line */}
          <polyline points={polyline} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          {/* Current value dot */}
          <circle cx={lastPt.x} cy={lastPt.y} r="3" fill={lineColor} />
          <circle cx={lastPt.x} cy={lastPt.y} r="5" fill={lineColor} opacity="0.2" />
        </svg>
      </div>
      <div className="flex items-center justify-between px-3 pb-2">
        <span className="text-[8px] text-slate-600 font-mono">{firstTime ? formatTime(firstTime) : ""}</span>
        <span className="text-[8px] text-slate-600 font-mono">{lastTime ? formatTime(lastTime) : ""}</span>
      </div>
    </div>
  );
}

export default function VesselDetailPanel({
  vessel,
  alertId,
  onClose,
  onSatelliteOverlay,
  onAlertAction,
  closing,
  verificationFocus,
}: VesselDetailProps) {
  const [verification, setVerification] = useState<VerificationRequest | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportReport, setExportReport] = useState<Record<string, unknown> | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [riskHistory, setRiskHistory] = useState<RiskHistoryPoint[]>([]);
  const [satelliteInfo, setSatelliteInfo] = useState<SatelliteInfoResponse | null>(null);
  const [imageryTarget, setImageryTarget] = useState<"vessel" | "focus">("vessel");
  const [imageryDateFrom, setImageryDateFrom] = useState(() => daysAgoIsoDate(30));
  const [imageryDateTo, setImageryDateTo] = useState(() => todayIsoDate());
  const [imageryCloudCover, setImageryCloudCover] = useState(50);
  const [imageryResults, setImageryResults] = useState<SatelliteAcquisition[]>([]);
  const [imageryLoading, setImageryLoading] = useState(false);
  const [imageryError, setImageryError] = useState<string | null>(null);
  const [imagerySearchBBox, setImagerySearchBBox] = useState<[number, number, number, number] | null>(null);
  const [activeAcquisitionKey, setActiveAcquisitionKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getRiskHistory(vessel.id, 6).then((data) => {
      if (!cancelled) setRiskHistory(data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [vessel.id]);

  useEffect(() => {
    let cancelled = false;
    api.getSatelliteInfo().then((info) => {
      if (!cancelled) {
        setSatelliteInfo(info);
      }
    }).catch(() => {
      if (!cancelled) {
        setSatelliteInfo(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!verificationFocus && imageryTarget === "focus") {
      setImageryTarget("vessel");
    }
  }, [verificationFocus, imageryTarget]);

  const runImagerySearch = useCallback(async () => {
    if (!satelliteInfo?.configured) {
      setImageryResults([]);
      setImagerySearchBBox(null);
      setImageryError("Sentinel imagery search is unavailable until Copernicus credentials are configured.");
      return;
    }

    setImageryLoading(true);
    setImageryError(null);
    try {
      if (imageryTarget === "focus" && verificationFocus) {
        const bbox = buildFocusBBox(
          verificationFocus.latitude,
          verificationFocus.longitude,
        );
        const response = await api.searchSatelliteImagery({
          west: bbox[0],
          south: bbox[1],
          east: bbox[2],
          north: bbox[3],
          dateFrom: imageryDateFrom,
          dateTo: imageryDateTo,
          maxCloudCover: imageryCloudCover,
          limit: 8,
        });
        setImageryResults(response.results);
        setImagerySearchBBox(bbox);
        return;
      }

      const response = await api.searchSatelliteImagery({
        vesselId: vessel.id,
        spreadDeg: DEFAULT_BROWSER_SPREAD_DEG,
        dateFrom: imageryDateFrom,
        dateTo: imageryDateTo,
        maxCloudCover: imageryCloudCover,
        limit: 8,
      });
      setImageryResults(response.results);
      setImagerySearchBBox(
        response.bbox
          ? [response.bbox.west, response.bbox.south, response.bbox.east, response.bbox.north]
          : null
      );
    } catch (error) {
      setImageryResults([]);
      setImagerySearchBBox(null);
      setImageryError(error instanceof Error ? error.message : "Failed to search satellite imagery.");
    } finally {
      setImageryLoading(false);
    }
  }, [
    imageryCloudCover,
    imageryDateFrom,
    imageryDateTo,
    imageryTarget,
    satelliteInfo?.configured,
    verificationFocus,
    vessel.id,
  ]);

  const handleApplyAcquisition = useCallback((acquisition: SatelliteAcquisition) => {
    const bbox = imagerySearchBBox ?? acquisition.bbox;
    if (!bbox || !onSatelliteOverlay) return;

    const acquisitionDate = acquisition.datetime?.split("T", 1)[0];
    onSatelliteOverlay({
      imageSrc: acquisition.render_url ?? api.getSatelliteImageryUrl({
        west: bbox[0],
        south: bbox[1],
        east: bbox[2],
        north: bbox[3],
        dateFrom: acquisitionDate,
        dateTo: acquisitionDate,
      }),
      bbox,
      renderToken: acquisition.id ?? acquisition.datetime ?? new Date().toISOString(),
    });
    setActiveAcquisitionKey(acquisition.id ?? acquisition.render_url ?? acquisition.datetime ?? null);
  }, [imagerySearchBBox, onSatelliteOverlay]);

  const handleClearImageryOverlay = useCallback(() => {
    onSatelliteOverlay?.(null);
    setActiveAcquisitionKey(null);
  }, [onSatelliteOverlay]);

  const handleExportReport = useCallback(() => {
    if (showReport) {
      setShowReport(false);
      return;
    }
    setExportLoading(true);
    api.getVesselReport(vessel.id).then((report) => {
      setExportReport(report);
      setShowReport(true);
    }).catch((e) => {
      console.error("Export report failed:", e);
    }).finally(() => {
      setExportLoading(false);
    });
  }, [vessel.id, showReport]);


  // Alert action state
  const [alertStatus, setAlertStatus] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Operator notes state
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [savedNotes, setSavedNotes] = useState<string[]>(
    (vessel as unknown as Record<string, unknown>).operator_notes
      ? ((vessel as unknown as Record<string, unknown>).operator_notes as string[])
      : []
  );

  // Feedback state
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const handleAlertAction = useCallback(async (action: string) => {
    if (!alertId) return;
    setActionLoading(action);
    try {
      const res = await api.alertAction(alertId, action);
      setAlertStatus(res.status);
      onAlertAction?.(alertId, res.status);
    } catch (e) {
      console.error("Alert action failed:", e);
    } finally {
      setActionLoading(null);
    }
  }, [alertId, onAlertAction]);

  const handleSaveNote = useCallback(async () => {
    if (!alertId || !noteText.trim()) return;
    setNoteSaving(true);
    try {
      await api.alertAction(alertId, "note", noteText.trim());
      setSavedNotes((prev) => [...prev, noteText.trim()]);
      setNoteText("");
    } catch (e) {
      console.error("Save note failed:", e);
    } finally {
      setNoteSaving(false);
    }
  }, [alertId, noteText]);

  const handleFeedback = useCallback(async (value: string) => {
    if (!alertId) return;
    setFeedbackLoading(true);
    try {
      await api.alertAction(alertId, "feedback", undefined, value);
      setFeedback(value);
    } catch (e) {
      console.error("Feedback failed:", e);
    } finally {
      setFeedbackLoading(false);
    }
  }, [alertId]);

  const handleVerify = async () => {
    if (!alertId) return;
    setVerifyLoading(true);
    try {
      const vr = await api.createVerificationRequest(alertId, vessel.id, verificationFocus);
      setVerification(vr);
    } catch (e) {
      console.error("Verification request failed:", e);
    } finally {
      setVerifyLoading(false);
    }
  };

  const riskScore = vessel.risk_score ?? 0;
  const level = riskLevel(riskScore);
  const action = level === "normal" ? "normal" : (vessel.recommended_action ?? "normal");

  if (showReport && exportReport) {
    return (
      <div
        className="w-[360px] bg-[#0d1320] border-l border-[#1a2235] flex flex-col shrink-0 overflow-y-auto shadow-2xl shadow-black/50"
        style={{ animation: closing ? "slide-out-right 0.2s ease-in forwards" : "slide-in-right 0.25s ease-out" }}
      >
        <ReportView report={exportReport} onBack={() => setShowReport(false)} />
      </div>
    );
  }

  return (
    <div
      className="w-[360px] bg-[#0d1320] border-l border-[#1a2235] flex flex-col shrink-0 overflow-y-auto shadow-2xl shadow-black/50"
      style={{ animation: closing ? "slide-out-right 0.2s ease-in forwards" : "slide-in-right 0.25s ease-out" }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1a2235]">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="text-base font-semibold text-slate-100 truncate">{vessel.name}</h2>
            <span className="text-[11px] text-slate-500 font-mono">
              MMSI {vessel.mmsi}{vessel.imo ? ` / IMO ${vessel.imo}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExportReport}
              disabled={exportLoading}
              className={`text-[10px] uppercase tracking-wider transition-colors disabled:opacity-50 ${showReport ? "text-blue-400" : "text-slate-500 hover:text-blue-400"}`}
            >
              {exportLoading ? "..." : "More Info"}
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-[#111827] border border-[#1a2235] flex items-center justify-center text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Inactive / Resolved Status Banner */}
      {(vessel.is_inactive || vessel.is_resolved) && (
        <div className="bg-slate-500/10 border-b border-[#1a2235] px-4 py-2 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
            {vessel.is_resolved ? "RESOLVED" : vessel.status_reason?.toLowerCase().includes("stationary") ? "STATIONARY" : "INACTIVE"}
          </span>
          <span className="text-[10px] text-slate-500 truncate">
            {vessel.status_reason || "No active threat profile"}
          </span>
        </div>
      )}

      {/* Risk Score */}
      <div className="px-4 py-3 border-b border-[#1a2235]">
        <div className="flex items-center gap-3 mb-2">
          <span className={`text-3xl font-bold font-mono leading-none ${riskColor(riskScore)}`}>
            {Math.round(riskScore)}
          </span>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Risk</span>
              <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded border ${actionStyle(action)}`}>
                {action}
              </span>
            </div>
            <div className="w-full bg-[#111827] rounded-full h-1 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  riskScore >= RISK_THRESHOLDS.escalate ? "bg-red-400" : riskScore >= RISK_THRESHOLDS.verify ? "bg-orange-400" : riskScore >= RISK_THRESHOLDS.monitor ? "bg-yellow-400" : "bg-green-400"
                }`}
                style={{ width: `${riskScore}%` }}
              />
            </div>
          </div>
        </div>
        {riskHistory.length >= 2 && <RiskSparkline data={riskHistory} />}
        {vessel.explanation && (
          <p className="text-[11px] text-slate-400 leading-relaxed mt-3">{vessel.explanation}</p>
        )}
      </div>

      {/* Edge Node Detection Stats */}
      {(() => {
        const edgeSignal = vessel.anomaly_signals.find(
          (s) => s.details && (s.details as Record<string, unknown>).source === "edge_node"
        );
        if (!edgeSignal) return null;
        const d = edgeSignal.details as Record<string, unknown>;
        const rawDist = d.raw_distance_m as number | null;
        const scaledDist = d.scaled_distance_nm as number | null;
        const vel = d.velocity_ms as number | null;
        const heading = d.heading_deg as number | null;
        const nodeId = d.node_id as string;
        return (
          <div className="p-5 border-b border-[#1a2235]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Edge Node Detection</h3>
              <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">{nodeId}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#111827] rounded-lg p-3 border border-[#1a2235]">
                <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-1">Range</span>
                <span className="text-lg font-bold font-mono text-cyan-400">{rawDist != null ? `${rawDist.toFixed(2)}m` : "—"}</span>
                {scaledDist != null && <span className="text-[9px] text-slate-500 block mt-0.5">{scaledDist.toFixed(1)} nm scaled</span>}
              </div>
              <div className="bg-[#111827] rounded-lg p-3 border border-[#1a2235]">
                <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-1">Velocity</span>
                <span className={`text-lg font-bold font-mono ${vel && vel > 0.1 ? "text-amber-400" : "text-emerald-400"}`}>
                  {vel != null ? vel.toFixed(3) : "0.000"}
                </span>
                <span className="text-[9px] text-slate-500 block mt-0.5">m/s</span>
              </div>
              <div className="bg-[#111827] rounded-lg p-3 border border-[#1a2235]">
                <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-1">Bearing</span>
                <span className="text-lg font-bold font-mono text-slate-300">{heading != null ? `${heading.toFixed(0)}°` : "—"}</span>
              </div>
              <div className="bg-[#111827] rounded-lg p-3 border border-[#1a2235]">
                <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-1">Confidence</span>
                <span className="text-lg font-bold font-mono text-blue-400">{(edgeSignal.severity * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Live Camera Feed — from SeaPod edge node */}
      {(() => {
        const streamSignal = vessel.anomaly_signals.find(
          (s) => s.details && (s.details as Record<string, unknown>).stream_url
        );
        const streamUrl = streamSignal
          ? String((streamSignal.details as Record<string, unknown>).stream_url)
          : null;
        if (!streamUrl || streamUrl === "null") return null;
        return (
          <div className="px-4 py-3 border-b border-[#1a2235]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                Live Camera Feed
              </h3>
              <a
                href={streamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] text-blue-400 hover:text-blue-300"
              >
                Fullscreen
              </a>
            </div>
            <div className="rounded-lg overflow-hidden bg-black aspect-video border border-[#1a2235]">
              <iframe
                src={streamUrl}
                title="SeaPod live camera feed"
                className="w-full h-full border-0"
                allow="autoplay"
                sandbox="allow-same-origin allow-scripts"
              />
            </div>
          </div>
        );
      })()}

      {/* Anomaly Signals */}
      {vessel.anomaly_signals.length > 0 && (
        <div className="px-4 py-3 border-b border-[#1a2235]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
              Anomaly Signals
            </h3>
            <span className="text-[9px] font-mono text-slate-600 bg-[#111827] px-2 py-0.5 rounded">
              {vessel.anomaly_signals.length} detected
            </span>
          </div>
          <div className="space-y-2">
            {vessel.anomaly_signals.map((signal, i) => {
              const sev = severityLabel(signal.severity);
              const sevPct = Math.min(signal.severity * 100, 100);
              const barColor = signal.severity >= 0.55 ? "bg-red-400" : signal.severity >= 0.35 ? "bg-orange-400" : signal.severity >= 0.2 ? "bg-yellow-400" : "bg-green-400";
              return (
                <div key={i} className="bg-[#111827] rounded-lg p-3 border border-[#1a2235]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-slate-200">
                      {signalLabel(signal.anomaly_type)}
                    </span>
                    <span className={`text-[9px] font-bold uppercase ${sev.color}`}>
                      {sev.text}
                    </span>
                  </div>
                  <div className="w-full bg-[#0d1320] rounded-full h-1 mb-2">
                    <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${sevPct}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">{signal.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Position & Kinematics */}
      {vessel.latest_position && (
        <div className="px-4 py-3 border-b border-[#1a2235]">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">Position & Kinematics</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#111827] rounded-lg p-3 border border-[#1a2235]">
              <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-1">Latitude</span>
              <span className="text-sm font-bold font-mono text-slate-200">{vessel.latest_position.latitude.toFixed(5)}</span>
            </div>
            <div className="bg-[#111827] rounded-lg p-3 border border-[#1a2235]">
              <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-1">Longitude</span>
              <span className="text-sm font-bold font-mono text-slate-200">{vessel.latest_position.longitude.toFixed(5)}</span>
            </div>
            <div className="bg-[#111827] rounded-lg p-3 border border-[#1a2235]">
              <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-1">Speed</span>
              <span className="text-sm font-bold font-mono text-blue-400">
                {vessel.latest_position.speed_over_ground != null ? `${vessel.latest_position.speed_over_ground.toFixed(1)}` : "\u2014"}
              </span>
              {vessel.latest_position.speed_over_ground != null && <span className="text-[9px] text-slate-600 ml-1">kt</span>}
            </div>
            <div className="bg-[#111827] rounded-lg p-3 border border-[#1a2235]">
              <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-1">Course</span>
              <span className="text-sm font-bold font-mono text-blue-400">
                {vessel.latest_position.course_over_ground != null ? `${vessel.latest_position.course_over_ground.toFixed(0)}\u00B0` : "\u2014"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Vessel Identity */}
      <div className="px-4 py-3 border-b border-[#1a2235]">
        <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">Vessel Identity</h3>
        <div className="bg-[#111827] rounded-lg border border-[#1a2235] divide-y divide-[#1a2235]">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[10px] text-slate-500">Type</span>
            <span className="text-[11px] font-medium text-slate-200">{vessel.vessel_type}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[10px] text-slate-500">Flag</span>
            <span className="text-[11px] font-medium text-slate-200">{vessel.flag_state}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[10px] text-slate-500">Callsign</span>
            <span className="text-[11px] font-medium font-mono text-slate-200">{vessel.callsign || "\u2014"}</span>
          </div>
          {vessel.destination && (
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[10px] text-slate-500">Destination</span>
              <span className="text-[11px] font-medium text-slate-200">{vessel.destination}</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div className="bg-[#111827] rounded-lg p-2.5 border border-[#1a2235] text-center">
            <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-0.5">Length</span>
            <span className="text-[12px] font-bold font-mono text-slate-300">{vessel.length ? `${parseFloat(vessel.length.toFixed(1))}m` : "\u2014"}</span>
          </div>
          <div className="bg-[#111827] rounded-lg p-2.5 border border-[#1a2235] text-center">
            <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-0.5">Beam</span>
            <span className="text-[12px] font-bold font-mono text-slate-300">{vessel.beam ? `${parseFloat(vessel.beam.toFixed(1))}m` : "\u2014"}</span>
          </div>
          <div className="bg-[#111827] rounded-lg p-2.5 border border-[#1a2235] text-center">
            <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-0.5">Draft</span>
            <span className="text-[12px] font-bold font-mono text-slate-300">{vessel.draft ? `${parseFloat(vessel.draft.toFixed(1))}m` : "\u2014"}</span>
          </div>
        </div>
        {vessel.inspection_deficiencies > 0 && (
          <div className="mt-2 bg-orange-500/10 rounded-lg p-2.5 border border-orange-500/20 flex items-center gap-2">
            <span className="text-orange-400 text-[11px]">&#9888;</span>
            <span className="text-[10px] text-orange-400 font-medium">{vessel.inspection_deficiencies} inspection {vessel.inspection_deficiencies === 1 ? "deficiency" : "deficiencies"}</span>
          </div>
        )}
      </div>

      {/* Weather Conditions */}
      {vessel.weather && (
        <div className="px-4 py-3 border-b border-[#1a2235]">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">Weather Conditions</h3>
          {(vessel.weather.wind_speed_kt > 25 || vessel.weather.visibility_nm < 2) && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
              <span className="text-amber-400 text-[11px]">&#9888;</span>
              <p className="text-[10px] text-amber-400 font-medium">
                Adverse weather — detection thresholds adjusted
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#111827] rounded-lg p-3 border border-[#1a2235]">
              <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-1">Wind</span>
              <span className={`text-sm font-bold font-mono ${vessel.weather.wind_speed_kt > 25 ? "text-amber-400" : "text-slate-200"}`}>
                {vessel.weather.wind_speed_kt.toFixed(0)} kt
              </span>
              <span className="text-[9px] text-slate-500 block mt-0.5">{vessel.weather.wind_direction}</span>
            </div>
            <div className="bg-[#111827] rounded-lg p-3 border border-[#1a2235]">
              <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-1">Visibility</span>
              <span className={`text-sm font-bold font-mono ${vessel.weather.visibility_nm < 2 ? "text-amber-400" : "text-emerald-400"}`}>
                {vessel.weather.visibility_nm.toFixed(1)} nm
              </span>
            </div>
            {vessel.weather.temperature_f != null && (
              <div className="bg-[#111827] rounded-lg p-3 border border-[#1a2235]">
                <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-1">Temperature</span>
                <span className="text-sm font-bold font-mono text-slate-200">{vessel.weather.temperature_f}°F</span>
              </div>
            )}
            {vessel.weather.description && (
              <div className="bg-[#111827] rounded-lg p-3 border border-[#1a2235]">
                <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-1">Forecast</span>
                <span className="text-[11px] text-slate-300 leading-snug">{vessel.weather.description}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Verification Action */}
      {riskScore >= RISK_THRESHOLDS.monitor && (
        <div className="px-4 py-3">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Verification</h3>
          {verification ? (
            <SatelliteVerificationResult
              verification={verification}
              vesselPosition={vessel.latest_position}
              onOverlay={onSatelliteOverlay}
            />
          ) : (
            <div className="space-y-2.5">
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Request the latest available satellite imagery for the current vessel position or the current map focus.
              </p>
              <button
                onClick={handleVerify}
                disabled={verifyLoading || !alertId}
                className="w-full py-2 px-3 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/25 hover:border-blue-500/40 disabled:bg-[#111827] disabled:border-[#1a2235] disabled:text-slate-600 text-blue-400 text-[11px] font-medium rounded-lg transition-all"
              >
                {verifyLoading ? "Requesting..." : "Request Satellite Imagery"}
              </button>
            </div>
          )}
        </div>
      )}

      {riskScore >= RISK_THRESHOLDS.monitor && (
        <div className="px-4 py-3 border-t border-[#1a2235]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Imagery Browser</h3>
            <span className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded-md border ${
              satelliteInfo?.configured
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-slate-500/10 text-slate-400 border-slate-500/20"
            }`}>
              {satelliteInfo?.configured ? "live" : "fallback"}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed mb-3">
            Browse recent satellite acquisitions for the vessel area or the current map focus, then apply the selected scene as a map overlay.
          </p>

          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setImageryTarget("vessel")}
                className={`text-[10px] py-1.5 rounded-md font-medium transition-all ${
                  imageryTarget === "vessel"
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "bg-[#111827] text-slate-500 border border-[#1a2235] hover:text-slate-300"
                }`}
              >
                Vessel Area
              </button>
              <button
                type="button"
                onClick={() => verificationFocus && setImageryTarget("focus")}
                disabled={!verificationFocus}
                className={`text-[10px] py-1.5 rounded-md font-medium transition-all ${
                  imageryTarget === "focus"
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "bg-[#111827] text-slate-500 border border-[#1a2235] hover:text-slate-300"
                } disabled:opacity-40 disabled:hover:text-slate-500`}
              >
                Map Focus
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[9px] text-slate-600 uppercase tracking-wider">From</span>
                <input
                  type="date"
                  value={imageryDateFrom}
                  max={imageryDateTo}
                  onChange={(event) => setImageryDateFrom(event.target.value)}
                  className="bg-[#111827] border border-[#1a2235] rounded-md px-2 py-1.5 text-[10px] text-slate-300 focus:outline-none focus:border-slate-600"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] text-slate-600 uppercase tracking-wider">To</span>
                <input
                  type="date"
                  value={imageryDateTo}
                  min={imageryDateFrom}
                  max={todayIsoDate()}
                  onChange={(event) => setImageryDateTo(event.target.value)}
                  className="bg-[#111827] border border-[#1a2235] rounded-md px-2 py-1.5 text-[10px] text-slate-300 focus:outline-none focus:border-slate-600"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[9px] text-slate-600 uppercase tracking-wider">Max Cloud Cover</span>
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={imageryCloudCover}
                onChange={(event) => setImageryCloudCover(Math.min(100, Math.max(0, Number(event.target.value) || 0)))}
                className="bg-[#111827] border border-[#1a2235] rounded-md px-2 py-1.5 text-[10px] text-slate-300 focus:outline-none focus:border-slate-600"
              />
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void runImagerySearch()}
                disabled={imageryLoading || !satelliteInfo?.configured}
                className="flex-1 py-2 px-3 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/25 hover:border-blue-500/40 disabled:bg-[#111827] disabled:border-[#1a2235] disabled:text-slate-600 text-blue-400 text-[11px] font-medium rounded-lg transition-all"
              >
                {imageryLoading ? "Searching..." : "Search Acquisitions"}
              </button>
              <button
                type="button"
                onClick={handleClearImageryOverlay}
                className="py-2 px-3 bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/20 hover:border-slate-500/30 text-slate-400 text-[11px] font-medium rounded-lg transition-all"
              >
                Clear Overlay
              </button>
            </div>

            {imageryTarget === "focus" && verificationFocus && (
              <p className="text-[9px] text-slate-600 font-mono">
                Focus: {verificationFocus.latitude.toFixed(4)}, {verificationFocus.longitude.toFixed(4)}
              </p>
            )}

            {!satelliteInfo?.configured && (
              <div className="rounded-lg border border-slate-500/20 bg-slate-500/10 p-3">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Sentinel search is unavailable until Copernicus credentials are configured. The basemap will continue using fallback imagery.
                </p>
              </div>
            )}

            {imageryError && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                <p className="text-[10px] text-red-300 leading-relaxed">{imageryError}</p>
              </div>
            )}

            {satelliteInfo?.configured && !imageryError && (
              <div className="space-y-2">
                {imageryResults.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {imageryResults.map((acquisition, index) => {
                      const acquisitionKey = acquisition.id ?? acquisition.render_url ?? acquisition.datetime ?? `acq-${index}`;
                      const isActiveOverlay = activeAcquisitionKey === acquisitionKey;
                      return (
                        <button
                          key={acquisitionKey}
                          type="button"
                          onClick={() => handleApplyAcquisition(acquisition)}
                          className={`w-full text-left rounded-lg border p-3 transition-all ${
                            isActiveOverlay
                              ? "bg-blue-500/12 border-blue-500/30"
                              : "bg-[#111827] border-[#1a2235] hover:border-slate-600"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] text-slate-200 font-medium truncate">
                                {formatAcquisitionTime(acquisition.datetime)}
                              </p>
                              <p className="text-[9px] text-slate-500 mt-1">
                                {(acquisition.satellite || "Sentinel-2")} • {acquisition.processing_level || "L2A"}
                              </p>
                            </div>
                            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                              acquisition.cloud_cover != null && acquisition.cloud_cover > 20
                                ? "text-amber-300 bg-amber-500/10"
                                : "text-emerald-300 bg-emerald-500/10"
                            }`}>
                              {acquisition.cloud_cover != null ? `${acquisition.cloud_cover}% cloud` : "cloud n/a"}
                            </span>
                          </div>
                          <p className="text-[9px] text-cyan-300/80 mt-2">
                            {isActiveOverlay ? "Overlay active" : "Apply overlay"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                ) : !imageryLoading ? (
                  <div className="rounded-lg border border-[#1a2235] bg-[#111827] p-3">
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      No acquisitions matched this search window.
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alert Actions */}
      {alertId && (
        <div className="px-4 py-3 border-b border-[#1a2235]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Actions</h3>
            {alertStatus && (
              <span className="text-[9px] font-semibold uppercase px-2 py-0.5 rounded-md border bg-blue-500/10 text-blue-400 border-blue-500/25">
                {alertStatus}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleAlertAction("acknowledge")}
              disabled={actionLoading !== null}
              className="flex-1 py-2 px-3 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/25 hover:border-blue-500/40 disabled:opacity-50 text-blue-400 text-[11px] font-medium rounded-lg transition-all"
            >
              {actionLoading === "acknowledge" ? "..." : "Acknowledge"}
            </button>
            <button
              onClick={() => handleAlertAction("dismiss")}
              disabled={actionLoading !== null}
              className="flex-1 py-2 px-3 bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/20 hover:border-slate-500/30 disabled:opacity-50 text-slate-400 text-[11px] font-medium rounded-lg transition-all"
            >
              {actionLoading === "dismiss" ? "..." : "Dismiss"}
            </button>
            <button
              onClick={() => handleAlertAction("pin")}
              disabled={actionLoading !== null}
              className="flex-1 py-2 px-3 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/25 hover:border-yellow-500/35 disabled:opacity-50 text-yellow-400 text-[11px] font-medium rounded-lg transition-all"
            >
              {actionLoading === "pin" ? "..." : "Pin"}
            </button>
          </div>
        </div>
      )}

      {/* Operator Notes */}
      {alertId && (
        <div className="px-4 py-3 border-b border-[#1a2235]">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Notes</h3>
          {savedNotes.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {savedNotes.map((note, i) => (
                <div key={i} className="bg-[#111827] rounded-md p-2.5 border border-[#1a2235]">
                  <p className="text-[11px] text-slate-300 leading-relaxed">{note}</p>
                </div>
              ))}
            </div>
          )}
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note..."
            rows={2}
            className="w-full bg-[#111827] border border-[#1a2235] rounded-lg p-2.5 text-[11px] text-slate-300 placeholder-slate-600 resize-none focus:outline-none focus:border-slate-600 transition-colors"
          />
          <button
            onClick={handleSaveNote}
            disabled={noteSaving || !noteText.trim()}
            className="mt-2 w-full py-2 px-3 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/25 hover:border-blue-500/40 disabled:bg-[#111827] disabled:border-[#1a2235] disabled:text-slate-600 text-blue-400 text-[11px] font-medium rounded-lg transition-all"
          >
            {noteSaving ? "Saving..." : "Save Note"}
          </button>
        </div>
      )}

      {/* Feedback */}
      {alertId && (
        <div className="px-4 py-3">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Feedback</h3>
          {feedback ? (
            <div className={`rounded-lg p-3 border text-center text-[11px] font-medium ${
              feedback === "confirmed_threat"
                ? "bg-red-500/10 text-red-400 border-red-500/25"
                : "bg-slate-500/10 text-slate-400 border-slate-500/20"
            }`}>
              Marked as: {feedback === "confirmed_threat" ? "Confirmed Threat" : "False Positive"}
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => handleFeedback("confirmed_threat")}
                disabled={feedbackLoading}
                className="flex-1 py-2 px-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 hover:border-red-500/35 disabled:opacity-50 text-red-400 text-[11px] font-medium rounded-lg transition-all"
              >
                {feedbackLoading ? "..." : "Confirmed Threat"}
              </button>
              <button
                onClick={() => handleFeedback("false_positive")}
                disabled={feedbackLoading}
                className="flex-1 py-2 px-3 bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/20 hover:border-slate-500/30 disabled:opacity-50 text-slate-400 text-[11px] font-medium rounded-lg transition-all"
              >
                {feedbackLoading ? "..." : "False Positive"}
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}


function ReportView({ report, onBack }: { report: Record<string, unknown>; onBack: () => void }) {
  const trail = report.position_trail as Record<string, unknown>[];
  const audit = report.alert_audit_trail as Record<string, unknown>[];
  const notes = report.operator_notes ? String(report.operator_notes) : null;

  return (
    <>
      {/* Report Header */}
      <div className="px-4 py-3 border-b border-[#1a2235] flex items-center">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-blue-400 transition-colors uppercase tracking-wider font-medium shrink-0"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex-1 text-center">More Info</span>
        <button
          onClick={() => {
            const v = report.vessel as Record<string, unknown> | undefined;
            if (v?.id) window.open(`/report?vesselId=${v.id}`, "_blank");
          }}
          className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-blue-400 transition-colors uppercase tracking-wider font-medium shrink-0"
        >
          Export
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </button>
      </div>

      {/* Report Body */}
      <div className="px-4 py-4 space-y-4">
        {/* Position Trail */}
        {trail?.length > 0 && (
          <Section title={`Position Trail (${trail.length} points)`}>
            <div className="bg-[#111827] rounded-lg border border-[#1a2235] overflow-hidden">
              <div className="grid grid-cols-5 gap-px bg-[#1a2235] text-[9px] text-slate-500 uppercase tracking-wider font-medium">
                <div className="bg-[#0d1320] px-2 py-1.5">Time</div>
                <div className="bg-[#0d1320] px-2 py-1.5">Lat</div>
                <div className="bg-[#0d1320] px-2 py-1.5">Lon</div>
                <div className="bg-[#0d1320] px-2 py-1.5">Speed</div>
                <div className="bg-[#0d1320] px-2 py-1.5">Course</div>
              </div>
              {trail.slice(0, 20).map((p, i) => (
                <div key={i} className="grid grid-cols-5 gap-px bg-[#1a2235] text-[10px] font-mono text-slate-400">
                  <div className="bg-[#0d1320] px-2 py-1">{new Date(String(p.timestamp)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  <div className="bg-[#0d1320] px-2 py-1">{Number(p.latitude).toFixed(4)}</div>
                  <div className="bg-[#0d1320] px-2 py-1">{Number(p.longitude).toFixed(4)}</div>
                  <div className="bg-[#0d1320] px-2 py-1">{p.speed_over_ground != null ? Number(p.speed_over_ground).toFixed(1) : "—"}</div>
                  <div className="bg-[#0d1320] px-2 py-1">{p.course_over_ground != null ? `${Number(p.course_over_ground).toFixed(0)}°` : "—"}</div>
                </div>
              ))}
              {trail.length > 20 && (
                <div className="text-center text-[9px] text-slate-600 py-1.5 bg-[#0d1320]">... {trail.length - 20} more</div>
              )}
            </div>
          </Section>
        )}

        {/* Audit Trail */}
        {audit?.length > 0 && (
          <Section title="Audit Trail">
            <div className="space-y-1">
              {audit.map((e, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px]">
                  <span className="text-slate-600 font-mono shrink-0">{new Date(String(e.timestamp)).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="text-slate-400">{String(e.action)}{e.details ? `: ${String(e.details)}` : ""}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Notes */}
        {notes && (
          <Section title="Operator Notes">
            <p className="text-[11px] text-slate-400 leading-relaxed">{notes}</p>
          </Section>
        )}

        {/* Footer */}
        <div className="text-center text-[9px] text-slate-700 pt-2 pb-4 border-t border-[#1a2235]">
          HarborOS Incident Report · Maritime Awareness Platform · CONFIDENTIAL
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">{title}</h3>
      {children}
    </div>
  );
}


interface SatVrProps {
  verification: VerificationRequest;
  vesselPosition?: { latitude: number; longitude: number } | null;
  onOverlay?: (overlay: SatelliteOverlay | null) => void;
}

function SatelliteVerificationResult({ verification, vesselPosition, onOverlay }: SatVrProps) {
  const lastOverlayKeyRef = useRef<string | null>(null);
  const satellite = verification.satellite;
  const scene = satellite?.scene;
  const isSatellite = verification.asset_type === "satellite";
  const isComplete = verification.status === "completed";
  const isReal = satellite?.source === "copernicus";
  const bboxWest = satellite?.bbox?.west ?? null;
  const bboxSouth = satellite?.bbox?.south ?? null;
  const bboxEast = satellite?.bbox?.east ?? null;
  const bboxNorth = satellite?.bbox?.north ?? null;

  useEffect(() => {
    const overlayKey = `${verification.id}:${verification.updated_at}:${verification.result_media_ref ?? ""}`;
    const bbox = (
      bboxWest != null &&
      bboxSouth != null &&
      bboxEast != null &&
      bboxNorth != null
    )
      ? [bboxWest, bboxSouth, bboxEast, bboxNorth] as [number, number, number, number]
      : null;

    if (
      isSatellite &&
      isComplete &&
      isReal &&
      bbox &&
      verification.result_media_ref &&
      onOverlay &&
      lastOverlayKeyRef.current !== overlayKey
    ) {
      onOverlay({
        imageSrc: verification.result_media_ref,
        bbox,
        renderToken: verification.updated_at,
      });
      lastOverlayKeyRef.current = overlayKey;
      return;
    }

    if (onOverlay && lastOverlayKeyRef.current !== null) {
      onOverlay(null);
      lastOverlayKeyRef.current = null;
    }
  }, [
    verification.id,
    verification.updated_at,
    verification.result_media_ref,
    isSatellite,
    isComplete,
    isReal,
    bboxWest,
    bboxSouth,
    bboxEast,
    bboxNorth,
    onOverlay,
  ]);

  useEffect(() => {
    return () => {
      if (onOverlay && lastOverlayKeyRef.current !== null) {
        onOverlay(null);
      }
    };
  }, [onOverlay]);

  return (
    <div className="space-y-3">
      {/* Status header */}
      <div className="bg-[#111827] rounded-lg p-4 border border-blue-500/20">
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`w-2 h-2 rounded-full ${isComplete ? "bg-emerald-400" : "bg-blue-400"}`}
            style={!isComplete ? { animation: "subtle-pulse 2s infinite" } : undefined}
          />
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${isComplete ? "text-emerald-400" : "text-blue-400"}`}>
            {verification.status}
          </span>
        </div>
        <p className="text-[11px] text-slate-400">
          Asset: <span className="font-mono text-slate-300">{verification.asset_id}</span> ({verification.asset_type})
        </p>
        {!isSatellite && (
          <p className="text-[10px] text-slate-500 mt-1.5">Verification task created. Asset dispatched.</p>
        )}
        {isSatellite && satellite?.source && (
          <p className="text-[10px] text-slate-500 mt-1.5">
            Source: <span className="font-mono text-slate-300">{satellite.source}</span>
          </p>
        )}
      </div>

      {isSatellite && scene && vesselPosition && (
        <div className="bg-[#111827] rounded-lg border border-[#1a2235] overflow-hidden">
          <SatThumbnail
            lat={vesselPosition.latitude}
            lng={vesselPosition.longitude}
            borderColor={isReal ? "border-cyan-400/50" : "border-slate-500/30"}
            imageSrc={isReal ? verification.result_media_ref ?? undefined : undefined}
            isReal={isReal}
            renderToken={verification.updated_at}
          />
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Satellite Imagery</span>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                isReal
                  ? "text-emerald-400 bg-emerald-500/10"
                  : "text-amber-400 bg-amber-500/10"
              }`}>
                {isReal ? "real" : "simulated"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <span className="text-slate-600">Acquired</span>
                <span className="text-slate-300 ml-1 font-mono">
                  {scene.acquired_at ? new Date(scene.acquired_at).toLocaleDateString() : "Latest available mosaic"}
                </span>
              </div>
              <div>
                <span className="text-slate-600">Satellite</span>
                <span className="text-slate-300 ml-1 font-mono">{scene.satellite || "Unknown"}</span>
              </div>
              <div>
                <span className="text-slate-600">Resolution</span>
                <span className="text-slate-300 ml-1 font-mono">{scene.resolution_m ?? 10}m</span>
              </div>
              {scene.cloud_cover_pct != null && (
                <div>
                  <span className="text-slate-600">Cloud cover</span>
                  <span className={`ml-1 font-mono ${scene.cloud_cover_pct > 20 ? "text-yellow-400" : "text-slate-300"}`}>
                    {scene.cloud_cover_pct}%
                  </span>
                </div>
              )}
              {satellite?.catalog_status && (
                <div>
                  <span className="text-slate-600">Catalog</span>
                  <span className="text-slate-300 ml-1 font-mono">{satellite.catalog_status}</span>
                </div>
              )}
              {scene.status && (
                <div>
                  <span className="text-slate-600">Scene</span>
                  <span className="text-slate-300 ml-1 font-mono">{scene.status}</span>
                </div>
              )}
            </div>
            {verification.result_confidence != null && (
              <div className="mt-2 pt-2 border-t border-[#1a2235]">
                <span className="text-[10px] text-slate-600">Confidence</span>
                <span className="text-[10px] text-slate-300 font-mono ml-1">{(verification.result_confidence * 100).toFixed(0)}%</span>
              </div>
            )}
            {satellite?.request_lat != null && satellite?.request_lng != null && (
              <div>
                <span className="text-[10px] text-slate-600">Focus</span>
                <span className="text-[10px] text-slate-300 font-mono ml-1">
                  {satellite.request_lat.toFixed(4)}, {satellite.request_lng.toFixed(4)}
                </span>
              </div>
            )}
            {scene.note && (
              <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">{scene.note}</p>
            )}
            {scene.catalog_id && (
              <p className="text-[9px] text-slate-600 mt-1 font-mono">
                ref: {scene.catalog_id}
              </p>
            )}
            {!scene.catalog_id && verification.result_media_ref && (
              <p className="text-[9px] text-slate-600 mt-1 font-mono">
                ref: {verification.result_media_ref}
              </p>
            )}
            {isReal && satellite?.bbox && (
              <p className="text-[10px] text-cyan-300/80 mt-2">
                Real imagery overlay applied to the map using the returned scene bbox.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Satellite imagery thumbnail.
 * - When `imageSrc` is provided (real Sentinel-2 from backend), renders that image.
 * - Otherwise falls back to tiled basemap imagery.
 * - `variant="old"`: desaturated older pass
 * - `variant="fresh"`: crisp new acquisition
 */
function SatThumbnail({ lat, lng, borderColor = "border-cyan-400/50", variant = "fresh", imageSrc, isReal = false, renderToken }: {
  lat: number; lng: number; borderColor?: string; variant?: "old" | "fresh"; imageSrc?: string; isReal?: boolean; renderToken?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");
  const z = 18;
  const tileOffset = variant === "old" ? 2 : 0;
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, z)) + tileOffset;
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, z)) - tileOffset;

  const tiles = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      tiles.push({ tx: x + dx, ty: y + dy, dx, dy });
    }
  }

  const isOld = variant === "old";
  const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/api$/, "");
  const realSrc = imageSrc
    ? imageSrc.startsWith("/api/")
      ? `${API_BASE}${imageSrc}`
      : imageSrc
    : undefined;
  const refreshedRealSrc = realSrc && renderToken
    ? `${realSrc}${realSrc.includes("?") ? "&" : "?"}v=${encodeURIComponent(renderToken)}`
    : realSrc;

  const handleOpen = useCallback(() => {
    setIsZoomed(false);
    setZoomOrigin("50% 50%");
    setIsExpanded(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsZoomed(false);
    setZoomOrigin("50% 50%");
    setIsExpanded(false);
  }, []);

  const handleExpandedDoubleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const clamp = (value: number) => Math.min(100, Math.max(0, value));

    setZoomOrigin(`${clamp(x)}% ${clamp(y)}%`);
    setIsZoomed((current) => !current);
  }, []);

  useEffect(() => {
    if (!isExpanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsExpanded(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded]);

  return (
    <>
      <div
        className="h-44 relative overflow-hidden cursor-zoom-in"
        onDoubleClick={handleOpen}
        title="Double-click to enlarge"
      >
        {refreshedRealSrc ? (
          /* Real Sentinel-2 imagery from Process API */
          <div className="absolute inset-0">
            <img
              key={refreshedRealSrc}
              src={refreshedRealSrc}
              alt="Sentinel-2 imagery"
              className="w-full h-full object-cover"
              style={{
                filter: isOld
                  ? "saturate(0.6) brightness(0.85) contrast(0.9)"
                  : "saturate(1.15) brightness(1.05) contrast(1.1)",
              }}
            />
          </div>
        ) : (
          /* Fallback: basemap tiles */
          <div
            className="absolute inset-0"
            style={{
              filter: isOld
                ? "saturate(0.6) brightness(0.85) contrast(0.9)"
                : "saturate(1.15) brightness(1.05) contrast(1.1)",
            }}
          >
            {tiles.map((t, i) => (
              <img
                key={i}
                src={`https://mt${i % 4}.google.com/vt/lyrs=s&x=${t.tx}&y=${t.ty}&z=${z}`}
                alt=""
                className="absolute"
                style={{
                  width: "33.34%",
                  height: "33.34%",
                  left: `${(t.dx + 1) * 33.34}%`,
                  top: `${(t.dy + 1) * 33.34}%`,
                  objectFit: "cover",
                }}
              />
            ))}
          </div>
        )}
        {/* Old pass: cloud haze overlay */}
        {isOld && !refreshedRealSrc && (
          <>
            <div className="absolute inset-0 bg-white/[0.08]" />
            <div className="absolute top-0 right-0 w-2/3 h-1/2 bg-gradient-to-bl from-white/[0.12] to-transparent rounded-bl-full" />
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#111827]/80 via-transparent to-transparent" />
        {/* Crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-px bg-cyan-400/50" />
          <div className="absolute h-12 w-px bg-cyan-400/50" />
          <div className="absolute w-5 h-5 border border-cyan-400/30 rounded-full" />
        </div>
        {/* Corner brackets */}
        <div className={`absolute top-2 left-2 w-3 h-3 border-t border-l ${borderColor}`} />
        <div className={`absolute top-2 right-2 w-3 h-3 border-t border-r ${borderColor}`} />
        <div className={`absolute bottom-8 left-2 w-3 h-3 border-b border-l ${borderColor}`} />
        <div className={`absolute bottom-8 right-2 w-3 h-3 border-b border-r ${borderColor}`} />
        {/* Source + freshness badge */}
        {isOld && (
          <div className="absolute top-2 right-4 text-[8px] font-mono text-white/40 bg-black/30 px-1.5 py-0.5 rounded">
            ARCHIVE
          </div>
        )}
        {!isOld && (
          <div className="absolute top-2 right-4 flex items-center gap-1">
            {isReal && (
              <span className="text-[8px] font-mono text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                SENTINEL-2
              </span>
            )}
            <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${
              isReal ? "text-emerald-300 bg-emerald-500/20" : "text-amber-300 bg-amber-500/20"
            }`}>
              {isReal ? "REAL" : "SIMULATED"}
            </span>
          </div>
        )}
        <div className="absolute bottom-2 left-0 right-0 text-center">
          <p className="text-[10px] text-cyan-300 font-mono drop-shadow-lg">
            {lat.toFixed(4)}N, {Math.abs(lng).toFixed(4)}{lng >= 0 ? "E" : "W"}
          </p>
        </div>
      </div>
      {isExpanded && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
          onClick={handleClose}
        >
          <div
            className="relative w-full max-w-6xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleClose}
              className="absolute right-3 top-3 z-10 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[11px] font-medium text-slate-200 hover:bg-black/75"
            >
              Close
            </button>
            <div className="relative h-[70vh] min-h-[320px] overflow-hidden rounded-xl border border-cyan-500/20 bg-black shadow-2xl shadow-black/50">
              <div
                className={`absolute inset-0 transition-transform duration-200 ease-out select-none ${
                  isZoomed ? "cursor-zoom-out" : "cursor-zoom-in"
                }`}
                onDoubleClick={handleExpandedDoubleClick}
                style={{
                  transform: isZoomed ? "scale(2)" : "scale(1)",
                  transformOrigin: zoomOrigin,
                }}
                title="Double-click to zoom"
              >
                {refreshedRealSrc ? (
                  <img
                    key={`${refreshedRealSrc}:expanded`}
                    src={refreshedRealSrc}
                    alt="Sentinel-2 imagery enlarged"
                    className="w-full h-full object-contain"
                    draggable={false}
                    style={{
                      filter: isOld
                        ? "saturate(0.6) brightness(0.85) contrast(0.9)"
                        : "saturate(1.15) brightness(1.05) contrast(1.1)",
                    }}
                  />
                ) : (
                  <div
                    className="absolute inset-0"
                    style={{
                      filter: isOld
                        ? "saturate(0.6) brightness(0.85) contrast(0.9)"
                        : "saturate(1.15) brightness(1.05) contrast(1.1)",
                    }}
                  >
                    {tiles.map((t, i) => (
                      <img
                        key={`expanded-${i}`}
                        src={`https://mt${i % 4}.google.com/vt/lyrs=s&x=${t.tx}&y=${t.ty}&z=${z}`}
                        alt=""
                        className="absolute"
                        draggable={false}
                        style={{
                          width: "33.34%",
                          height: "33.34%",
                          left: `${(t.dx + 1) * 33.34}%`,
                          top: `${(t.dy + 1) * 33.34}%`,
                          objectFit: "cover",
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] text-slate-400">
              Double-click the thumbnail to enlarge. Double-click the opened image to zoom in or out. Click outside or press Esc to close.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
