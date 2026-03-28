"use client";

import { useState, useCallback, useEffect } from "react";
import type { VesselDetail as VesselDetailType, VerificationRequest } from "@/app/lib/api";
import { api } from "@/app/lib/api";

import type { SatelliteFootprint } from "./MapView";

interface VesselDetailProps {
  vessel: VesselDetailType;
  alertId: string | null;
  onClose: () => void;
  onSatelliteFootprint?: (footprint: SatelliteFootprint | null) => void;
}

function actionStyle(action: string) {
  switch (action) {
    case "escalate": return "bg-red-500/10 text-red-400 border-red-500/25";
    case "verify": return "bg-orange-500/10 text-orange-400 border-orange-500/25";
    case "monitor": return "bg-yellow-500/10 text-yellow-400 border-yellow-500/25";
    default: return "bg-green-500/10 text-green-400 border-green-500/25";
  }
}

function riskColor(score: number): string {
  if (score >= 70) return "text-red-400";
  if (score >= 45) return "text-orange-400";
  if (score >= 25) return "text-yellow-400";
  return "text-green-400";
}

function severityBarColor(severity: number): string {
  if (severity >= 0.7) return "bg-red-400";
  if (severity >= 0.4) return "bg-orange-400";
  return "bg-yellow-400";
}

export default function VesselDetailPanel({ vessel, alertId, onClose, onSatelliteFootprint }: VesselDetailProps) {
  const [verification, setVerification] = useState<VerificationRequest | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

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
    } catch (e) {
      console.error("Alert action failed:", e);
    } finally {
      setActionLoading(null);
    }
  }, [alertId]);

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

  const [verifyAsset, setVerifyAsset] = useState<string>("camera");

  const handleVerify = async () => {
    if (!alertId) return;
    setVerifyLoading(true);
    try {
      const vr = await api.createVerificationRequest(alertId, vessel.id, verifyAsset);
      setVerification(vr);
    } catch (e) {
      console.error("Verification request failed:", e);
    } finally {
      setVerifyLoading(false);
    }
  };

  const riskScore = vessel.risk_score ?? 0;
  const action = vessel.recommended_action ?? "ignore";

  return (
    <div className="w-[400px] bg-[#0d1320] border-l border-[#1a2235] flex flex-col shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="p-5 border-b border-[#1a2235]">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="text-base font-semibold text-slate-100 truncate">{vessel.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-slate-500 font-mono">MMSI {vessel.mmsi}</span>
              {vessel.imo && (
                <>
                  <span className="text-slate-700">/</span>
                  <span className="text-[11px] text-slate-500 font-mono">IMO {vessel.imo}</span>
                </>
              )}
            </div>
          </div>
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

      {/* Risk Score */}
      <div className="p-5 border-b border-[#1a2235]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Risk Assessment</span>
          <span className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded-md border ${actionStyle(action)}`}>
            {action}
          </span>
        </div>
        <div className="flex items-end gap-2 mb-3">
          <span className={`text-4xl font-bold font-mono leading-none ${riskColor(riskScore)}`}>
            {Math.round(riskScore)}
          </span>
          <span className="text-sm text-slate-600 mb-0.5 font-mono">/100</span>
        </div>
        {/* Risk bar */}
        <div className="w-full bg-[#111827] rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              riskScore >= 70 ? "bg-red-400" : riskScore >= 45 ? "bg-orange-400" : riskScore >= 25 ? "bg-yellow-400" : "bg-green-400"
            }`}
            style={{ width: `${riskScore}%` }}
          />
        </div>
        {vessel.explanation && (
          <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">{vessel.explanation}</p>
        )}
      </div>

      {/* Anomaly Signals */}
      {vessel.anomaly_signals.length > 0 && (
        <div className="p-5 border-b border-[#1a2235]">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">
            Anomaly Signals ({vessel.anomaly_signals.length})
          </h3>
          <div className="space-y-2">
            {vessel.anomaly_signals.map((signal, i) => (
              <div key={i} className="bg-[#111827] rounded-lg p-3 border border-[#1a2235]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                    {signal.anomaly_type.replace(/_/g, " ")}
                  </span>
                  <span className={`text-[11px] font-mono font-semibold ${
                    signal.severity >= 0.7 ? "text-red-400" : signal.severity >= 0.4 ? "text-orange-400" : "text-yellow-400"
                  }`}>
                    {(signal.severity * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-[#0d1320] rounded-full h-1 mb-2">
                  <div
                    className={`h-full rounded-full ${severityBarColor(signal.severity)}`}
                    style={{ width: `${signal.severity * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">{signal.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vessel Info */}
      <div className="p-5 border-b border-[#1a2235]">
        <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">Vessel Information</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <InfoRow label="Type" value={vessel.vessel_type} />
          <InfoRow label="Flag" value={vessel.flag_state} />
          <InfoRow label="Length" value={vessel.length ? `${vessel.length}m` : "\u2014"} />
          <InfoRow label="Beam" value={vessel.beam ? `${vessel.beam}m` : "\u2014"} />
          <InfoRow label="Draft" value={vessel.draft ? `${vessel.draft}m` : "\u2014"} />
          <InfoRow label="Callsign" value={vessel.callsign || "\u2014"} />
          <InfoRow label="Destination" value={vessel.destination || "\u2014"} />
          <InfoRow label="Deficiencies" value={String(vessel.inspection_deficiencies)} highlight={vessel.inspection_deficiencies > 0} />
        </div>
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

      {/* Verification Action */}
      {riskScore >= 45 && (
        <div className="p-5">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">Verification</h3>
          {verification ? (
            <SatelliteVerificationResult
              verification={verification}
              vesselPosition={vessel.latest_position}
              vesselName={vessel.name}
              onFootprint={onSatelliteFootprint}
            />
          ) : (
            <div className="space-y-2.5">
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { key: "camera", label: "Camera" },
                  { key: "drone", label: "Drone" },
                  { key: "patrol_boat", label: "Patrol" },
                  { key: "satellite", label: "Satellite" },
                ].map((a) => (
                  <button
                    key={a.key}
                    onClick={() => setVerifyAsset(a.key)}
                    className={`text-[10px] py-1.5 rounded-md font-medium transition-all ${
                      verifyAsset === a.key
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        : "bg-[#111827] text-slate-500 border border-[#1a2235] hover:text-slate-300"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <button
                onClick={handleVerify}
                disabled={verifyLoading || !alertId}
                className="w-full py-2.5 px-4 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/25 hover:border-blue-500/40 disabled:bg-[#111827] disabled:border-[#1a2235] disabled:text-slate-600 text-blue-400 text-sm font-medium rounded-lg transition-all"
              >
                {verifyLoading ? "Requesting..." : `Request ${verifyAsset === "satellite" ? "Satellite Pass" : "Verification"}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Alert Actions */}
      {alertId && (
        <div className="p-5 border-b border-[#1a2235]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Alert Actions</h3>
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
        <div className="p-5 border-b border-[#1a2235]">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">Operator Notes</h3>
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
        <div className="p-5">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">Feedback</h3>
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
  vesselName: string;
  onFootprint?: (footprint: SatelliteFootprint | null) => void;
}

function SatelliteVerificationResult({ verification, vesselPosition, vesselName, onFootprint }: SatVrProps) {
  const [liveVr, setLiveVr] = useState(verification);
  const [footprintEmitted, setFootprintEmitted] = useState(false);

  // Poll for satellite next-pass completion
  useEffect(() => {
    if (liveVr.asset_type !== "satellite" || liveVr.status === "completed") return;
    const interval = setInterval(async () => {
      try {
        const updated = await api.getVerificationRequest(liveVr.id);
        setLiveVr(updated);
        if (updated.status === "completed") clearInterval(interval);
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [liveVr.id, liveVr.status, liveVr.asset_type]);

  // Emit satellite footprint on map when pass completes
  useEffect(() => {
    if (liveVr.status === "completed" && !footprintEmitted && vesselPosition && onFootprint) {
      const satData = liveVr.result_notes ? (() => { try { return JSON.parse(liveVr.result_notes); } catch { return null; } })() : null;
      onFootprint({
        center: [vesselPosition.longitude, vesselPosition.latitude],
        satellite: satData?.next_pass?.satellite || "Sentinel-2B",
        timestamp: satData?.next_pass?.acquired || new Date().toISOString(),
        vesselName,
      });
      setFootprintEmitted(true);
    }
  }, [liveVr.status, footprintEmitted, vesselPosition, vesselName, onFootprint, liveVr.result_notes]);

  // Parse satellite-specific notes
  const satData = liveVr.result_notes ? (() => {
    try { return JSON.parse(liveVr.result_notes); } catch { return null; }
  })() : null;

  const isSatellite = liveVr.asset_type === "satellite";
  const isComplete = liveVr.status === "completed";

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
            {liveVr.status}
          </span>
        </div>
        <p className="text-[11px] text-slate-400">
          Asset: <span className="font-mono text-slate-300">{liveVr.asset_id}</span> ({liveVr.asset_type})
        </p>
        {!isSatellite && (
          <p className="text-[10px] text-slate-500 mt-1.5">Verification task created. Asset dispatched.</p>
        )}
      </div>

      {/* Satellite: Last pass imagery */}
      {isSatellite && satData?.last_pass && (
        <div className="bg-[#111827] rounded-lg p-4 border border-[#1a2235]">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Last Available Imagery</span>
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{satData.last_pass.status}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <span className="text-slate-600">Acquired</span>
              <span className="text-slate-300 ml-1 font-mono">
                {new Date(satData.last_pass.acquired).toLocaleDateString()}
              </span>
            </div>
            <div>
              <span className="text-slate-600">Satellite</span>
              <span className="text-slate-300 ml-1 font-mono">{satData.last_pass.satellite}</span>
            </div>
            <div>
              <span className="text-slate-600">Resolution</span>
              <span className="text-slate-300 ml-1 font-mono">{satData.last_pass.resolution_m}m</span>
            </div>
            <div>
              <span className="text-slate-600">Cloud cover</span>
              <span className={`ml-1 font-mono ${satData.last_pass.cloud_cover_pct > 20 ? "text-yellow-400" : "text-slate-300"}`}>
                {satData.last_pass.cloud_cover_pct}%
              </span>
            </div>
          </div>
          {liveVr.result_confidence != null && (
            <div className="mt-2 pt-2 border-t border-[#1a2235]">
              <span className="text-[10px] text-slate-600">Confidence</span>
              <span className="text-[10px] text-slate-300 font-mono ml-1">{(liveVr.result_confidence * 100).toFixed(0)}%</span>
            </div>
          )}
        </div>
      )}

      {/* Satellite: Next pass status */}
      {isSatellite && satData?.next_pass && (
        <div className={`rounded-lg p-4 border ${
          isComplete
            ? "bg-emerald-500/5 border-emerald-500/20"
            : "bg-[#111827] border-amber-500/20"
        }`}>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
              {isComplete ? "New Imagery Acquired" : "Next Pass — Pending"}
            </span>
            {!isComplete && (
              <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                ETA ~{satData.next_pass.eta_minutes || 47} min
              </span>
            )}
            {isComplete && (
              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">delivered</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {isComplete && satData.next_pass.acquired && (
              <div>
                <span className="text-slate-600">Acquired</span>
                <span className="text-emerald-400 ml-1 font-mono">Just now</span>
              </div>
            )}
            <div>
              <span className="text-slate-600">Satellite</span>
              <span className="text-slate-300 ml-1 font-mono">{satData.next_pass.satellite}</span>
            </div>
            <div>
              <span className="text-slate-600">Resolution</span>
              <span className="text-slate-300 ml-1 font-mono">{satData.next_pass.expected_resolution_m || satData.next_pass.resolution_m || 10}m</span>
            </div>
            {isComplete && satData.next_pass.cloud_cover_pct != null && (
              <div>
                <span className="text-slate-600">Cloud cover</span>
                <span className="text-emerald-400 ml-1 font-mono">{satData.next_pass.cloud_cover_pct}%</span>
              </div>
            )}
          </div>
          {!isComplete && (
            <p className="text-[10px] text-amber-400/60 mt-2 italic">Tasking accepted. Awaiting satellite pass...</p>
          )}
        </div>
      )}

      {/* Imagery preview card — shown when pass completes */}
      {isSatellite && isComplete && vesselPosition && (
        <div className="bg-[#111827] rounded-lg border border-cyan-500/20 overflow-hidden">
          {/* Simulated imagery thumbnail */}
          <div className="h-40 relative overflow-hidden">
            {/* Real satellite imagery tile from Esri for this location */}
            {(() => {
              // Convert lat/lng to tile coordinates at zoom 14
              const z = 14;
              const lat = vesselPosition.latitude;
              const lng = vesselPosition.longitude;
              const x = Math.floor(((lng + 180) / 360) * Math.pow(2, z));
              const latRad = (lat * Math.PI) / 180;
              const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, z));
              // Load a 3x3 grid of tiles centered on the vessel for better coverage
              const tiles = [];
              for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                  tiles.push({ tx: x + dx, ty: y + dy, dx, dy });
                }
              }
              return (
                <div className="absolute inset-0" style={{ imageRendering: "auto" }}>
                  {tiles.map((t, i) => (
                    <img
                      key={i}
                      src={`https://mt1.google.com/vt/lyrs=s&x=${t.tx}&y=${t.ty}&z=${z}`}
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
              );
            })()}
            {/* Overlay with coordinates */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#111827] via-transparent to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-12 h-px bg-cyan-400/50" />
              <div className="absolute h-12 w-px bg-cyan-400/50" />
              <div className="absolute w-6 h-6 border border-cyan-400/40 rounded-full" />
            </div>
            <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-cyan-400/50" />
            <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-cyan-400/50" />
            <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-cyan-400/50" />
            <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-cyan-400/50" />
            <div className="absolute bottom-2 left-0 right-0 text-center">
              <p className="text-[10px] text-cyan-300 font-mono drop-shadow-lg">{vesselPosition.latitude.toFixed(4)}N, {Math.abs(vesselPosition.longitude).toFixed(4)}{vesselPosition.longitude >= 0 ? "E" : "W"}</p>
            </div>
          </div>
          <div className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-cyan-400 font-semibold uppercase tracking-wider">Satellite Imagery</span>
              <span className="text-[9px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">new</span>
            </div>
            <p className="text-[10px] text-slate-400">
              {satData?.next_pass?.satellite || "Sentinel-2B"} capture of vessel area. Footprint highlighted on map.
            </p>
            <p className="text-[9px] text-slate-600 mt-1 font-mono">
              ref: {liveVr.result_media_ref || "s2_tile.tif"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
