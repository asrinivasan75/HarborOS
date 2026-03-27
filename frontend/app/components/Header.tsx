"use client";

import type { Region } from "@/app/lib/api";

interface HeaderProps {
  alertCount: number;
  vesselCount: number;
  isLive: boolean;
  positionsIngested?: number;
  regions: Record<string, Region>;
  activeRegion: string | null;
  onRegionChange: (region: string | null) => void;
}

export default function Header({
  alertCount, vesselCount, isLive, positionsIngested,
  regions, activeRegion, onRegionChange,
}: HeaderProps) {
  return (
    <header className="h-14 bg-[#0d1320] border-b border-[#1a2235] flex items-center justify-between px-5 shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
              <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <h1 className="text-base font-semibold tracking-wide text-slate-100 leading-tight">
              HARBOR<span className="text-blue-400">OS</span>
            </h1>
            <span className="text-[7px] text-slate-500 uppercase tracking-[0.15em] leading-tight">
              Maritime Awareness
            </span>
          </div>
        </div>

        <div className="h-6 w-px bg-[#1a2235] mx-1" />

        <select
          value={activeRegion || "__all__"}
          onChange={(e) => onRegionChange(e.target.value === "__all__" ? null : e.target.value)}
          className="bg-[#111827] border border-[#1a2235] text-slate-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 cursor-pointer transition-colors hover:border-slate-600"
        >
          <option value="__all__">All Regions</option>
          {Object.entries(regions).map(([key, r]) => (
            <option key={key} value={key}>{r.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <Stat label="CONTACTS" value={vesselCount} />
        <Stat label="ALERTS" value={alertCount} alert={alertCount > 0} />
        {isLive && positionsIngested != null && (
          <Stat label="INGESTED" value={positionsIngested.toLocaleString()} />
        )}

        <div className="h-6 w-px bg-[#1a2235] mx-2" />

        {isLive ? (
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: "subtle-pulse 2s infinite" }} />
            <span className="text-[10px] font-semibold text-emerald-400 tracking-wider">LIVE</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[10px] font-semibold text-amber-400 tracking-wider">SCENARIO</span>
          </div>
        )}
      </div>
    </header>
  );
}

function Stat({ label, value, alert }: { label: string; value: number | string; alert?: boolean }) {
  return (
    <div className="flex items-center gap-2 bg-[#111827]/60 rounded-lg px-3 py-1.5">
      <span className="text-[9px] text-slate-500 font-medium tracking-wider">{label}</span>
      <span className={`text-xs font-mono font-semibold ${alert ? "text-red-400" : "text-slate-200"}`}>
        {value}
      </span>
    </div>
  );
}
