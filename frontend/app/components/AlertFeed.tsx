"use client";

import { useState, useMemo } from "react";
import type { Alert } from "@/app/lib/api";
import { riskTextClass, riskGlowClass, riskLevel } from "@/app/lib/risk";

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

function actionStyle(action: string) {
  switch (action) {
    case "escalate": return { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/25", dot: "bg-red-400" };
    case "verify": return { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/25", dot: "bg-orange-400" };
    case "monitor": return { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/25", dot: "bg-yellow-400" };
    case "normal": return { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/25", dot: "bg-green-400" };
    default: return { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/25", dot: "bg-slate-400" };
  }
}

const riskColor = riskTextClass;
const riskGlow = riskGlowClass;

const SIGNAL_LABELS: Record<string, string> = {
  ais_gap: "AIS dark period",
  kinematic_implausibility: "position spoofing",
  geofence_breach: "restricted zone breach",
  type_mismatch: "identity mismatch",
  route_deviation: "route deviation",
  loitering: "loitering",
  zone_lingering: "zone lingering",
  speed_anomaly: "speed anomaly",
  heading_anomaly: "course anomaly",
  statistical_outlier: "regional outlier",
  collision_risk: "COLREGS non-compliance",
  dark_ship_optical: "dark ship (optical)",
};

function signalLabel(type: string): string {
  return SIGNAL_LABELS[type] ?? type.replace(/_/g, " ");
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
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
        return dir * (new Date(a.created_at.endsWith("Z") ? a.created_at : a.created_at + "Z").getTime() - new Date(b.created_at.endsWith("Z") ? b.created_at : b.created_at + "Z").getTime());
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

  return (
    <div className="w-72 bg-[#0d1320] border-r border-[#1a2235] flex flex-col shrink-0">
      {/* Header + Search */}
      <div className="px-3 py-2 border-b border-[#1a2235]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" style={{ animation: "subtle-pulse 3s infinite" }} />
            <h2 className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">Alerts</h2>
          </div>
          <span className="text-[9px] font-mono text-slate-500">
            {filtered.length}/{alertsTotal}
          </span>
        </div>
        <div className="relative">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full bg-[#111827] border border-[#1a2235] rounded text-[10px] text-slate-300 placeholder-slate-600 pl-7 pr-2 py-1 focus:outline-none focus:border-blue-500/40 transition-colors"
          />
        </div>
      </div>

      {/* Filters + Sort — single row */}
      <div className="px-3 py-1.5 flex gap-1 border-b border-[#1a2235]">
        <button
          onClick={() => onStatusFilterChange("active")}
          className={`text-[9px] font-semibold uppercase px-2 py-1 rounded transition-all ${
            statusFilter === "active"
              ? "bg-red-500/15 text-red-400"
              : "text-slate-500 hover:text-slate-400"
          }`}
        >
          Active
        </button>
        <button
          onClick={() => onStatusFilterChange("")}
          className={`text-[9px] font-semibold uppercase px-2 py-1 rounded transition-all ${
            statusFilter === ""
              ? "bg-blue-500/15 text-blue-400"
              : "text-slate-500 hover:text-slate-400"
          }`}
        >
          All
        </button>
        <div className="flex-1" />
        {(["risk", "name", "time"] as SortKey[]).map((key) => (
          <SortButton
            key={key}
            label={key.charAt(0).toUpperCase() + key.slice(1)}
            active={sortKey === key}
            ascending={sortKey === key ? ascending : undefined}
            onClick={() => {
              if (sortKey === key) {
                setAscending(!ascending);
              } else {
                setSortKey(key);
                setAscending(false);
              }
            }}
          />
        ))}
      </div>

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-1.5 space-y-1">
        {filtered.length === 0 ? (
          <div className="p-4 text-[10px] text-slate-500 text-center">
            {search ? "No matching alerts" : "No active alerts"}
          </div>
        ) : (
          filtered.map((alert) => {
            const level = riskLevel(alert.risk_score);
            const displayAction = level === "normal" ? "normal" : alert.recommended_action;
            const style = actionStyle(displayAction);
            const isSelected = selectedAlertId === alert.id;
            const isResolved = alert.status !== "active";
            return (
              <button
                key={alert.id}
                onClick={() => onSelectAlert(alert)}
                className={`w-full text-left rounded-md px-2.5 py-2 transition-all ${
                  isSelected
                    ? "bg-blue-500/10 border border-blue-500/30"
                    : isResolved
                    ? "bg-[#111827]/30 border border-transparent opacity-50 hover:opacity-70"
                    : "bg-[#111827]/60 border border-transparent hover:bg-[#111827] active:scale-[0.98]"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[12px] font-medium truncate ${isResolved ? "text-slate-400" : "text-slate-200"}`}>
                    {alert.vessel_name || "Unknown Vessel"}
                  </span>
                  <div className={`text-lg font-bold font-mono leading-none ml-2 ${isResolved ? "text-slate-500" : riskColor(alert.risk_score)}`}>
                    {Math.round(alert.risk_score)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {isResolved ? (
                    <span className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                      {alert.status}
                    </span>
                  ) : (
                    <span className={`text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                      {displayAction}
                    </span>
                  )}
                  <span className="text-[9px] text-slate-600">{timeAgo(alert.created_at)}</span>
                </div>
                <p className="text-[9px] text-slate-500 line-clamp-1 mt-1">
                  {alert.anomaly_signals.map((s) => signalLabel(s.anomaly_type)).join(" · ")}
                </p>
              </button>
            );
          })
        )}
        {hasMore && !search && (
          <button
            onClick={onLoadMore}
            className="w-full py-2 text-[10px] font-medium text-blue-400 hover:text-blue-300 bg-blue-500/5 hover:bg-blue-500/10 rounded transition-all"
          >
            Load more ({alertsTotal - alerts.length})
          </button>
        )}
      </div>
    </div>
  );
}

function SortButton({ label, active, ascending, onClick }: { label: string; active: boolean; ascending?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[8px] font-semibold uppercase px-1.5 py-1 rounded transition-all inline-flex items-center gap-0.5 ${
        active ? "text-blue-400" : "text-slate-600 hover:text-slate-400"
      }`}
    >
      {label}
      {active && (
        <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="transition-transform duration-200" style={{ transform: ascending ? "rotate(180deg)" : undefined }}>
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      )}
    </button>
  );
}
