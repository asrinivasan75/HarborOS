"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/app/lib/api";
import type { Region, DetectionMetrics, IngestionStatus } from "@/app/lib/api";

interface RegionStats {
  key: string;
  name: string;
  vessels: number;
  alerts: number;
  escalations: number;
}

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<DetectionMetrics | null>(null);
  const [ingestion, setIngestion] = useState<IngestionStatus | null>(null);
  const [regions, setRegions] = useState<Record<string, Region>>({});
  const [regionStats, setRegionStats] = useState<RegionStats[]>([]);
  const [archiveStats, setArchiveStats] = useState<{ archive_count: number; total_rows: number; total_size_mb: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [m, i, r] = await Promise.all([
          api.getDetectionMetrics(),
          api.getIngestionStatus().catch(() => null),
          api.getRegions(),
        ]);
        setMetrics(m);
        setIngestion(i);
        setRegions(r);

        // Fetch per-region vessel/alert counts
        const stats: RegionStats[] = [];
        for (const [key, region] of Object.entries(r)) {
          try {
            const [v, a] = await Promise.all([
              api.getVessels(key, 1, 0),
              api.getAlerts(undefined, key, 1, 0),
            ]);
            const escalations = (await api.getAlerts(undefined, key, 500, 0)).items.filter(
              (al) => al.recommended_action === "escalate"
            ).length;
            stats.push({ key, name: region.name, vessels: v.total, alerts: a.total, escalations });
          } catch {
            stats.push({ key, name: region.name, vessels: 0, alerts: 0, escalations: 0 });
          }
        }
        setRegionStats(stats.sort((a, b) => b.vessels - a.vessels));

        // Archive stats
        try {
          const arch = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/archive/stats`).then((r) => r.json());
          setArchiveStats(arch);
        } catch {}

        setLoading(false);
      } catch {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070a12] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
      </div>
    );
  }

  const totalVessels = regionStats.reduce((s, r) => s + r.vessels, 0);
  const totalAlerts = metrics?.total_alerts ?? 0;

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-200 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-xs text-blue-400 hover:text-blue-300 mb-2 block">
              &larr; Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-slate-100">
              HARBOR<span className="text-blue-400">OS</span> Analytics
            </h1>
            <p className="text-sm text-slate-500 mt-1">System performance and detection quality metrics</p>
          </div>
          {ingestion?.running && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-emerald-400 font-medium">Live Ingestion Active</span>
            </div>
          )}
        </div>

        {/* Top metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <MetricCard label="Total Vessels" value={totalVessels.toLocaleString()} />
          <MetricCard label="Active Alerts" value={metrics?.active_alerts.toLocaleString() ?? "0"} accent={metrics?.active_alerts ? "red" : undefined} />
          <MetricCard
            label="Detection Precision"
            value={metrics?.precision != null ? `${(metrics.precision * 100).toFixed(1)}%` : "No feedback yet"}
            subtitle={metrics?.confirmed_threats != null ? `${metrics.confirmed_threats} confirmed / ${metrics.false_positives} false pos` : undefined}
          />
          <MetricCard
            label="Positions Ingested"
            value={ingestion?.positions_ingested?.toLocaleString() ?? "0"}
            subtitle={ingestion?.stream_stats ? `${ingestion.stream_stats.messages_received.toLocaleString()} messages total` : undefined}
          />
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Region breakdown */}
          <div className="bg-[#0d1320] border border-[#1a2235] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
              Vessels by Region
            </h2>
            <div className="space-y-3">
              {regionStats.map((r) => (
                <div key={r.key} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-300 truncate">{r.name}</span>
                      <span className="text-xs font-mono text-slate-400">{r.vessels}</span>
                    </div>
                    <div className="w-full bg-[#111827] rounded-full h-2">
                      <div
                        className="h-full rounded-full bg-blue-500/60"
                        style={{ width: `${totalVessels > 0 ? (r.vessels / totalVessels) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Alert breakdown */}
          <div className="bg-[#0d1320] border border-[#1a2235] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
              Alert Distribution
            </h2>
            {metrics && (
              <div className="space-y-4">
                <AlertBar label="Escalate" count={regionStats.reduce((s, r) => s + r.escalations, 0)} total={totalAlerts} color="bg-red-500" />
                <AlertBar label="Active" count={metrics.active_alerts} total={totalAlerts} color="bg-orange-500" />
                <AlertBar label="Acknowledged" count={metrics.acknowledged} total={totalAlerts} color="bg-blue-500" />
                <AlertBar label="Dismissed" count={metrics.dismissed} total={totalAlerts} color="bg-slate-500" />

                <div className="border-t border-[#1a2235] pt-4 mt-4">
                  <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Operator Feedback</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <FeedbackStat label="Confirmed" value={metrics.confirmed_threats} color="text-red-400" />
                    <FeedbackStat label="False Positive" value={metrics.false_positives} color="text-yellow-400" />
                    <FeedbackStat label="Pending" value={metrics.pending_feedback} color="text-slate-400" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Ingestion and archive stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Ingestion stats */}
          {ingestion && (
            <div className="bg-[#0d1320] border border-[#1a2235] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
                Live Ingestion
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <StatRow label="Vessels Discovered" value={ingestion.vessels_seen.toLocaleString()} />
                <StatRow label="Positions Ingested" value={ingestion.positions_ingested.toLocaleString()} />
                <StatRow label="Vessels Created" value={ingestion.vessels_created.toLocaleString()} />
                <StatRow label="Vessels Updated" value={ingestion.vessels_updated.toLocaleString()} />
                <StatRow label="Stream Messages" value={ingestion.stream_stats.messages_received.toLocaleString()} />
                <StatRow label="Stream Errors" value={ingestion.stream_stats.errors.toLocaleString()} />
                <StatRow label="Regions Active" value={String(ingestion.stream_stats.regions?.length ?? 0)} />
                <StatRow label="Connected Since" value={ingestion.stream_stats.connected_since ? new Date(ingestion.stream_stats.connected_since).toLocaleTimeString() : "—"} />
              </div>
            </div>
          )}

          {/* Archive stats */}
          {archiveStats && (
            <div className="bg-[#0d1320] border border-[#1a2235] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
                Data Archive (Parquet)
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <StatRow label="Archive Files" value={String(archiveStats.archive_count)} />
                <StatRow label="Total Rows" value={archiveStats.total_rows.toLocaleString()} />
                <StatRow label="Total Size" value={`${archiveStats.total_size_mb} MB`} />
                <StatRow label="Compression" value="~7x vs SQLite" />
              </div>
            </div>
          )}
        </div>

        {/* Region detail table */}
        <div className="bg-[#0d1320] border border-[#1a2235] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
            Region Detail
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider">
                <th className="text-left py-2">Region</th>
                <th className="text-right py-2">Vessels</th>
                <th className="text-right py-2">Alerts</th>
                <th className="text-right py-2">Escalations</th>
                <th className="text-right py-2">Alert Rate</th>
              </tr>
            </thead>
            <tbody>
              {regionStats.map((r) => (
                <tr key={r.key} className="border-t border-[#1a2235]">
                  <td className="py-2.5 text-slate-300">{r.name}</td>
                  <td className="py-2.5 text-right font-mono text-slate-400">{r.vessels}</td>
                  <td className="py-2.5 text-right font-mono text-slate-400">{r.alerts}</td>
                  <td className="py-2.5 text-right font-mono text-red-400">{r.escalations}</td>
                  <td className="py-2.5 text-right font-mono text-slate-400">
                    {r.vessels > 0 ? `${((r.alerts / r.vessels) * 100).toFixed(0)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, subtitle, accent }: { label: string; value: string; subtitle?: string; accent?: string }) {
  return (
    <div className="bg-[#0d1320] border border-[#1a2235] rounded-xl p-4">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${accent === "red" ? "text-red-400" : "text-slate-100"}`}>
        {value}
      </div>
      {subtitle && <div className="text-[10px] text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
}

function AlertBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-xs font-mono text-slate-300">{count.toLocaleString()}</span>
      </div>
      <div className="w-full bg-[#111827] rounded-full h-1.5">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FeedbackStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-[#111827] rounded-lg p-3 text-center">
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-mono text-slate-300">{value}</div>
    </div>
  );
}
