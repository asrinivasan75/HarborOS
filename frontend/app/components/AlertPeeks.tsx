"use client";

import { useState, useEffect } from "react";
import type { Alert } from "@/app/lib/api";
import { riskLevel } from "@/app/lib/risk";

interface AlertPeeksProps {
  alerts: Alert[];
  onSelectAlert: (alert: Alert) => void;
  selectedAlertId: string | null;
}

type Tier = "escalate" | "verify" | "monitor" | "normal";

function tierOf(action: string, score: number): Tier {
  if (riskLevel(score) === "normal") return "normal";
  if (action === "escalate") return "escalate";
  if (action === "verify") return "verify";
  if (action === "monitor") return "monitor";
  return "normal";
}

const TIER_COLORS: Record<Tier, { dot: string; text: string; risk: string }> = {
  escalate: { dot: "bg-red-400", text: "text-red-300", risk: "text-red-300" },
  verify: { dot: "bg-amber-400", text: "text-amber-300", risk: "text-amber-300" },
  monitor: { dot: "bg-cyan-400", text: "text-cyan-300", risk: "text-cyan-300" },
  normal: { dot: "bg-emerald-400", text: "text-emerald-300", risk: "text-emerald-300" },
};

const COLLAPSED = 3;

export default function AlertPeeks({ alerts, onSelectAlert, selectedAlertId }: AlertPeeksProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const ids = new Set(alerts.map((a) => a.id));
    setDismissed((prev) => new Set([...prev].filter((id) => ids.has(id))));
  }, [alerts]);

  const activeSorted = alerts
    .filter((a) => a.status === "active" && !dismissed.has(a.id))
    .sort((a, b) => b.risk_score - a.risk_score);

  if (activeSorted.length === 0) {
    return (
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-[rgba(18,22,36,0.82)] backdrop-blur-xl border border-emerald-400/20 shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
          <span className="relative flex items-center justify-center w-2 h-2">
            <span className="absolute w-2 h-2 rounded-full bg-emerald-400/40" style={{ animation: "subtle-pulse 2.4s infinite" }} />
            <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[12.5px] font-semibold text-slate-200">No active alerts</span>
          <span className="font-mono text-[10px] text-emerald-300 tracking-[0.14em] uppercase">Nominal</span>
        </div>
      </div>
    );
  }

  const visible = hovered ? activeSorted : activeSorted.slice(0, COLLAPSED);
  const hiddenCount = activeSorted.length - visible.length;

  // Expanded window = ~5 rows tall, scroll reveals the rest
  const maxH = hovered ? 5 * 58 + 4 * 6 : "auto";

  return (
    <div
      className={`absolute bottom-4 left-4 z-20 flex flex-col gap-1.5 pr-1 ${hovered ? "overflow-y-auto scroll-thin" : "overflow-visible"}`}
      style={{ maxHeight: typeof maxH === "number" ? `${maxH}px` : maxH }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hiddenCount > 0 && (
        <div className="self-start px-2.5 py-1 rounded-full bg-[rgba(18,22,36,0.75)] backdrop-blur-xl border border-white/[0.1] font-mono text-[10px] text-slate-400">
          +{hiddenCount} more · hover to expand
        </div>
      )}
      {visible.map((alert) => {
        const tier = tierOf(alert.recommended_action, alert.risk_score);
        const c = TIER_COLORS[tier];
        const isSelected = selectedAlertId === alert.id;

        return (
          <div
            key={alert.id}
            className={`group flex items-center gap-3 px-3.5 py-2.5 rounded-xl backdrop-blur-xl border min-w-[320px] max-w-[360px] cursor-pointer transition-colors shrink-0 ${
              isSelected
                ? "bg-[rgba(24,28,44,0.92)] border-white/[0.22]"
                : "bg-[rgba(18,22,36,0.82)] border-white/[0.14] hover:bg-[rgba(22,26,40,0.9)] hover:border-white/[0.2]"
            }`}
            onClick={() => onSelectAlert(alert)}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-slate-100 truncate leading-tight">
                {alert.vessel_name || "Unknown Vessel"}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] ${c.text}`}>
                  {alert.recommended_action}
                </span>
                <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                  MMSI {alert.vessel_mmsi || "—"}
                </span>
              </div>
            </div>
            <div className={`font-mono text-[15px] font-bold tabular-nums leading-none tracking-[-0.02em] ${c.risk}`}>
              {Math.round(alert.risk_score)}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDismissed((prev) => new Set([...prev, alert.id]));
              }}
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors opacity-0 group-hover:opacity-100"
              title="Dismiss"
            >
              <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
