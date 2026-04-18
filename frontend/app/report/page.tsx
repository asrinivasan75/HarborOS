"use client";

import { Suspense, useEffect, useState } from "react";
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
  if (action === "escalate") return { text: "ESCALATE", color: "text-red-600", bg: "bg-red-50 border-red-200" };
  if (action === "verify") return { text: "VERIFY", color: "text-orange-600", bg: "bg-orange-50 border-orange-200" };
  if (action === "monitor") return { text: "MONITOR", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" };
  return { text: "NORMAL", color: "text-green-700", bg: "bg-green-50 border-green-200" };
}

function sevColor(sev: number) {
  if (sev >= 0.55) return { text: "text-red-600", bar: "bg-red-500" };
  if (sev >= 0.35) return { text: "text-orange-600", bar: "bg-orange-500" };
  if (sev >= 0.2) return { text: "text-yellow-600", bar: "bg-yellow-500" };
  return { text: "text-green-600", bar: "bg-green-500" };
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="p-10 text-gray-400">Loading report...</div>}>
      <ReportContent />
    </Suspense>
  );
}

function ReportContent() {
  const searchParams = useSearchParams();
  const vesselId = searchParams.get("vesselId");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vesselId) return;
    api.getVesselReport(vesselId).then(setReport).catch(() => setError("Failed to load report"));
  }, [vesselId]);

  if (!vesselId) return <div className="p-10 text-gray-500">No vessel specified.</div>;
  if (error) return <div className="p-10 text-red-600">{error}</div>;
  if (!report) return <div className="p-10 text-gray-400">Loading report...</div>;

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
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-wide text-gray-900">
                HARBOR<span className="text-blue-600">OS</span>
                <span className="text-gray-300 mx-2">/</span>
                <span className="text-gray-500 font-normal">Incident Report</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="text-[10px] uppercase tracking-wider font-medium text-gray-500 hover:text-blue-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-200"
            >
              Print / PDF
            </button>
            {generatedAt && (
              <span className="text-[9px] text-gray-400 font-mono">
                {generatedAt.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
        {/* Vessel Identity + Risk */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3 shadow-sm">
            <h2 className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Vessel Identity</h2>
            <div className="space-y-2">
              <div className="text-lg font-semibold text-gray-900">{String(vessel.name)}</div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <Row label="MMSI" value={String(vessel.mmsi ?? "\u2014")} />
                <Row label="IMO" value={String(vessel.imo ?? "\u2014")} />
                <Row label="Type" value={String(vessel.vessel_type ?? "\u2014")} />
                <Row label="Flag" value={String(vessel.flag_state ?? "\u2014")} />
              </div>
              {!!(vessel.length || vessel.beam || vessel.draft) && (
                <div className="flex gap-4 text-[11px] text-gray-500 pt-2 border-t border-gray-100">
                  {vessel.length ? <span>L: {parseFloat(Number(vessel.length).toFixed(1))}m</span> : null}
                  {vessel.beam ? <span>B: {parseFloat(Number(vessel.beam).toFixed(1))}m</span> : null}
                  {vessel.draft ? <span>D: {parseFloat(Number(vessel.draft).toFixed(1))}m</span> : null}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3 shadow-sm">
            <h2 className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Risk Assessment</h2>
            <div className="flex items-center gap-4">
              <div className={`text-3xl font-mono font-bold ${level === "escalate" ? "text-red-600" : level === "verify" ? "text-orange-600" : level === "monitor" ? "text-yellow-600" : "text-green-600"}`}>
                {score}
              </div>
              <div className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${action.bg} ${action.color}`}>
                {action.text}
              </div>
            </div>
            {!!risk.explanation && (
              <p className="text-[11px] text-gray-500 leading-relaxed">{String(risk.explanation)}</p>
            )}
          </div>
        </div>

        {/* Current Position */}
        {position && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h2 className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3">Current Position</h2>
            <div className="grid grid-cols-5 gap-4 text-[11px]">
              <Row label="Latitude" value={Number(position.latitude).toFixed(5)} />
              <Row label="Longitude" value={Number(position.longitude).toFixed(5)} />
              <Row label="Speed" value={position.speed_over_ground != null ? `${Number(position.speed_over_ground).toFixed(1)} kn` : "\u2014"} />
              <Row label="Course" value={position.course_over_ground != null ? `${Number(position.course_over_ground).toFixed(0)}\u00b0` : "\u2014"} />
              <Row label="Heading" value={position.heading != null ? `${Number(position.heading).toFixed(0)}\u00b0` : "\u2014"} />
            </div>
          </div>
        )}

        {/* Anomaly Signals */}
        {signals?.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h2 className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3">Anomaly Signals</h2>
            <div className="space-y-3">
              {signals.map((s, i) => {
                const sev = Number(s.severity ?? 0);
                const sevPct = Math.round(sev * 100);
                const sc = sevColor(sev);
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-700 font-medium">
                        {SIGNAL_LABELS[String(s.anomaly_type)] ?? String(s.anomaly_type).replace(/_/g, " ")}
                      </span>
                      <span className={`text-[10px] font-mono font-semibold ${sc.text}`}>
                        {sevPct}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className={`h-full rounded-full ${sc.bar}`}
                        style={{ width: `${sevPct}%` }}
                      />
                    </div>
                    {!!s.description && (
                      <p className="text-[10px] text-gray-400">{String(s.description)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Position Trail */}
        {trail?.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h2 className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3">Position Trail ({trail.length} points)</h2>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-gray-50 text-[9px] text-gray-400 uppercase tracking-wider font-semibold">
                    <th className="px-3 py-2 text-left font-semibold">Time</th>
                    <th className="px-3 py-2 text-left font-semibold">Latitude</th>
                    <th className="px-3 py-2 text-left font-semibold">Longitude</th>
                    <th className="px-3 py-2 text-left font-semibold">Speed</th>
                    <th className="px-3 py-2 text-left font-semibold">Course</th>
                    <th className="px-3 py-2 text-left font-semibold">Heading</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {trail.map((p, i) => (
                    <tr key={i} className="font-mono text-gray-600">
                      <td className="px-3 py-1.5">{new Date(String(p.timestamp)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                      <td className="px-3 py-1.5">{Number(p.latitude).toFixed(5)}</td>
                      <td className="px-3 py-1.5">{Number(p.longitude).toFixed(5)}</td>
                      <td className="px-3 py-1.5">{p.speed_over_ground != null ? Number(p.speed_over_ground).toFixed(1) : "\u2014"}</td>
                      <td className="px-3 py-1.5">{p.course_over_ground != null ? `${Number(p.course_over_ground).toFixed(0)}\u00b0` : "\u2014"}</td>
                      <td className="px-3 py-1.5">{p.heading != null ? `${Number(p.heading).toFixed(0)}\u00b0` : "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Audit Trail */}
        {audit?.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h2 className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3">Audit Trail</h2>
            <div className="space-y-2">
              {audit.map((e, i) => (
                <div key={i} className="flex items-start gap-3 text-[11px]">
                  <span className="text-gray-400 font-mono shrink-0">
                    {new Date(String(e.timestamp)).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-gray-600">{String(e.action)}{e.details ? `: ${String(e.details)}` : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Operator Notes */}
        {notes && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h2 className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3">Operator Notes</h2>
            <p className="text-[12px] text-gray-600 leading-relaxed">{notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-[10px] text-gray-400 pt-4 pb-8 border-t border-gray-200">
          HarborOS Incident Report &middot; Maritime Awareness Platform &middot; CONFIDENTIAL
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] text-gray-400 uppercase tracking-wider font-medium">{label}</div>
      <div className="text-gray-700 font-mono">{value}</div>
    </div>
  );
}
