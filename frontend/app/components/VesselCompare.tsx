"use client";

import type { VesselDetail } from "@/app/lib/api";
import { riskTextClass, riskBgClass } from "@/app/lib/risk";

interface VesselCompareProps {
  vessels: VesselDetail[];
  onRemove: (vesselId: string) => void;
  onClear: () => void;
}

function riskColor(score: number | null): string {
  if (score === null) return "text-slate-400";
  return riskTextClass(score);
}

function riskBg(score: number | null): string {
  if (score === null) return "bg-slate-500/10";
  return riskBgClass(score);
}

function actionStyle(action: string | null) {
  switch (action) {
    case "escalate":
      return "bg-red-500/10 text-red-400 border-red-500/25";
    case "verify":
      return "bg-orange-500/10 text-orange-400 border-orange-500/25";
    case "monitor":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/25";
    default:
      return "bg-slate-500/10 text-slate-400 border-slate-500/25";
  }
}

function regionFromPosition(vessel: VesselDetail): string {
  if (!vessel.latest_position) return "Unknown";
  const { latitude, longitude } = vessel.latest_position;
  if (latitude >= 0 && latitude <= 30 && longitude >= 90 && longitude <= 150) return "South China Sea";
  if (latitude >= 50 && latitude <= 75 && longitude >= -10 && longitude <= 40) return "North Sea";
  if (latitude >= -15 && latitude <= 15 && longitude >= 35 && longitude <= 75) return "Indian Ocean";
  if (latitude >= 25 && latitude <= 50 && longitude >= -10 && longitude <= 45) return "Mediterranean";
  return "Open Ocean";
}

export default function VesselCompare({ vessels, onRemove, onClear }: VesselCompareProps) {
  if (vessels.length === 0) return null;

  return (
    <div className="bg-[#0d1320]/95 backdrop-blur-md border-t border-[#1a2235] px-4 py-3" style={{ minHeight: "140px", maxHeight: "240px" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-blue-400">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
            Vessel Comparison
          </span>
          <span className="text-[10px] font-mono text-slate-500 bg-[#111827] px-2 py-0.5 rounded-md">
            {vessels.length}/3
          </span>
        </div>
        <button
          onClick={onClear}
          className="text-[10px] font-medium text-slate-400 hover:text-slate-200 bg-[#111827] hover:bg-[#1a2235] px-3 py-1.5 rounded-md border border-[#1a2235] hover:border-slate-600 transition-all"
        >
          Clear All
        </button>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        {vessels.map((vessel) => {
          const speed = vessel.latest_position?.speed_over_ground;
          const heading = vessel.latest_position?.heading ?? vessel.latest_position?.course_over_ground;
          const topSignals = vessel.anomaly_signals.slice(0, 3);
          const region = regionFromPosition(vessel);

          return (
            <div
              key={vessel.id}
              className="flex-1 bg-[#111827] rounded-lg border border-[#1a2235] p-4 relative overflow-hidden"
            >
              {/* Remove button */}
              <button
                onClick={() => onRemove(vessel.id)}
                className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-[#1a2235] transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>

              <div className="flex items-start gap-3 mb-2">
                {/* Risk score */}
                <div className={`w-12 h-12 rounded-lg ${riskBg(vessel.risk_score)} flex items-center justify-center shrink-0`}>
                  <span className={`text-2xl font-bold font-mono ${riskColor(vessel.risk_score)}`}>
                    {vessel.risk_score !== null ? Math.round(vessel.risk_score) : "--"}
                  </span>
                </div>

                {/* Name and MMSI */}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-slate-200 truncate pr-4">
                    {vessel.name || "Unknown Vessel"}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">{vessel.mmsi}</p>
                  {vessel.recommended_action && (
                    <span className={`inline-flex items-center text-[9px] font-semibold uppercase px-2 py-0.5 rounded-md border mt-1 ${actionStyle(vessel.recommended_action)}`}>
                      {vessel.recommended_action}
                    </span>
                  )}
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-3 mb-2 text-[10px]">
                <span className="text-slate-500">
                  SPD <span className="text-slate-300 font-mono">{speed !== null && speed !== undefined ? `${speed.toFixed(1)} kn` : "--"}</span>
                </span>
                <span className="text-slate-500">
                  HDG <span className="text-slate-300 font-mono">{heading !== null && heading !== undefined ? `${Math.round(heading)}°` : "--"}</span>
                </span>
                <span className="text-slate-500">
                  RGN <span className="text-slate-300">{region}</span>
                </span>
              </div>

              {/* Top anomaly signals */}
              {topSignals.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {topSignals.map((signal, i) => (
                    <span
                      key={i}
                      className="text-[9px] text-slate-400 bg-[#0d1320] px-1.5 py-0.5 rounded border border-[#1a2235]"
                    >
                      {({"ais_gap":"AIS dark period","kinematic_implausibility":"position spoofing","geofence_breach":"restricted zone breach","type_mismatch":"identity mismatch","collision_risk":"COLREGS non-compliance","loitering":"loitering","speed_anomaly":"speed anomaly","heading_anomaly":"course anomaly","route_deviation":"route deviation","zone_lingering":"zone lingering","statistical_outlier":"regional outlier","dark_ship_optical":"dark ship (optical)"} as Record<string,string>)[signal.anomaly_type] ?? signal.anomaly_type.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Empty slots */}
        {Array.from({ length: 3 - vessels.length }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="flex-1 bg-[#111827]/40 rounded-lg border border-dashed border-[#1a2235] flex items-center justify-center"
          >
            <span className="text-[10px] text-slate-600">Click &quot;Compare&quot; on an alert</span>
          </div>
        ))}
      </div>
    </div>
  );
}
