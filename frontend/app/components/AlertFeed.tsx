"use client";

import { useState, useMemo } from "react";
import type { Alert } from "@/app/lib/api";

interface AlertFeedProps {
  alerts: Alert[];
  alertsTotal: number;
  selectedAlertId: string | null;
  onSelectAlert: (alert: Alert) => void;
  onLoadMore: () => void;
}

type SortKey = "risk" | "name" | "time";

function actionStyle(action: string) {
  switch (action) {
    case "escalate": return { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/25", dot: "bg-red-400" };
    case "verify": return { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/25", dot: "bg-orange-400" };
    case "monitor": return { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/25", dot: "bg-yellow-400" };
    default: return { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/25", dot: "bg-slate-400" };
  }
}

function riskColor(score: number): string {
  if (score >= 70) return "text-red-400";
  if (score >= 45) return "text-orange-400";
  if (score >= 25) return "text-yellow-400";
  return "text-green-400";
}

function riskGlow(score: number): string {
  if (score >= 70) return "shadow-red-500/20";
  if (score >= 45) return "shadow-orange-500/20";
  return "";
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
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
        return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
  });
}

export default function AlertFeed({ alerts, alertsTotal, selectedAlertId, onSelectAlert, onLoadMore }: AlertFeedProps) {
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
    <div className="w-80 bg-[#0d1320] border-r border-[#1a2235] flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1a2235] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400" style={{ animation: "subtle-pulse 3s infinite" }} />
          <h2 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
            Alerts
          </h2>
        </div>
        <span className="text-[10px] font-mono text-slate-500 bg-[#111827] px-2 py-0.5 rounded-md">
          {filtered.length}<span className="text-slate-600">/</span>{alertsTotal}
        </span>
      </div>

      {/* Search */}
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="relative">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vessels, MMSI, type..."
            className="w-full bg-[#111827] border border-[#1a2235] rounded-lg text-[11px] text-slate-300 placeholder-slate-600 pl-8 pr-3 py-1.5 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/15 transition-colors"
          />
        </div>
      </div>

      {/* Sort buttons */}
      <div className="px-3 pb-2.5 flex gap-1 justify-evenly">
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
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5">
        {filtered.length === 0 ? (
          <div className="p-6 text-xs text-slate-500 text-center">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-600">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            {search ? "No matching alerts" : "No active alerts"}
          </div>
        ) : (
          filtered.map((alert) => {
            const style = actionStyle(alert.recommended_action);
            const isSelected = selectedAlertId === alert.id;
            return (
              <button
                key={alert.id}
                onClick={() => onSelectAlert(alert)}
                className={`w-full text-left rounded-lg p-3 transition-all ${
                  isSelected
                    ? "bg-blue-500/10 border border-blue-500/30 shadow-lg shadow-blue-500/5"
                    : "bg-[#111827]/60 border border-transparent hover:bg-[#111827] hover:border-[#1a2235]"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0 pr-3">
                    <span className="text-[13px] font-medium text-slate-200 truncate block">
                      {alert.vessel_name || "Unknown Vessel"}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {alert.vessel_mmsi}
                    </span>
                  </div>
                  <div className={`text-xl font-bold font-mono leading-none ${riskColor(alert.risk_score)} ${riskGlow(alert.risk_score)} drop-shadow-sm`}>
                    {Math.round(alert.risk_score)}
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center gap-1 text-[9px] font-semibold uppercase px-2 py-0.5 rounded-md border ${style.bg} ${style.text} ${style.border}`}>
                    <span className={`w-1 h-1 rounded-full ${style.dot}`} />
                    {alert.recommended_action}
                  </span>
                  <span className="text-[10px] text-slate-600">
                    {timeAgo(alert.created_at)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">
                  {alert.anomaly_signals.map((s) => s.anomaly_type.replace(/_/g, " ")).join(", ")}
                </p>
              </button>
            );
          })
        )}
        {hasMore && !search && (
          <button
            onClick={onLoadMore}
            className="w-full py-2.5 text-[11px] font-medium text-blue-400 hover:text-blue-300 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 hover:border-blue-500/20 rounded-lg transition-all"
          >
            Load more ({alertsTotal - alerts.length} remaining)
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
      className={`flex-1 text-[9px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md transition-all inline-flex items-center justify-center gap-1 ${
        active
          ? "bg-blue-500/15 text-blue-400 border border-blue-500/25"
          : "text-slate-500 hover:text-slate-400 border border-transparent hover:bg-[#111827]"
      }`}
    >
      {label}
      {active && (
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="transition-transform" style={{ transform: ascending ? "rotate(180deg)" : undefined }}>
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      )}
    </button>
  );
}
