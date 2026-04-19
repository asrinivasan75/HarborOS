"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { api } from "@/app/lib/api";
import type { Region } from "@/app/lib/api";

interface RegionStats {
  vesselCount: number;
  escalationCount: number;
  alertDensity: number;
}

interface RegionSummaryProps {
  regions: Record<string, Region>;
  activeRegion: string | null;
  onSelectRegion: (key: string | null) => void;
}

const REGION_ABBREV: Record<string, string> = {
  la_harbor: "LA Harbor",
  taiwan_strait: "Taiwan Strait",
  south_china_sea: "S. China Sea",
  east_china_sea: "E. China Sea",
  strait_of_malacca: "Malacca",
  strait_of_hormuz: "Hormuz",
  persian_gulf: "Persian Gulf",
  gulf_of_aden: "Aden",
  black_sea: "Black Sea",
  sea_of_azov: "Azov",
  baltic_sea: "Baltic",
  english_channel: "English Ch.",
  eastern_med: "E. Med",
  mediterranean: "Med.",
  red_sea: "Red Sea",
  horn_of_africa: "Horn of Africa",
};

function abbreviate(key: string, name: string): string {
  if (REGION_ABBREV[key]) return REGION_ABBREV[key];
  if (name.length > 14) return name.split(/[\s_-]/)[0];
  return name;
}

export default function RegionSummary({ regions, activeRegion, onSelectRegion }: RegionSummaryProps) {
  const [stats, setStats] = useState<Record<string, RegionStats>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    const regionKeys = Object.keys(regions);
    if (regionKeys.length === 0) return;

    try {
      const results = await Promise.all(
        regionKeys.map(async (key) => {
          const [vessels, alerts] = await Promise.all([
            api.getVessels(key, 1, 0),
            api.getAlerts("active", key, 1, 0),
          ]);
          const vesselCount = vessels.total;
          const escalationCount = alerts.total;
          const alertDensity = vesselCount > 0 ? escalationCount / vesselCount : 0;
          return { key, vesselCount, escalationCount, alertDensity };
        })
      );

      const newStats: Record<string, RegionStats> = {};
      for (const r of results) {
        newStats[r.key] = {
          vesselCount: r.vesselCount,
          escalationCount: r.escalationCount,
          alertDensity: r.alertDensity,
        };
      }
      setStats(newStats);
    } catch {
      // Silently fail
    }
  }, [regions]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void fetchStats(), 0);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => void fetchStats(), 30000);
    return () => {
      clearTimeout(timeoutId);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStats]);

  const regionKeys = Object.keys(regions);
  if (regionKeys.length === 0) return null;

  // Sum across regions for "Global"
  const globalVessels = Object.values(stats).reduce((sum, s) => sum + s.vesselCount, 0);
  const globalEscalations = Object.values(stats).reduce((sum, s) => sum + s.escalationCount, 0);

  return (
    <div
      className="shrink-0 flex items-stretch gap-0 px-5 border-b border-white/[0.06] bg-[rgba(10,12,22,0.35)] backdrop-blur-xl overflow-x-auto scroll-thin"
      data-tour="regions"
    >
      <RegionTab
        active={activeRegion === null}
        onClick={() => onSelectRegion(null)}
        label="Global"
        vesselCount={globalVessels || null}
        escalationCount={globalEscalations}
      />
      <div className="w-px bg-white/[0.06] my-2" />
      {regionKeys.map((key) => {
        const region = regions[key];
        const stat = stats[key];
        const isActive = activeRegion === key;
        const label = abbreviate(key, region.name);

        return (
          <RegionTab
            key={key}
            active={isActive}
            onClick={() => onSelectRegion(key)}
            label={label}
            vesselCount={stat?.vesselCount ?? null}
            escalationCount={stat?.escalationCount ?? 0}
          />
        );
      })}
    </div>
  );
}

function RegionTab({
  active,
  onClick,
  label,
  vesselCount,
  escalationCount,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  vesselCount: number | null;
  escalationCount: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative shrink-0 px-4 py-2.5 transition-all ${
        active ? "text-slate-100" : "text-slate-400 hover:text-slate-200"
      }`}
    >
      <div className="flex items-baseline gap-2 whitespace-nowrap">
        <span className={`text-[13px] font-semibold tracking-tight ${active ? "text-slate-50" : ""}`}>
          {label}
        </span>
        {escalationCount > 0 && (
          <span
            className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold font-mono tabular-nums border ${
              escalationCount >= 5
                ? "bg-red-400/15 text-red-300 border-red-400/30"
                : "bg-amber-400/12 text-amber-300 border-amber-400/25"
            }`}
          >
            {escalationCount}
          </span>
        )}
      </div>
      <div className="font-mono text-[10px] text-slate-500 tabular-nums text-left mt-0.5">
        {vesselCount != null ? `${vesselCount.toLocaleString()} vessels` : "…"}
      </div>
      {active && (
        <span className="absolute left-4 right-4 -bottom-px h-[2px] bg-gradient-to-r from-violet-400 to-cyan-400 rounded-full" />
      )}
    </button>
  );
}
