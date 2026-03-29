"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/app/lib/api";
import { riskLevel } from "@/app/lib/risk";

type Report = Record<string, unknown>;

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

function actionLabel(action: string) {
  if (action === "escalate") return { text: "ESCALATE", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" };
  if (action === "verify") return { text: "VERIFY", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" };
  if (action === "monitor") return { text: "MONITOR", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" };
  return { text: "NORMAL", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" };
}

export default function ReportPage() {
  const searchParams = useSearchParams();
  const vesselId = searchParams.get("vesselId");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vesselId) return;
    api.getVesselReport(vesselId).then(setReport).catch(() => setError("Failed to load report"));
  }, [vesselId]);

  if (!vesselId) return <div className="p-10 text-slate-400">No vessel specified.</div>;
  if (error) return <div className="p-10 text-red-400">{error}</div>;
  if (!report) return <div className="p-10 text-slate-500">Loading report...</div>;

  const vessel = report.vessel as Record<string, unknown>;
  const position = report.latest_position as Record<string, unknown> | null;
  const risk = report.risk_assessment as Record<string, unknown>;
  const signals = report.anomaly_signals as Record<string, unknown>[];
  const trail = report.position_trail as Record<string, unknown>[];
  const audit = report.alert_audit_trail as Record<string, unknown>[];
  const notes = report.operator_notes ? String(report.operator_notes) : null;
  const generatedAt = report.generated_at ? new Date(String(report.generated_at)) : null;

  const score = Number(risk.score ?? 0);
  const level = riskLevel(score);
  const action = actionLabel(String(risk.recommended_action ?? "normal"));

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-200">
      {/* Header */}
      <div className="border-b border-[#1a2235] bg-[#0d1320]">
        <div className="max-w-4xl mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-wide text-slate-100">
                HARBOR<span className="text-blue-400">OS</span>
                <span className="text-slate-600 mx-2">/</span>
                <span className="text-slate-400 font-normal">Incident Report</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="text-[10px] uppercase tracking-wider font-medium text-slate-500 hover:text-blue-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-500/10"
            >
              Print / PDF
            </button>
            {generatedAt && (
              <span className="text-[9px] text-slate-600 font-mono">
                {generatedAt.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-8">
        {/* Vessel Identity + Risk */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-[#0d1320] border border-[#1a2235] rounded-xl p-5 space-y-3">
            <h2 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Vessel Identity</h2>
            <div className="space-y-2">
              <div className="text-lg font-semibold text-slate-100">{String(vessel.name)}</div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <Row label="MMSI" value={String(vessel.mmsi ?? "—")} />
                <Row label="IMO" value={String(vessel.imo ?? "—")} />
                <Row label="Type" value={String(vessel.vessel_type ?? "—")} />
                <Row label="Flag" value={String(vessel.flag_state ?? "—")} />
              </div>
              {(vessel.length || vessel.beam || vessel.draft) && (
                <div className="flex gap-4 text-[11px] text-slate-400 pt-1 border-t border-[#1a2235]">
                  {vessel.length && <span>L: {parseFloat(Number(vessel.length).toFixed(1))}m</span>}
                  {vessel.beam && <span>B: {parseFloat(Number(vessel.beam).toFixed(1))}m</span>}
                  {vessel.draft && <span>D: {parseFloat(Number(vessel.draft).toFixed(1))}m</span>}
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#0d1320] border border-[#1a2235] rounded-xl p-5 space-y-3">
            <h2 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Risk Assessment</h2>
            <div className="flex items-center gap-4">
              <div className={`text-3xl font-mono font-bold ${level === "escalate" ? "text-red-400" : level === "verify" ? "text-orange-400" : level === "monitor" ? "text-yellow-400" : "text-green-400"}`}>
                {score}
              </div>
              <div className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${action.bg} ${action.color}`}>
                {action.text}
              </div>
            </div>
            {risk.explanation && (
              <p className="text-[11px] text-slate-400 leading-relaxed">{String(risk.explanation)}</p>
            )}
          </div>
        </div>

        {/* Current Position */}
        {position && (
          <div className="bg-[#0d1320] border border-[#1a2235] rounded-xl p-5">
            <h2 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">Current Position</h2>
            <div className="grid grid-cols-5 gap-4 text-[11px]">
              <Row label="Latitude" value={Number(position.latitude).toFixed(5)} />
              <Row label="Longitude" value={Number(position.longitude).toFixed(5)} />
              <Row label="Speed" value={position.speed_over_ground != null ? `${Number(position.speed_over_ground).toFixed(1)} kn` : "—"} />
              <Row label="Course" value={position.course_over_ground != null ? `${Number(position.course_over_ground).toFixed(0)}°` : "—"} />
              <Row label="Heading" value={position.heading != null ? `${Number(position.heading).toFixed(0)}°` : "—"} />
            </div>
          </div>
        )}

        {/* Anomaly Signals */}
        {signals?.length > 0 && (
          <div className="bg-[#0d1320] border border-[#1a2235] rounded-xl p-5">
            <h2 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">Anomaly Signals</h2>
            <div className="space-y-3">
              {signals.map((s, i) => {
                const sev = Number(s.severity ?? 0);
                const sevPct = Math.round(sev * 100);
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-300 font-medium">
                        {SIGNAL_LABELS[String(s.anomaly_type)] ?? String(s.anomaly_type).replace(/_/g, " ")}
                      </span>
                      <span className={`text-[10px] font-mono ${sev >= 0.55 ? "text-red-400" : sev >= 0.35 ? "text-orange-400" : sev >= 0.2 ? "text-yellow-400" : "text-green-400"}`}>
                        {sevPct}%
                      </span>
                    </div>
                    <div className="w-full bg-[#111827] rounded-full h-1.5">
                      <div
                        className={`h-full rounded-full transition-all ${sev >= 0.55 ? "bg-red-500" : sev >= 0.35 ? "bg-orange-500" : sev >= 0.2 ? "bg-yellow-500" : "bg-green-500"}`}
                        style={{ width: `${sevPct}%` }}
                      />
                    </div>
                    {s.description && (
                      <p className="text-[10px] text-slate-500">{String(s.description)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Position Trail */}
        {trail?.length > 0 && (
          <div className="bg-[#0d1320] border border-[#1a2235] rounded-xl p-5">
            <h2 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">Position Trail ({trail.length} points)</h2>
            <div className="bg-[#111827] rounded-lg border border-[#1a2235] overflow-hidden">
              <div className="grid grid-cols-6 gap-px bg-[#1a2235] text-[9px] text-slate-500 uppercase tracking-wider font-medium">
                <div className="bg-[#0d1320] px-3 py-2">Time</div>
                <div className="bg-[#0d1320] px-3 py-2">Latitude</div>
                <div className="bg-[#0d1320] px-3 py-2">Longitude</div>
                <div className="bg-[#0d1320] px-3 py-2">Speed</div>
                <div className="bg-[#0d1320] px-3 py-2">Course</div>
                <div className="bg-[#0d1320] px-3 py-2">Heading</div>
              </div>
              {trail.map((p, i) => (
                <div key={i} className="grid grid-cols-6 gap-px bg-[#1a2235] text-[11px] font-mono text-slate-400">
                  <div className="bg-[#0d1320] px-3 py-1.5">{new Date(String(p.timestamp)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
                  <div className="bg-[#0d1320] px-3 py-1.5">{Number(p.latitude).toFixed(5)}</div>
                  <div className="bg-[#0d1320] px-3 py-1.5">{Number(p.longitude).toFixed(5)}</div>
                  <div className="bg-[#0d1320] px-3 py-1.5">{p.speed_over_ground != null ? Number(p.speed_over_ground).toFixed(1) : "—"}</div>
                  <div className="bg-[#0d1320] px-3 py-1.5">{p.course_over_ground != null ? `${Number(p.course_over_ground).toFixed(0)}°` : "—"}</div>
                  <div className="bg-[#0d1320] px-3 py-1.5">{p.heading != null ? `${Number(p.heading).toFixed(0)}°` : "—"}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audit Trail */}
        {audit?.length > 0 && (
          <div className="bg-[#0d1320] border border-[#1a2235] rounded-xl p-5">
            <h2 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">Audit Trail</h2>
            <div className="space-y-2">
              {audit.map((e, i) => (
                <div key={i} className="flex items-start gap-3 text-[11px]">
                  <span className="text-slate-600 font-mono shrink-0">
                    {new Date(String(e.timestamp)).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-slate-400">{String(e.action)}{e.details ? `: ${String(e.details)}` : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Operator Notes */}
        {notes && (
          <div className="bg-[#0d1320] border border-[#1a2235] rounded-xl p-5">
            <h2 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">Operator Notes</h2>
            <p className="text-[12px] text-slate-400 leading-relaxed">{notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-[10px] text-slate-700 pt-4 pb-8 border-t border-[#1a2235]">
          HarborOS Incident Report &middot; Maritime Awareness Platform &middot; CONFIDENTIAL
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] text-slate-600 uppercase tracking-wider">{label}</div>
      <div className="text-slate-300 font-mono">{value}</div>
    </div>
  );
}
