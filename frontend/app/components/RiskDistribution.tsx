"use client";

import { RiskDistribution } from "@/app/lib/api";

interface Props {
  data: RiskDistribution | null;
  onClose: () => void;
  closing?: boolean;
}

const TIER_COLORS: Record<string, { text: string; bg: string; border: string; bar: string; dot: string }> = {
  escalate: { text: "text-red-300", bg: "bg-red-500/[0.08]", border: "border-red-400/25", bar: "bg-red-400", dot: "bg-red-400" },
  verify: { text: "text-amber-300", bg: "bg-amber-500/[0.08]", border: "border-amber-400/25", bar: "bg-amber-400", dot: "bg-amber-400" },
  monitor: { text: "text-cyan-300", bg: "bg-cyan-500/[0.08]", border: "border-cyan-400/25", bar: "bg-cyan-400", dot: "bg-cyan-400" },
  normal: { text: "text-emerald-300", bg: "bg-emerald-500/[0.08]", border: "border-emerald-400/25", bar: "bg-emerald-400", dot: "bg-emerald-400" },
};

function binColor(binMid: number): string {
  if (binMid >= 80) return "bg-red-400";
  if (binMid >= 60) return "bg-amber-400";
  if (binMid >= 35) return "bg-yellow-400";
  return "bg-emerald-400";
}

export default function RiskDistributionPanel({ data, onClose, closing }: Props) {
  if (!data) return null;

  const maxActive = Math.max(...data.histogram.map((b) => b.count_active), 1);
  const maxTotal = Math.max(...data.histogram.map((b) => b.count_active + b.count_resolved), 1);

  const totalActive = data.tiers.reduce((s, t) => s + t.count, 0);
  const totalResolved = data.histogram.reduce((s, b) => s + b.count_resolved, 0);
  const elevated = data.tiers.filter((t) => t.action === "escalate" || t.action === "verify").reduce((s, t) => s + t.count, 0);
  const elevatedPct = totalActive > 0 ? (elevated / totalActive) * 100 : 0;

  // Aggregate top signals across all tiers
  const signalCounts: Record<string, number> = {};
  data.tiers.forEach((t) => {
    Object.entries(t.top_signals).forEach(([sig, cnt]) => {
      signalCounts[sig] = (signalCounts[sig] ?? 0) + cnt;
    });
  });
  const topSignals = Object.entries(signalCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxSignal = topSignals[0]?.[1] ?? 1;

  // Peak risk band
  const peakBin = [...data.histogram].sort((a, b) => b.count_active - a.count_active)[0];

  return (
    <div
      data-tour="analytics-panel"
      className="absolute top-16 bottom-4 right-3 w-[460px] rounded-2xl bg-[rgba(18,22,36,0.82)] backdrop-blur-xl border border-white/[0.14] shadow-[0_20px_60px_rgba(0,0,0,0.55)] z-40 flex flex-col overflow-hidden"
      style={{ animation: closing ? "slide-out-right 0.2s ease-in forwards" : "slide-in-right 0.25s ease-out" }}
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-white/[0.08] flex justify-between items-center">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-violet-500/[0.12] border border-violet-400/25 flex items-center justify-center">
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-300">
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 4 4 5-5" />
            </svg>
          </div>
          <div>
            <div className="text-[13px] font-semibold text-slate-100 leading-tight">Analytics</div>
            <div className="text-[10px] font-mono text-slate-500 tracking-[0.12em] uppercase leading-tight mt-0.5">Risk distribution</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
        >
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin px-5 py-4 space-y-5">
        {/* Top-line summary */}
        <div className="grid grid-cols-3 gap-2">
          <SummaryStat label="Active" value={totalActive} tone="violet" />
          <SummaryStat label="Elevated" value={elevated} sub={`${elevatedPct.toFixed(0)}%`} tone="red" />
          <SummaryStat label="Resolved" value={totalResolved} tone="slate" />
        </div>

        {/* Tier cards */}
        <section>
          <SectionHead label="By action" />
          <div className="grid grid-cols-4 gap-1.5">
            {data.tiers.map((tier) => {
              const c = TIER_COLORS[tier.action] ?? TIER_COLORS.normal;
              const pct = totalActive > 0 ? (tier.count / totalActive) * 100 : 0;
              return (
                <div key={tier.action} className={`${c.bg} border ${c.border} rounded-lg p-2.5 text-center`}>
                  <div className={`text-[22px] font-bold font-mono tabular-nums tracking-[-0.02em] leading-none ${c.text}`}>
                    {tier.count}
                  </div>
                  <div className={`text-[9px] font-bold uppercase tracking-[0.12em] mt-1.5 ${c.text} opacity-80`}>
                    {tier.action}
                  </div>
                  <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                    {pct.toFixed(0)}%
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Top signals aggregated */}
        {topSignals.length > 0 && (
          <section>
            <SectionHead label="Top signals" sub={`${topSignals.length} of ${Object.keys(signalCounts).length}`} />
            <div className="space-y-1.5">
              {topSignals.map(([sig, cnt]) => {
                const pct = (cnt / maxSignal) * 100;
                return (
                  <div key={sig} className="flex items-center gap-2.5">
                    <span className="text-[11.5px] text-slate-300 font-medium w-[130px] truncate">
                      {sig.replace(/_/g, " ")}
                    </span>
                    <div className="flex-1 h-[5px] rounded-full bg-white/[0.05] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-400/80 to-cyan-400/80"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums w-6 text-right">
                      {cnt}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* MARSEC breakdown */}
        <section>
          <SectionHead label="Zone breakdown" />
          <div className="space-y-1.5">
            {data.tiers.map((tier) => {
              const c = TIER_COLORS[tier.action] ?? TIER_COLORS.normal;
              const pct = totalActive > 0 ? (tier.count / totalActive) * 100 : 0;
              return (
                <div key={tier.action} className="rounded-lg border border-white/[0.08] bg-white/[0.015] p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                      <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${c.text}`}>
                        {tier.action}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono tabular-nums">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[9.5px] text-slate-600 font-mono">{tier.avg_signals} sig/v</span>
                      <span className="font-mono font-bold text-slate-200 tabular-nums">{tier.count}</span>
                    </div>
                  </div>
                  <div className="w-full bg-white/[0.04] rounded-full h-1 mb-1.5">
                    <div className={`h-full rounded-full ${c.bar} transition-all`} style={{ width: `${Math.max(pct, 1)}%` }} />
                  </div>
                  {tier.count > 0 && Object.keys(tier.top_signals).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(tier.top_signals).slice(0, 3).map(([sig, cnt]) => (
                        <span key={sig} className={`text-[9px] px-1.5 py-[1px] rounded border font-mono ${c.bg} ${c.border} ${c.text}`}>
                          {sig.replace(/_/g, " ")} · {cnt}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Histogram */}
        <section>
          <SectionHead
            label="Score distribution"
            sub={peakBin ? `peak ${peakBin.bin_start}–${peakBin.bin_end}` : undefined}
          />
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.015] p-3.5">
            <div className="flex gap-2">
              <div className="flex flex-col justify-between h-[140px] text-[8px] text-slate-600 font-mono py-0.5 shrink-0 w-5 text-right">
                <span>{maxActive}</span>
                <span>{Math.round(maxActive / 2)}</span>
                <span>0</span>
              </div>
              <div className="flex-1 flex items-end h-[140px] gap-[2px]">
                {data.histogram.map((bin) => {
                  const total = bin.count_active + bin.count_resolved;
                  const binMid = (bin.bin_start + bin.bin_end) / 2;
                  const bc = binColor(binMid);
                  const activePct = bin.count_active > 0 ? Math.max((bin.count_active / maxActive) * 100, 3) : 0;
                  const totalPct = total > 0 ? Math.max((total / maxTotal) * 100, 3) : 0;
                  return (
                    <div key={bin.bin_start} className="flex-1 flex flex-col justify-end h-full group relative">
                      <div className="opacity-0 group-hover:opacity-100 absolute -top-9 left-1/2 -translate-x-1/2 bg-[rgba(18,22,36,0.95)] backdrop-blur text-slate-200 text-[9px] py-1 px-2 rounded-md whitespace-nowrap z-50 pointer-events-none transition-opacity shadow-xl border border-white/[0.14]">
                        <span className="font-mono font-semibold">{bin.bin_start}–{bin.bin_end}</span>
                        <span className="text-slate-500 mx-1">·</span>
                        <span className="font-mono">{bin.count_active}a / {bin.count_resolved}r</span>
                      </div>
                      <div className="w-full relative h-full flex flex-col justify-end">
                        {bin.count_resolved > 0 && (
                          <div
                            className="absolute bottom-0 left-0 right-0 border border-white/[0.08] rounded-t-sm bg-white/[0.03]"
                            style={{ height: `${totalPct}%` }}
                          />
                        )}
                        {bin.count_active > 0 ? (
                          <div
                            className={`w-full ${bc} opacity-90 rounded-t-sm relative z-10`}
                            style={{ height: `${activePct}%` }}
                          />
                        ) : total > 0 ? (
                          <div
                            className="w-full bg-white/[0.05] rounded-t-sm"
                            style={{ height: `${totalPct}%` }}
                          />
                        ) : (
                          <div className="w-full h-[1px] bg-white/[0.04] rounded-full" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 mt-2">
              <div className="w-5 shrink-0" />
              <div className="flex-1 flex justify-between text-[8px] text-slate-600 font-mono border-t border-white/[0.06] pt-1">
                <span>0</span>
                <span>35</span>
                <span>60</span>
                <span>80</span>
                <span>100</span>
              </div>
            </div>

            <div className="flex gap-2 mt-2">
              <div className="w-5 shrink-0" />
              <div className="flex-1 flex h-1 rounded-full overflow-hidden">
                <div className="bg-emerald-400/40" style={{ width: "35%" }} />
                <div className="bg-yellow-400/40" style={{ width: "25%" }} />
                <div className="bg-amber-400/40" style={{ width: "20%" }} />
                <div className="bg-red-400/40" style={{ width: "20%" }} />
              </div>
            </div>

            <div className="flex justify-center flex-wrap gap-x-3 gap-y-1.5 mt-3 pt-3 border-t border-white/[0.06]">
              <LegendDot color="bg-emerald-400" label="Normal" />
              <LegendDot color="bg-yellow-400" label="Monitor" />
              <LegendDot color="bg-amber-400" label="Verify" />
              <LegendDot color="bg-red-400" label="Escalate" />
              <LegendDot color="bg-white/[0.08] border border-white/[0.14]" label="Resolved" />
            </div>
          </div>
        </section>

        <div className="text-[11px] text-slate-400 leading-[1.55] bg-violet-500/[0.04] p-3 rounded-lg border border-violet-400/15">
          <strong className="text-violet-300 font-semibold block mb-1 text-[10.5px] uppercase tracking-[0.12em]">Captain&apos;s Note</strong>
          Scores represent algorithm convergence, not threat probability. Most alerts are <strong className="text-slate-200">Monitor</strong> items from normal port friction. Only <strong className="text-amber-300">Verify</strong> and <strong className="text-red-300">Escalate</strong> targets (60+) warrant asset dispatch.
        </div>
      </div>
    </div>
  );
}

function SectionHead({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.18em]">
        {label}
      </h3>
      {sub && <span className="text-[9.5px] text-slate-600 font-mono tabular-nums">{sub}</span>}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone: "violet" | "red" | "slate";
}) {
  const toneMap = {
    violet: "text-violet-200 border-violet-400/20 bg-violet-500/[0.06]",
    red: "text-red-200 border-red-400/20 bg-red-500/[0.06]",
    slate: "text-slate-200 border-white/[0.08] bg-white/[0.02]",
  };
  return (
    <div className={`rounded-lg border ${toneMap[tone]} p-2.5`}>
      <div className="flex items-baseline justify-between">
        <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-[0.14em]">{label}</div>
        {sub && <div className="text-[9.5px] font-mono text-slate-500 tabular-nums">{sub}</div>}
      </div>
      <div className="text-[22px] font-bold font-mono tabular-nums tracking-[-0.02em] leading-none mt-1.5">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-sm ${color}`} />
      <span className="text-[9.5px] text-slate-500">{label}</span>
    </div>
  );
}
