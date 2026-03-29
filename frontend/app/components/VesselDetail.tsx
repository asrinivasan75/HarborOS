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

function formatReportHTML(report: Record<string, unknown>): string {
  const v = report.vessel as Record<string, unknown>;
  const pos = report.latest_position as Record<string, unknown> | null;
  const risk = report.risk_assessment as Record<string, unknown>;
  const signals = report.anomaly_signals as Record<string, unknown>[];
  const trail = report.position_trail as Record<string, unknown>[];
  const audit = report.alert_audit_trail as Record<string, unknown>[];
  const verifications = report.verification_requests as Record<string, unknown>[];

  const riskScore = risk.score as number;
  const riskColor = riskScore >= RISK_THRESHOLDS.escalate ? "#ef4444" : riskScore >= RISK_THRESHOLDS.verify ? "#f97316" : riskScore >= RISK_THRESHOLDS.monitor ? "#f59e0b" : "#22c55e";

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; padding: 40px; max-width: 800px; margin: 0 auto; font-size: 13px; line-height: 1.5; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 15px; color: #475569; margin: 24px 0 10px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; letter-spacing: 0.05em; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #0f172a; }
    .header-left h1 { color: #0f172a; }
    .header-left p { color: #64748b; font-size: 12px; }
    .risk-badge { text-align: center; padding: 12px 20px; border-radius: 8px; }
    .risk-score { font-size: 36px; font-weight: 800; font-family: monospace; }
    .risk-action { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 12px; }
    th { text-align: left; padding: 6px 10px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 600; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
    td { padding: 5px 10px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 11px; }
    .signal { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; }
    .signal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .signal-type { font-weight: 700; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; }
    .signal-severity { font-family: monospace; font-weight: 700; font-size: 12px; }
    .signal-desc { color: #64748b; font-size: 12px; }
    .explanation { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 14px; margin: 8px 0 16px; color: #92400e; font-size: 12px; }
    .meta-row { display: flex; gap: 24px; margin-bottom: 4px; }
    .meta-label { color: #94a3b8; font-size: 11px; text-transform: uppercase; }
    .meta-value { font-family: monospace; }
    .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 10px; text-align: center; }
    @media print { body { padding: 20px; } }
  `;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Incident Report - ${v.name}</title><style>${css}</style></head><body>`;

  // Header
  html += `<div class="header">
    <div class="header-left">
      <h1>${v.name}</h1>
      <p>MMSI ${v.mmsi}${v.imo ? ` / IMO ${v.imo}` : ""} &middot; ${v.vessel_type} &middot; ${v.flag_state}</p>
      <p style="margin-top:4px">Generated: ${new Date(report.generated_at as string).toLocaleString()}</p>
    </div>
    <div class="risk-badge" style="background:${riskColor}15; border: 1px solid ${riskColor}40">
      <div class="risk-score" style="color:${riskColor}">${Math.round(riskScore)}</div>
      <div class="risk-action" style="color:${riskColor}">${risk.recommended_action}</div>
    </div>
  </div>`;

  // Explanation
  if (risk.explanation) {
    html += `<div class="explanation">${risk.explanation}</div>`;
  }

  // Vessel Details
  html += `<h2>Vessel Details</h2><table>
    <tr><th>Length</th><td>${v.length ? v.length + "m" : "N/A"}</td><th>Beam</th><td>${v.beam ? v.beam + "m" : "N/A"}</td><th>Draft</th><td>${v.draft ? v.draft + "m" : "N/A"}</td></tr>
    <tr><th>Callsign</th><td>${v.callsign || "N/A"}</td><th>Destination</th><td>${v.destination || "N/A"}</td><th>Deficiencies</th><td>${v.inspection_deficiencies ?? 0}</td></tr>
  </table>`;

  // Position
  if (pos) {
    html += `<h2>Latest Position</h2>
    <div class="meta-row">
      <div><span class="meta-label">Lat</span> <span class="meta-value">${(pos.latitude as number).toFixed(5)}</span></div>
      <div><span class="meta-label">Lon</span> <span class="meta-value">${(pos.longitude as number).toFixed(5)}</span></div>
      <div><span class="meta-label">Speed</span> <span class="meta-value">${pos.speed_over_ground != null ? (pos.speed_over_ground as number).toFixed(1) + " kt" : "N/A"}</span></div>
      <div><span class="meta-label">Course</span> <span class="meta-value">${pos.course_over_ground != null ? (pos.course_over_ground as number).toFixed(0) + "\u00B0" : "N/A"}</span></div>
    </div>`;
  }

  // Anomaly Signals
  if (signals?.length) {
    html += `<h2>Anomaly Signals (${signals.length})</h2>`;
    for (const s of signals) {
      const sev = s.severity as number;
      const sevLabel = sev >= 0.55 ? "CRITICAL" : sev >= 0.35 ? "HIGH" : sev >= 0.2 ? "MODERATE" : "LOW";
      const sevColor = sev >= 0.55 ? "#ef4444" : sev >= 0.35 ? "#f97316" : sev >= 0.2 ? "#f59e0b" : "#22c55e";
      const type = s.anomaly_type as string;
      const label = ({"ais_gap":"AIS Dark Period","kinematic_implausibility":"Position Spoofing","geofence_breach":"Restricted Zone Breach","type_mismatch":"Identity Mismatch","collision_risk":"COLREGS Non-Compliance","loitering":"Loitering","speed_anomaly":"Speed Anomaly","heading_anomaly":"Course Anomaly","route_deviation":"Route Deviation","zone_lingering":"Zone Lingering","statistical_outlier":"Regional Outlier","dark_ship_optical":"Dark Ship (Optical)"} as Record<string,string>)[type] ?? type.replace(/_/g, " ");
      html += `<div class="signal">
        <div class="signal-header">
          <span class="signal-type">${label}</span>
          <span class="signal-severity" style="color:${sevColor}">${sevLabel}</span>
        </div>
        <div class="signal-desc">${s.description}</div>
      </div>`;
    }
  }

  // Position Trail
  if (trail?.length) {
    html += `<h2>Position Trail (${trail.length} points)</h2><table>
    <tr><th>Timestamp</th><th>Lat</th><th>Lon</th><th>Speed</th><th>Course</th></tr>`;
    for (const p of trail.slice(0, 30)) {
      html += `<tr><td>${p.timestamp}</td><td>${p.latitude}</td><td>${p.longitude}</td><td>${p.speed_over_ground ?? "N/A"}</td><td>${p.course_over_ground ?? "N/A"}</td></tr>`;
    }
    if (trail.length > 30) html += `<tr><td colspan="5" style="text-align:center;color:#94a3b8">... ${trail.length - 30} more positions</td></tr>`;
    html += `</table>`;
  }

  // Audit Trail
  if (audit?.length) {
    html += `<h2>Alert Audit Trail</h2>`;
    for (const e of audit) {
      html += `<div style="margin-bottom:4px"><strong>${e.timestamp}</strong> &mdash; ${e.action}${e.details ? ": " + e.details : ""}</div>`;
    }
  }

  // Notes
  if (report.operator_notes) {
    html += `<h2>Operator Notes</h2><p>${report.operator_notes}</p>`;
  }

  // Verifications
  if (verifications?.length) {
    html += `<h2>Verification Requests</h2>`;
    for (const vr of verifications) {
      const satellite = vr.satellite as Record<string, unknown> | undefined;
      const scene = satellite?.scene as Record<string, unknown> | undefined;
      const bbox = satellite?.bbox as Record<string, unknown> | undefined;

      html += `<div style="margin-bottom:8px"><strong>${vr.asset_type}</strong> (${vr.asset_id}) &mdash; Status: ${vr.status}`;
      if (scene?.satellite) {
        html += ` &middot; Scene: ${scene.satellite}`;
      }
      if (scene?.acquired_at) {
        html += ` &middot; Acquired: ${scene.acquired_at}`;
      }
      if (scene?.status) {
        html += ` &middot; Scene Status: ${scene.status}`;
      }
      if (bbox?.west != null && bbox?.south != null && bbox?.east != null && bbox?.north != null) {
        html += ` &middot; BBox: ${bbox.west}, ${bbox.south}, ${bbox.east}, ${bbox.north}`;
      }
      html += `</div>`;
    }
  }

  html += `<div class="footer">HarborOS Incident Report &middot; Maritime Awareness Platform &middot; CONFIDENTIAL</div>`;
  html += `</body></html>`;
  return html;
}

function RiskSparkline({ data }: { data: RiskHistoryPoint[] }) {
  if (data.length < 2) return null;

  const w = 200;
  const h = 32;
  const pad = 2;
  const scores = data.map((d) => d.risk_score);
  const minS = Math.max(0, Math.min(...scores) - 5);
  const maxS = Math.min(100, Math.max(...scores) + 5);
  const range = maxS - minS || 1;

  const points = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * (w - pad * 2);
    const y = h - pad - ((s - minS) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  const last = scores[scores.length - 1];
  const first = scores[0];
  const trend = last - first;
  const trendLabel =
    trend > 5 ? "Escalating" : trend < -5 ? "De-escalating" : "Stable";
  const trendColor =
    trend > 5
      ? "text-red-400"
      : trend < -5
        ? "text-green-400"
        : "text-slate-500";

  const lineColor =
    last >= RISK_THRESHOLDS.escalate
      ? "#f87171"
      : last >= RISK_THRESHOLDS.verify
        ? "#fb923c"
        : last >= RISK_THRESHOLDS.monitor
          ? "#facc15"
          : "#4ade80";

  const lastX = pad + ((scores.length - 1) / (scores.length - 1)) * (w - pad * 2);
  const lastY = h - pad - ((last - minS) / range) * (h - pad * 2);

  return (
    <div className="flex items-center gap-2 mt-2">
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="shrink-0"
      >
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke={lineColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />
        <circle cx={lastX} cy={lastY} r="2.5" fill={lineColor} />
      </svg>
      <span className={`text-[9px] font-medium uppercase tracking-wide ${trendColor}`}>
        {trendLabel}
      </span>
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
  const lastRangeRef = useRef<number | null>(null);
  const lastVelRef = useRef<number | null>(null);
  const everDetectedRef = useRef(false);
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

  const handleExportReport = useCallback(async () => {
    setExportLoading(true);
    try {
      const report = await api.getVesselReport(vessel.id);
      const html = formatReportHTML(report);
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        // Give it a moment to render, then trigger print (Save as PDF)
        setTimeout(() => printWindow.print(), 500);
      }
    } catch (e) {
      console.error("Export report failed:", e);
    } finally {
      setExportLoading(false);
    }
  }, [vessel.id]);

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
  const action = level === "normal" ? "normal" : (vessel.recommended_action ?? "ignore");

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
          <button
            onClick={handleExportReport}
            disabled={exportLoading}
            className="text-[10px] text-slate-500 hover:text-blue-400 uppercase tracking-wider transition-colors disabled:opacity-50 mr-2"
          >
            {exportLoading ? "..." : "Export"}
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
          <p className="text-[11px] text-slate-400 leading-relaxed">{vessel.explanation}</p>
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

        // Track last known good values
        const hasRealRange = rawDist != null && rawDist !== 1.0;
        const hasRealVel = vel != null && vel > 0;
        if (hasRealRange) { lastRangeRef.current = rawDist; everDetectedRef.current = true; }
        if (hasRealVel) { lastVelRef.current = vel; everDetectedRef.current = true; }

        const displayRange = hasRealRange ? rawDist : lastRangeRef.current;
        const displayVel = hasRealVel ? vel : lastVelRef.current;
        const rangeStale = !hasRealRange && lastRangeRef.current != null;
        const velStale = !hasRealVel && lastVelRef.current != null;

        return (
          <div className="p-5 border-b border-[#1a2235]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Edge Node Detection</h3>
              <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">{nodeId}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#111827] rounded-lg p-3 border border-[#1a2235]">
                <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-1">Range</span>
                {displayRange != null ? (
                  <>
                    <span className={`text-lg font-bold font-mono ${rangeStale ? "text-cyan-400/50" : "text-cyan-400"}`}>{displayRange.toFixed(2)}m</span>
                    {scaledDist != null && hasRealRange && <span className="text-[9px] text-slate-500 block mt-0.5">{scaledDist.toFixed(1)} nm scaled</span>}
                    {rangeStale && <span className="text-[9px] text-slate-600 block mt-0.5">last known</span>}
                  </>
                ) : (
                  <span className="text-sm font-mono text-slate-600 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500/50 animate-pulse" />
                    loading
                  </span>
                )}
              </div>
              <div className="bg-[#111827] rounded-lg p-3 border border-[#1a2235]">
                <span className="text-[9px] text-slate-600 uppercase tracking-wider block mb-1">Velocity</span>
                {displayVel != null ? (
                  <>
                    <span className={`text-lg font-bold font-mono ${velStale ? "text-emerald-400/50" : displayVel > 0.1 ? "text-amber-400" : "text-emerald-400"}`}>{displayVel.toFixed(3)}</span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">{velStale ? "last known" : "m/s"}</span>
                  </>
                ) : (
                  <span className="text-sm font-mono text-slate-600 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500/50 animate-pulse" />
                    loading
                  </span>
                )}
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
          <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">
            Signals ({vessel.anomaly_signals.length})
          </h3>
          <div className="space-y-1.5">
            {vessel.anomaly_signals.map((signal, i) => (
              <div key={i} className="bg-[#111827] rounded-md px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-300">
                    {signalLabel(signal.anomaly_type)}
                  </span>
                  <span className={`text-[9px] font-semibold uppercase ${severityLabel(signal.severity).color}`}>
                    {severityLabel(signal.severity).text}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 leading-snug mt-1">{signal.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vessel Info + Position */}
      <div className="px-4 py-3 border-b border-[#1a2235]">
        <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Vessel</h3>
        <div className="grid grid-cols-3 gap-x-3 gap-y-2">
          <InfoRow label="Type" value={vessel.vessel_type} />
          <InfoRow label="Flag" value={vessel.flag_state} />
          <InfoRow label="Callsign" value={vessel.callsign || "\u2014"} />
          <InfoRow label="Length" value={vessel.length ? `${vessel.length}m` : "\u2014"} />
          <InfoRow label="Beam" value={vessel.beam ? `${vessel.beam}m` : "\u2014"} />
          <InfoRow label="Draft" value={vessel.draft ? `${vessel.draft}m` : "\u2014"} />
          {vessel.destination && <InfoRow label="Dest" value={vessel.destination} />}
          <InfoRow label="Deficiencies" value={String(vessel.inspection_deficiencies)} highlight={vessel.inspection_deficiencies > 0} />
        </div>
        {vessel.latest_position && (
          <>
            <div className="border-t border-[#1a2235]/50 mt-2.5 pt-2">
              <div className="grid grid-cols-4 gap-x-3">
                <InfoRow label="Lat" value={vessel.latest_position.latitude.toFixed(4)} />
                <InfoRow label="Lon" value={vessel.latest_position.longitude.toFixed(4)} />
                <InfoRow
                  label="Speed"
                  value={vessel.latest_position.speed_over_ground != null ? `${vessel.latest_position.speed_over_ground.toFixed(1)} kt` : "\u2014"}
                />
                <InfoRow
                  label="Course"
                  value={vessel.latest_position.course_over_ground != null ? `${vessel.latest_position.course_over_ground.toFixed(0)}\u00B0` : "\u2014"}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Current Position */}
      {vessel.latest_position && (
        <div className="p-5 border-b border-[#1a2235]">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">Current Position</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <InfoRow label="Lat" value={vessel.latest_position.latitude.toFixed(5)} />
            <InfoRow label="Lon" value={vessel.latest_position.longitude.toFixed(5)} />
            <InfoRow
              label="Speed"
              value={vessel.latest_position.speed_over_ground != null ? `${vessel.latest_position.speed_over_ground.toFixed(1)} kt` : "\u2014"}
            />
            <InfoRow
              label="Course"
              value={vessel.latest_position.course_over_ground != null ? `${vessel.latest_position.course_over_ground.toFixed(0)}\u00B0` : "\u2014"}
            />
          </div>
        </div>
      )}

      {/* Weather Conditions */}
      {vessel.weather && (
        <div className="p-5 border-b border-[#1a2235]">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">Weather Conditions</h3>
          {(vessel.weather.wind_speed_kt > 25 || vessel.weather.visibility_nm < 2) && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-[10px] text-amber-400 font-medium">
                Adverse weather — detection thresholds adjusted
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <InfoRow
              label="Wind"
              value={`${vessel.weather.wind_speed_kt.toFixed(0)} kt ${vessel.weather.wind_direction}`}
              highlight={vessel.weather.wind_speed_kt > 25}
            />
            <InfoRow
              label="Visibility"
              value={`${vessel.weather.visibility_nm.toFixed(1)} nm`}
              highlight={vessel.weather.visibility_nm < 2}
            />
            {vessel.weather.temperature_f != null && (
              <InfoRow label="Temp" value={`${vessel.weather.temperature_f}°F`} />
            )}
            {vessel.weather.description && (
              <InfoRow label="Forecast" value={vessel.weather.description} />
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

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-slate-600 uppercase tracking-wider">{label}</span>
      <span className={`text-[12px] font-mono ${highlight ? "text-orange-400" : "text-slate-300"}`}>{value}</span>
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
