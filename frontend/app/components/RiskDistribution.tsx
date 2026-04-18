"use client";

import { RiskDistribution } from "@/app/lib/api";

interface Props {
  data: RiskDistribution | null;
  onClose: () => void;
  closing?: boolean;
}

export default function RiskDistributionPanel({ data, onClose, closing }: Props) {
  if (!data) return null;

  // Scale to active counts so colors are prominent; resolved shown as faint outline
  const maxActiveCount = Math.max(
    ...data.histogram.map((b) => b.count_active),
    1
  );
  const maxTotalCount = Math.max(
    ...data.histogram.map((b) => b.count_active + b.count_resolved),
    1
  );

  const totalActive = data.tiers.reduce((s, t) => s + t.count, 0);

  function binColor(binMid: number): { active: string; hex: string } {
    if (binMid >= 80) return { active: "bg-red-500", hex: "#ef4444" };
    if (binMid >= 60) return { active: "bg-orange-500", hex: "#f97316" };
    if (binMid >= 35) return { active: "bg-yellow-500", hex: "#f59e0b" };
    return { active: "bg-green-500", hex: "#22c55e" };
  }

  return (
    <div
      data-tour="analytics-panel"
      className="absolute inset-y-0 right-0 w-[400px] bg-[#0d1320]/95 backdrop-blur-md border-l border-[#1a2235] shadow-2xl shadow-black/50 z-50 flex flex-col"
      style={{ animation: closing ? "slide-out-right 0.2s ease-in forwards" : "slide-in-right 0.25s ease-out" }}
    >
      <div className="px-5 py-4 border-b border-[#1a2235] flex justify-between items-center bg-[#111827]">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
          Risk Distribution
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-[#1a2235] rounded-md transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-2">
          {data.tiers.map((tier) => {
            const colors: Record<string, { text: string; bg: string; border: string }> = {
              escalate: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
              verify: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
              monitor: { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
              normal: { text: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20" },
            };
            const c = colors[tier.action] ?? colors.normal;
            return (
              <div key={tier.action} className={`${c.bg} border ${c.border} rounded-lg p-3 text-center`}>
                <span className={`text-xl font-bold font-mono ${c.text}`}>{tier.count}</span>
                <span className={`text-[8px] font-bold uppercase tracking-widest block mt-1 ${c.text} opacity-70`}>
                  {tier.action}
                </span>
              </div>
            );
          })}
        </div>

        {/* MARSEC Tiers Detail */}
        <section>
          <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
            MARSEC Zone Breakdown
          </h3>
          <div className="space-y-2">
            {data.tiers.map((tier) => {
              const colors: Record<string, { text: string; bar: string }> = {
                escalate: { text: "text-red-400", bar: "bg-red-400" },
                verify: { text: "text-orange-400", bar: "bg-orange-400" },
                monitor: { text: "text-yellow-400", bar: "bg-yellow-400" },
                normal: { text: "text-green-400", bar: "bg-green-400" },
              };
              const c = colors[tier.action] ?? colors.normal;
              const pct = totalActive > 0 ? (tier.count / totalActive) * 100 : 0;

              return (
                <div key={tier.action} className="bg-[#111827] border border-[#1a2235] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${c.text}`}>
                        {tier.action}
                      </span>
                      <span className="text-[9px] text-slate-600 font-mono">{pct.toFixed(0)}%</span>
                    </div>
                    <span className="text-sm font-mono font-bold text-slate-200">{tier.count}</span>
                  </div>
                  <div className="w-full bg-[#0d1320] rounded-full h-1.5 mb-2">
                    <div className={`h-full rounded-full ${c.bar} transition-all`} style={{ width: `${Math.max(pct, 1)}%` }} />
                  </div>
                  {tier.count > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(tier.top_signals).map(([sig, cnt]) => (
                          <span key={sig} className="text-[8px] px-1.5 py-0.5 rounded bg-[#0d1320] text-slate-500 font-mono">
                            {sig.replace(/_/g, " ")} ({cnt})
                          </span>
                        ))}
                      </div>
                      <span className="text-[9px] text-slate-600 font-mono shrink-0 ml-2">{tier.avg_signals} sig/v</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Global Score Histogram */}
        <section>
          <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Score Distribution
          </h3>
          <div className="bg-[#111827] border border-[#1a2235] rounded-lg p-4">
            {/* Y-axis + bars */}
            <div className="flex gap-2">
              {/* Y-axis labels */}
              <div className="flex flex-col justify-between h-[160px] text-[8px] text-slate-600 font-mono py-0.5 shrink-0 w-5 text-right">
                <span>{maxActiveCount}</span>
                <span>{Math.round(maxActiveCount / 2)}</span>
                <span>0</span>
              </div>
              {/* Bars */}
              <div className="flex-1 flex items-end h-[160px] gap-[2px]">
                {data.histogram.map((bin) => {
                  const total = bin.count_active + bin.count_resolved;
                  const binMid = (bin.bin_start + bin.bin_end) / 2;
                  const bc = binColor(binMid);
                  // Active bar scaled to active max — always prominent
                  const activePct = bin.count_active > 0 ? Math.max((bin.count_active / maxActiveCount) * 100, 3) : 0;
                  // Resolved shown as a faint outline behind, scaled to total max
                  const totalPct = total > 0 ? Math.max((total / maxTotalCount) * 100, 3) : 0;

                  return (
                    <div key={bin.bin_start} className="flex-1 flex flex-col justify-end h-full group relative">
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 absolute -top-10 left-1/2 -translate-x-1/2 bg-[#0d1320] text-slate-200 text-[9px] py-1.5 px-2.5 rounded-md whitespace-nowrap z-50 pointer-events-none transition-opacity shadow-xl border border-[#1a2235]">
                        <span className="font-mono font-bold">{bin.bin_start}–{bin.bin_end}</span>
                        <span className="text-slate-500 mx-1">|</span>
                        {bin.count_active} active, {bin.count_resolved} resolved
                      </div>

                      <div className="w-full relative h-full flex flex-col justify-end">
                        {/* Resolved outline bar (faint, behind) */}
                        {bin.count_resolved > 0 && (
                          <div
                            className="absolute bottom-0 left-0 right-0 border border-slate-700/50 rounded-t-sm bg-slate-800/20"
                            style={{ height: `${totalPct}%` }}
                          />
                        )}
                        {/* Active bar (full color, in front) */}
                        {bin.count_active > 0 ? (
                          <div
                            className={`w-full ${bc.active} opacity-90 rounded-t-sm relative z-10`}
                            style={{ height: `${activePct}%` }}
                          />
                        ) : total > 0 ? (
                          <div
                            className="w-full bg-slate-700/30 rounded-t-sm"
                            style={{ height: `${totalPct}%` }}
                          />
                        ) : (
                          <div className="w-full h-[1px] bg-[#1a2235] rounded-full" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* X-axis */}
            <div className="flex gap-2 mt-2">
              <div className="w-5 shrink-0" />
              <div className="flex-1 flex justify-between text-[8px] text-slate-600 font-mono border-t border-[#1a2235] pt-1">
                <span>0</span>
                <span>35</span>
                <span>60</span>
                <span>80</span>
                <span>100</span>
              </div>
            </div>

            {/* MARSEC zone indicators */}
            <div className="flex gap-2 mt-2">
              <div className="w-5 shrink-0" />
              <div className="flex-1 flex h-1.5 rounded-full overflow-hidden">
                <div className="bg-green-500/30" style={{ width: "35%" }} />
                <div className="bg-yellow-500/30" style={{ width: "25%" }} />
                <div className="bg-orange-500/30" style={{ width: "20%" }} />
                <div className="bg-red-500/30" style={{ width: "20%" }} />
              </div>
            </div>

            {/* Legend */}
            <div className="flex justify-center flex-wrap gap-3 mt-4 pt-3 border-t border-[#1a2235]">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-green-500/80" />
                <span className="text-[9px] text-slate-500">Normal</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-yellow-500/80" />
                <span className="text-[9px] text-slate-500">Monitor</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-orange-500/80" />
                <span className="text-[9px] text-slate-500">Verify</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-red-500/80" />
                <span className="text-[9px] text-slate-500">Escalate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-slate-700/40" />
                <span className="text-[9px] text-slate-500">Resolved</span>
              </div>
            </div>
          </div>
        </section>

        <div className="text-[10px] text-slate-500 leading-relaxed bg-blue-500/5 p-3 rounded-lg border border-blue-500/10">
          <strong className="text-blue-400 font-semibold block mb-1">Captain&apos;s Note</strong>
          Risk scores represent algorithm convergence, not threat probability. Over 95% of alerts are minor <strong>MONITOR</strong> items representing normal port friction. Only <strong>VERIFY</strong> and <strong>ESCALATE</strong> targets (scores 60+) require active asset dispatch.
        </div>
      </div>
    </div>
  );
}
