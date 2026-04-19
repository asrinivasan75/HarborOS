"use client";

import { useState, useMemo } from "react";
import type { Alert } from "@/app/lib/api";
import { riskLevel } from "@/app/lib/risk";

interface AlertFeedProps {
  alerts: Alert[];
  alertsTotal: number;
  selectedAlertId: string | null;
  onSelectAlert: (alert: Alert) => void;
  onLoadMore: () => void;
  statusFilter: string;
  onStatusFilterChange: (filter: string) => void;
}

type SortKey = "risk" | "name" | "time";

type Tier = "escalate" | "verify" | "monitor" | "normal";

function tierOf(action: string, score: number): Tier {
  if (riskLevel(score) === "normal") return "normal";
  if (action === "escalate") return "escalate";
  if (action === "verify") return "verify";
  if (action === "monitor") return "monitor";
  return "normal";
}

function tierColor(tier: Tier) {
  switch (tier) {
    case "escalate":
      return { text: "text-red-300", ring: "ring-red-400/30", bg: "bg-red-400/12", pill: "bg-red-400/15 text-red-300 border-red-400/30", score: "text-red-300", accent: "from-red-400/15 to-rose-400/5" };
    case "verify":
      return { text: "text-amber-300", ring: "ring-amber-400/30", bg: "bg-amber-400/12", pill: "bg-amber-400/15 text-amber-300 border-amber-400/30", score: "text-amber-300", accent: "from-amber-400/12 to-orange-400/5" };
    case "monitor":
      return { text: "text-cyan-300", ring: "ring-cyan-400/25", bg: "bg-cyan-400/10", pill: "bg-cyan-400/12 text-cyan-300 border-cyan-400/25", score: "text-cyan-300", accent: "from-cyan-400/10 to-sky-400/5" };
    default:
      return { text: "text-emerald-300", ring: "ring-emerald-400/25", bg: "bg-emerald-400/10", pill: "bg-emerald-400/12 text-emerald-300 border-emerald-400/25", score: "text-emerald-300", accent: "from-emerald-400/10 to-teal-400/5" };
  }
}

const SIGNAL_LABELS: Record<string, string> = {
  ais_gap: "AIS dark",
  kinematic_implausibility: "Spoofing",
  geofence_breach: "Geofence",
  type_mismatch: "Identity",
  route_deviation: "Route dev.",
  loitering: "Loitering",
  zone_lingering: "Zone linger",
  speed_anomaly: "Speed Δ",
  heading_anomaly: "Course Δ",
  statistical_outlier: "Outlier",
  collision_risk: "COLREGS",
  dark_ship_optical: "Dark (optical)",
};

const CRITICAL_SIGNALS = new Set(["ais_gap", "kinematic_implausibility", "geofence_breach", "type_mismatch", "dark_ship_optical"]);

function signalLabel(type: string): string {
  return SIGNAL_LABELS[type] ?? type.replace(/_/g, " ");
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return `${Math.floor(diffHr / 24)}d`;
}

function sortAlerts(alerts: Alert[], key: SortKey, ascending: boolean): Alert[] {
  const dir = ascending ? 1 : -1;
  return [...alerts].sort((a, b) => {
    switch (key) {
      case "risk":
        return dir * (a.risk_score - b.risk_score);
      case "name":
        return dir * (a.vessel_name || "").localeCompare(b.vessel_name || "");
      case "time":
        return dir * (
          new Date(a.created_at.endsWith("Z") ? a.created_at : a.created_at + "Z").getTime() -
          new Date(b.created_at.endsWith("Z") ? b.created_at : b.created_at + "Z").getTime()
        );
    }
  });
}

export default function AlertFeed({ alerts, alertsTotal, selectedAlertId, onSelectAlert, onLoadMore, statusFilter, onStatusFilterChange }: AlertFeedProps) {
  const hasMore = alerts.length < alertsTotal;
  const [sortKey, setSortKey] = useState<SortKey>("risk");
  const [ascending, setAscending] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let result = alerts;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = alerts.filter(
        (a) =>
          (a.vessel_name || "").toLowerCase().includes(q) ||
          (a.vessel_mmsi || "").includes(q) ||
          a.recommended_action.toLowerCase().includes(q) ||
          a.anomaly_signals.some((s) => s.anomaly_type.replace(/_/g, " ").toLowerCase().includes(q))
      );
    }
    return sortAlerts(result, sortKey, ascending);
  }, [alerts, sortKey, ascending, search]);

  const activeCount = alerts.filter((a) => a.status === "active").length;

  return (
    <aside className="w-[320px] shrink-0 flex flex-col border-r border-white/[0.06] bg-[rgba(10,12,22,0.4)] backdrop-blur-xl" data-tour="alerts">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-white/[0.06]">
        <div className="flex items-baseline justify-between mb-3">
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-[15px] font-semibold tracking-tight text-slate-100">Triage queue</h2>
            <span className={`font-mono text-[11px] tabular-nums ${activeCount > 0 ? "text-red-300" : "text-slate-500"}`}>
              {activeCount} active
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-500 tabular-nums">
            {filtered.length}/{alertsTotal}
          </span>
        </div>
        <div className="relative">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, MMSI, or signal..."
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg text-[12px] text-slate-200 placeholder-slate-600 pl-8 pr-3 py-2 focus:outline-none focus:border-violet-400/40 focus:bg-white/[0.06] transition-colors"
          />
        </div>
      </div>

      {/* Filters + Sort */}
      <div className="px-5 py-2.5 flex items-center gap-1 border-b border-white/[0.06]" data-tour="alert-controls">
        <div className="flex gap-1 p-0.5 bg-white/[0.03] rounded-lg border border-white/[0.05]">
          <FilterPill active={statusFilter === "active"} onClick={() => onStatusFilterChange("active")}>Active</FilterPill>
          <FilterPill active={statusFilter === ""} onClick={() => onStatusFilterChange("")}>All</FilterPill>
        </div>
        <div className="flex-1" />
        <div className="flex gap-0.5">
          {(["risk", "name", "time"] as SortKey[]).map((key) => (
            <SortButton
              key={key}
              label={key === "risk" ? "Risk" : key === "name" ? "A–Z" : "Time"}
              active={sortKey === key}
              ascending={sortKey === key ? ascending : undefined}
              onClick={() => {
                if (sortKey === key) setAscending(!ascending);
                else { setSortKey(key); setAscending(false); }
              }}
            />
          ))}
        </div>
      </div>

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-1.5 scroll-thin">
        {filtered.length === 0 ? (
          <div className="p-6 text-center">
            <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mx-auto mb-3">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-slate-500">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <p className="text-[12px] text-slate-400">
              {search ? "No matching alerts" : "All clear"}
            </p>
            <p className="text-[11px] text-slate-600 mt-1">
              {search ? "Try a different query" : "No active threat signals"}
            </p>
          </div>
        ) : (
          filtered.map((alert) => {
            const tier = tierOf(alert.recommended_action, alert.risk_score);
            const c = tierColor(tier);
            const isSelected = selectedAlertId === alert.id;
            const isResolved = alert.status !== "active";

            return (
              <button
                key={alert.id}
                onClick={() => onSelectAlert(alert)}
                className={`group w-full text-left rounded-xl p-3.5 transition-all relative border ${
                  isSelected
                    ? `bg-gradient-to-br ${c.accent} border-transparent ${c.ring} ring-1 shadow-[0_8px_24px_rgba(0,0,0,0.25)]`
                    : isResolved
                    ? "bg-white/[0.02] border-white/[0.04] opacity-50 hover:opacity-75"
                    : "bg-white/[0.025] border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.08]"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <div className={`text-[14px] font-semibold leading-tight truncate ${isResolved ? "text-slate-400" : "text-slate-100"}`}>
                      {alert.vessel_name || "Unknown Vessel"}
                    </div>
                    <div className="font-mono text-[10.5px] text-slate-500 tabular-nums mt-0.5">
                      MMSI {alert.vessel_mmsi || "—"}
                    </div>
                  </div>
                  <div className={`text-[22px] font-bold tabular-nums leading-none tracking-[-0.02em] ${isResolved ? "text-slate-500" : c.score}`}>
                    {Math.round(alert.risk_score)}
                  </div>
                </div>

                {alert.anomaly_signals.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 mb-2">
                    {alert.anomaly_signals.slice(0, 3).map((s, i) => {
                      const isCritical = CRITICAL_SIGNALS.has(s.anomaly_type);
                      return (
                        <span
                          key={i}
                          className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                            isCritical && !isResolved
                              ? `${c.pill}`
                              : "bg-white/[0.04] text-slate-400 border-white/[0.06]"
                          }`}
                        >
                          {signalLabel(s.anomaly_type)}
                        </span>
                      );
                    })}
                    {alert.anomaly_signals.length > 3 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-slate-500 border border-white/[0.06] font-medium">
                        +{alert.anomaly_signals.length - 3}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between font-mono text-[10px] text-slate-500">
                  <span>
                    {isResolved ? (
                      <span className="text-emerald-400/80 uppercase tracking-wider">{alert.status}</span>
                    ) : (
                      <span className={`${c.text} uppercase tracking-wider font-semibold`}>{alert.recommended_action}</span>
                    )}
                  </span>
                  <span className="tabular-nums">{timeAgo(alert.created_at)}</span>
                </div>
              </button>
            );
          })
        )}
        {hasMore && !search && (
          <button
            onClick={onLoadMore}
            className="w-full py-2.5 text-[12px] font-semibold text-violet-300 hover:text-violet-200 bg-white/[0.02] hover:bg-violet-400/10 rounded-xl transition-all border border-white/[0.05] hover:border-violet-400/25"
          >
            Load {alertsTotal - alerts.length} more
          </button>
        )}
      </div>
    </aside>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] font-semibold px-2.5 py-1 rounded-[6px] transition-all ${
        active ? "bg-white/[0.08] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-slate-500 hover:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

function SortButton({ label, active, ascending, onClick }: { label: string; active: boolean; ascending?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10.5px] font-semibold px-2 py-1 rounded-md transition-all inline-flex items-center gap-0.5 ${
        active ? "text-violet-300 bg-violet-400/8" : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"
      }`}
    >
      {label}
      {active && (
        <svg aria-hidden="true" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="transition-transform duration-200" style={{ transform: ascending ? "rotate(180deg)" : undefined }}>
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      )}
    </button>
  );
}
