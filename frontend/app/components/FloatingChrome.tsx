"use client";

import { useState, useRef, useEffect } from "react";
import type { Region } from "@/app/lib/api";
import { api } from "@/app/lib/api";
import Logomark from "@/app/components/Logomark";
import ReturnHome from "@/app/components/ReturnHome";

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
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState(false);
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

  // Lazy-fetch vessel counts per region when dropdown opens. Refresh every 30s while open.
  useEffect(() => {
    if (!regionOpen) return;
    const keys = Object.keys(regions);
    if (keys.length === 0) return;
    let cancelled = false;

    const fetchCounts = async () => {
      setCountsLoading(true);
      try {
        const results = await Promise.all(
          keys.map(async (key) => {
            try {
              const r = await api.getVessels(key, 1, 0);
              return [key, r.total] as const;
            } catch {
              return [key, 0] as const;
            }
          }),
        );
        if (cancelled) return;
        const next: Record<string, number> = {};
        for (const [k, n] of results) next[k] = n;
        setCounts(next);
      } finally {
        if (!cancelled) setCountsLoading(false);
      }
    };

    fetchCounts();
    const id = setInterval(fetchCounts, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [regionOpen, regions]);

  const totalCount = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const activeLabel = activeRegion
    ? shortName(activeRegion, regions[activeRegion]?.name ?? activeRegion)
    : "Global";

  return (
    <div className="absolute top-3 left-3 right-3 z-30 flex items-center gap-2 pointer-events-none">
      {/* Logo pill — returns to landing with exit animation */}
      <ReturnHome className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(18,22,36,0.82)] backdrop-blur-xl border border-white/[0.14] hover:bg-[rgba(18,22,36,0.9)] hover:border-white/[0.22] transition-colors text-slate-200">
        <Logomark size={18} animate />
        <span className="text-[13px] font-semibold tracking-tight text-slate-100">HarborOS</span>
      </ReturnHome>

      {/* Sector pill */}
      <div ref={regionMenuRef} className="pointer-events-auto relative">
        <button
          onClick={() => setRegionOpen((v) => !v)}
          data-tour="regions"
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(18,22,36,0.82)] backdrop-blur-xl border transition-colors text-[13px] ${
            regionOpen ? "border-violet-400/40" : "border-white/[0.14] hover:border-white/[0.22]"
          }`}
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span className="font-semibold text-slate-100">{activeLabel}</span>
          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={`text-slate-500 transition-transform ${regionOpen ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {regionOpen && (
          <div className="absolute top-[calc(100%+6px)] left-0 min-w-[260px] p-1.5 rounded-xl bg-[rgba(18,22,36,0.95)] backdrop-blur-2xl border border-white/[0.14] shadow-[0_20px_48px_rgba(0,0,0,0.5)]">
            <RegionItem
              name="Global"
              count={totalCount > 0 ? totalCount : null}
              loading={countsLoading && totalCount === 0}
              active={activeRegion === null}
              onClick={() => { onSelectRegion(null); setRegionOpen(false); }}
            />
            <div className="h-px bg-white/[0.06] my-1" />
            {Object.keys(regions).map((key) => (
              <RegionItem
                key={key}
                name={shortName(key, regions[key].name)}
                count={counts[key] ?? null}
                loading={countsLoading && counts[key] == null}
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
        <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
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
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

function RegionItem({
  name,
  count,
  loading,
  active,
  onClick,
}: {
  name: string;
  count: number | null;
  loading: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-[12.5px] transition-colors ${
        active ? "bg-white/[0.06] text-slate-100" : "text-slate-300 hover:bg-white/[0.03]"
      }`}
    >
      <span className="font-medium truncate">{name}</span>
      <span className="flex items-center gap-2 shrink-0">
        <span
          className={`font-mono text-[10.5px] tabular-nums px-1.5 py-0.5 rounded ${
            active
              ? "text-violet-200 bg-violet-500/[0.12] border border-violet-400/25"
              : "text-slate-500 group-hover:text-slate-300"
          }`}
        >
          {loading ? "…" : count != null ? count.toLocaleString() : "—"}
        </span>
        {active && (
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-violet-300">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </span>
    </button>
  );
}
