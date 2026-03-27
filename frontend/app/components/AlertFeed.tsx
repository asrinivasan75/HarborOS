"use client";

import type { Alert } from "@/app/lib/api";

interface AlertFeedProps {
  alerts: Alert[];
  alertsTotal: number;
  selectedAlertId: string | null;
  onSelectAlert: (alert: Alert) => void;
  onLoadMore: () => void;
}

function actionColor(action: string): string {
  switch (action) {
    case "escalate": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "verify": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "monitor": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    default: return "bg-slate-500/20 text-slate-400 border-slate-500/30";
  }
}

function riskColor(score: number): string {
  if (score >= 70) return "text-red-400";
  if (score >= 45) return "text-orange-400";
  if (score >= 25) return "text-yellow-400";
  return "text-green-400";
}

function riskBg(score: number): string {
  if (score >= 70) return "bg-red-500/10 border-red-500/20";
  if (score >= 45) return "bg-orange-500/10 border-orange-500/20";
  if (score >= 25) return "bg-yellow-500/10 border-yellow-500/20";
  return "bg-green-500/10 border-green-500/20";
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

export default function AlertFeed({ alerts, alertsTotal, selectedAlertId, onSelectAlert, onLoadMore }: AlertFeedProps) {
  const hasMore = alerts.length < alertsTotal;

  return (
    <div className="w-80 bg-[#111827] border-r border-slate-700/50 flex flex-col shrink-0">
      <div className="p-3 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Alert Feed
        </h2>
        <span className="text-[10px] font-mono text-slate-500">
          {alerts.length}/{alertsTotal}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="p-4 text-sm text-slate-500 text-center">
            No active alerts
          </div>
        ) : (
          alerts.map((alert) => (
            <button
              key={alert.id}
              onClick={() => onSelectAlert(alert)}
              className={`w-full text-left p-3 border-b border-slate-700/30 transition-colors hover:bg-slate-800/50 ${
                selectedAlertId === alert.id ? "bg-slate-800/80 border-l-2 border-l-blue-500" : ""
              }`}
            >
              <div className="flex items-start justify-between mb-1.5">
                <span className="text-sm font-medium text-slate-200 truncate pr-2">
                  {alert.vessel_name || "Unknown Vessel"}
                </span>
                <span className={`text-lg font-bold font-mono ${riskColor(alert.risk_score)}`}>
                  {Math.round(alert.risk_score)}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${actionColor(
                    alert.recommended_action
                  )}`}
                >
                  {alert.recommended_action}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {alert.vessel_mmsi}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                {alert.anomaly_signals.length} signal{alert.anomaly_signals.length !== 1 ? "s" : ""}:{" "}
                {alert.anomaly_signals.map((s) => s.anomaly_type.replace(/_/g, " ")).join(", ")}
              </p>
            </button>
          ))
        )}
        {hasMore && (
          <button
            onClick={onLoadMore}
            className="w-full p-2 text-[11px] text-blue-400 hover:bg-slate-800/50 transition-colors"
          >
            Load more ({alertsTotal - alerts.length} remaining)
          </button>
        )}
      </div>
    </div>
  );
}
