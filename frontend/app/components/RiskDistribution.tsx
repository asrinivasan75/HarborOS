"use client";

import { RiskDistribution } from "@/app/lib/api";
import { riskTextClass, riskBgClass } from "@/app/lib/risk";

interface Props {
  data: RiskDistribution | null;
  onClose: () => void;
  closing?: boolean;
}

export default function RiskDistributionPanel({ data, onClose, closing }: Props) {
  if (!data) return null;

  // Find max count for histogram scaling
  const maxBinCount = Math.max(
    ...data.histogram.map((b) => b.count_active + b.count_resolved),
    1
  );

  return (
    <div
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

      <div className="flex-1 overflow-y-auto p-5 space-y-8">
        {/* MARSEC Tiers */}
        <section>
          <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Active Alerts by MARSEC Zone
          </h3>
          <div className="space-y-3">
            {data.tiers.map((tier) => {
              // Convert action string back to pseudo-score to reuse risk colors
              const pseudoScore =
                tier.action === "escalate" ? 80 :
                tier.action === "verify" ? 60 :
                tier.action === "monitor" ? 30 : 0;
                
              const textColor = pseudoScore ? riskTextClass(pseudoScore) : "text-slate-400";
              const bgColor = pseudoScore ? riskBgClass(pseudoScore) : "bg-slate-500/10";
              const borderColor = pseudoScore ? "border-slate-800" : "border-slate-800"; // Generic border

              return (
                <div key={tier.action} className="bg-[#111827] border border-[#1a2235] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${bgColor} ${textColor} ${borderColor}`}>
                      {tier.action.toUpperCase()}
                    </span>
                    <span className="text-lg font-mono font-bold text-slate-200">
                      {tier.count}
                    </span>
                  </div>
                  {tier.count > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#1a2235] border-dashed">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] text-slate-500">Avg Signals/Vessel:</span>
                        <span className="text-[11px] text-slate-300 font-mono">{tier.avg_signals}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {Object.entries(tier.top_signals).map(([sig, cnt]) => (
                          <span key={sig} className="text-[9px] px-1.5 py-0.5 rounded bg-[#1a2235] text-slate-400">
                            {sig.replace("_", " ")} ({cnt})
                          </span>
                        ))}
                      </div>
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
            Global Score Histogram (All Time)
          </h3>
          <div className="bg-[#111827] border border-[#1a2235] rounded-lg p-4 h-64 flex flex-col justify-end relative mt-6">
            <div className="flex justify-between items-end h-[180px] gap-1 relative z-10 w-full">
              {data.histogram.map((bin) => {
                const total = bin.count_active + bin.count_resolved;
                const totalHeight = `${Math.max((total / maxBinCount) * 100, 1)}%`;
                
                const activeHeight = bin.count_active > 0 
                  ? `${(bin.count_active / total) * 100}%` 
                  : "0%";
                  
                const binMid = (bin.bin_start + bin.bin_end) / 2;
                const isRisk = binMid >= 50;

                // Only render bins with > 0 total so we don't have invisible 1% slivers unnecessarily 
                // unless we want continuous axis. A 1% height is okay for continuous.
                
                return (
                  <div key={bin.bin_start} className="flex-1 flex flex-col justify-end h-[100%] group relative">
                    {/* Tooltip */}
                    <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-slate-200 text-[9px] py-1 px-2 rounded whitespace-nowrap z-50 pointer-events-none transition-opacity shadow-lg border border-slate-700">
                      {bin.bin_start}–{bin.bin_end}: {bin.count_active} active, {bin.count_resolved} resolved
                    </div>
                    
                    {total > 0 && (
                      <div 
                        className="w-full relative rounded-sm flex flex-col justify-end overflow-hidden"
                        style={{ height: totalHeight }}
                      >
                        {/* Resolved bar (dim background) */}
                        <div className="absolute inset-0 bg-slate-700/30 rounded-sm" />
                        
                        {/* Active bar (colored foreground) */}
                        <div 
                          className={`w-full relative z-10 ${isRisk ? 'bg-orange-500/80' : 'bg-blue-500/60'} rounded-sm`}
                          style={{ height: activeHeight }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* X-axis labels */}
            <div className="flex justify-between text-[9px] text-slate-500 mt-2 font-mono border-t border-[#1a2235] pt-1">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100</span>
            </div>
          </div>
          <div className="flex justify-center flex-wrap gap-4 mt-4">
             <div className="flex items-center gap-1.5">
               <div className="w-2 h-2 rounded-sm bg-blue-500/60" />
               <span className="text-[10px] text-slate-400">Active (Monitor)</span>
             </div>
             <div className="flex items-center gap-1.5">
               <div className="w-2 h-2 rounded-sm bg-orange-500/80" />
               <span className="text-[10px] text-slate-400">Active (Verify/Escalate)</span>
             </div>
             <div className="flex items-center gap-1.5">
               <div className="w-2 h-2 rounded-sm bg-slate-700/30" />
               <span className="text-[10px] text-slate-400">Resolved</span>
             </div>
          </div>
        </section>
        
        <div className="text-[10px] text-slate-500 leading-relaxed bg-blue-500/5 p-3 rounded-lg border border-blue-500/10 mt-6">
          <strong className="text-blue-400 font-semibold block mb-1">Captain&apos;s Note</strong>
          Risk scores represent algorithm convergence, not threat probability. Over 95% of alerts are minor <strong>MONITOR</strong> items representing normal port friction. Only <strong>VERIFY</strong> and <strong>ESCALATE</strong> targets (scores 50+) require active asset dispatch.
        </div>
      </div>
    </div>
  );
}
