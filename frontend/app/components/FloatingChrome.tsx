"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { Region } from "@/app/lib/api";

interface FloatingChromeProps {
  regions: Record<string, Region>;
  activeRegion: string | null;
  onSelectRegion: (key: string | null) => void;
  alertCount: number;
  isLive: boolean;
  connectionOk: boolean;
  onToggleAnalytics: () => void;
  analyticsOpen: boolean;
  onOpenCommandPalette: () => void;
}

const REGION_ABBREV: Record<string, string> = {
  la_harbor: "LA Harbor",
  taiwan_strait: "Taiwan Strait",
  south_china_sea: "S. China Sea",
  strait_of_malacca: "Malacca",
  strait_of_hormuz: "Hormuz",
  black_sea: "Black Sea",
  sea_of_azov: "Azov",
  english_channel: "English Ch.",
  eastern_med: "E. Med",
};

function shortName(key: string, name: string): string {
  return REGION_ABBREV[key] ?? (name.length > 16 ? name.split(/[\s_-]/)[0] : name);
}

export default function FloatingChrome({
  regions,
  activeRegion,
  onSelectRegion,
  alertCount,
  isLive,
  connectionOk,
  onToggleAnalytics,
  analyticsOpen,
  onOpenCommandPalette,
}: FloatingChromeProps) {
  const [regionOpen, setRegionOpen] = useState(false);
  const regionMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!regionOpen) return;
    const handler = (e: MouseEvent) => {
      if (regionMenuRef.current && !regionMenuRef.current.contains(e.target as Node)) {
        setRegionOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [regionOpen]);

  const activeLabel = activeRegion
    ? shortName(activeRegion, regions[activeRegion]?.name ?? activeRegion)
    : "Global";

  return (
    <div className="absolute top-3 left-3 right-3 z-30 flex items-center gap-2 pointer-events-none">
      {/* Logo pill */}
      <Link
        href="/"
        className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(18,22,36,0.82)] backdrop-blur-xl border border-white/[0.14] hover:bg-[rgba(18,22,36,0.9)] transition-colors"
      >
        <div className="relative w-5 h-5 rounded-md bg-gradient-to-br from-violet-400 to-cyan-400">
          <div className="absolute inset-[1.5px] rounded-[4px] bg-gradient-to-br from-[#1a1230] to-[#0d1a2a]" />
        </div>
        <span className="text-[13px] font-semibold tracking-tight text-slate-100">HarborOS</span>
      </Link>

      {/* Sector pill */}
      <div ref={regionMenuRef} className="pointer-events-auto relative">
        <button
          onClick={() => setRegionOpen((v) => !v)}
          data-tour="regions"
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(18,22,36,0.82)] backdrop-blur-xl border transition-colors text-[13px] ${
            regionOpen ? "border-violet-400/40" : "border-white/[0.14] hover:border-white/[0.22]"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span className="font-semibold text-slate-100">{activeLabel}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={`text-slate-500 transition-transform ${regionOpen ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {regionOpen && (
          <div className="absolute top-[calc(100%+6px)] left-0 min-w-[240px] p-1.5 rounded-xl bg-[rgba(18,22,36,0.95)] backdrop-blur-2xl border border-white/[0.14] shadow-[0_20px_48px_rgba(0,0,0,0.5)]">
            <RegionItem
              name="Global"
              active={activeRegion === null}
              onClick={() => { onSelectRegion(null); setRegionOpen(false); }}
            />
            <div className="h-px bg-white/[0.06] my-1" />
            {Object.keys(regions).map((key) => (
              <RegionItem
                key={key}
                name={shortName(key, regions[key].name)}
                active={activeRegion === key}
                onClick={() => { onSelectRegion(key); setRegionOpen(false); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Command palette hint pill */}
      <button
        onClick={onOpenCommandPalette}
        className="pointer-events-auto flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-[rgba(18,22,36,0.82)] backdrop-blur-xl border border-white/[0.14] hover:bg-[rgba(18,22,36,0.9)] hover:border-white/[0.22] transition-colors text-[12.5px] text-slate-400"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span>Search, switch, summon</span>
        <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-slate-400">⌘K</kbd>
      </button>

      <div className="flex-1" />

      {/* Alert count pill */}
      <button
        onClick={onOpenCommandPalette}
        className={`pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-xl border transition-colors text-[12px] font-mono font-semibold tabular-nums ${
          alertCount > 0
            ? "bg-red-500/[0.08] border-red-400/25 text-red-300 hover:bg-red-500/[0.12]"
            : "bg-[rgba(18,22,36,0.82)] border-white/[0.14] text-slate-400"
        }`}
      >
        {alertCount} active
      </button>

      {/* Analytics button */}
      <button
        data-tour="analytics-btn"
        onClick={onToggleAnalytics}
        className={`pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-xl border transition-colors text-[12.5px] ${
          analyticsOpen
            ? "bg-violet-500/[0.12] border-violet-400/35 text-violet-200"
            : "bg-[rgba(18,22,36,0.82)] border-white/[0.14] text-slate-300 hover:border-white/[0.22]"
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="M7 14l4-4 4 4 5-5" />
        </svg>
        Analytics
      </button>

      {/* Live status */}
      {!connectionOk ? (
        <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/[0.08] backdrop-blur-xl border border-red-400/25">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" style={{ animation: "subtle-pulse 1.4s infinite" }} />
          <span className="font-mono text-[10px] font-semibold text-red-300 tracking-[0.14em]">OFFLINE</span>
        </div>
      ) : isLive ? (
        <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/[0.06] backdrop-blur-xl border border-emerald-400/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: "subtle-pulse 2.4s infinite" }} />
          <span className="font-mono text-[10px] font-semibold text-emerald-300 tracking-[0.14em]">LIVE</span>
        </div>
      ) : (
        <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/[0.06] backdrop-blur-xl border border-amber-400/20">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="font-mono text-[10px] font-semibold text-amber-300 tracking-[0.14em]">SCENARIO</span>
        </div>
      )}
    </div>
  );
}

function RegionItem({ name, active, onClick }: { name: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[12.5px] transition-colors ${
        active ? "bg-white/[0.06] text-slate-100" : "text-slate-300 hover:bg-white/[0.03]"
      }`}
    >
      <span className="font-medium">{name}</span>
      {active && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-violet-300">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </button>
  );
}
