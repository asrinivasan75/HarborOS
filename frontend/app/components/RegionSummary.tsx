"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { api } from "@/app/lib/api";
import type { Region } from "@/app/lib/api";

interface RegionStats {
  vesselCount: number;
  escalationCount: number;
  alertDensity: number; // 0-1 ratio of active alerts to vessels
}

interface RegionSummaryProps {
  regions: Record<string, Region>;
  activeRegion: string | null;
  onSelectRegion: (key: string | null) => void;
}

const REGION_ABBREV: Record<string, string> = {
  taiwan_strait: "Taiwan",
  south_china_sea: "S. China Sea",
  east_china_sea: "E. China Sea",
  strait_of_malacca: "Malacca",
  persian_gulf: "Persian Gulf",
  gulf_of_aden: "Gulf of Aden",
  black_sea: "Black Sea",
  baltic_sea: "Baltic",
  english_channel: "English Ch.",
  mediterranean: "Mediterranean",
  red_sea: "Red Sea",
  horn_of_africa: "Horn of Africa",
};

function abbreviate(key: string, name: string): string {
  if (REGION_ABBREV[key]) return REGION_ABBREV[key];
  // Fallback: take the first word if name is long
  if (name.length > 12) return name.split(/[\s_-]/)[0];
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
            api.getVessels(key, 1, 0), // just need total count
            api.getAlerts("active", key, 1, 0), // just need total count
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
      // Silently fail — stats are non-critical
    }
  }, [regions]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void fetchStats();
    }, 0);

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      void fetchStats();
    }, 30000);

    return () => {
      clearTimeout(timeoutId);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStats]);

  const regionKeys = Object.keys(regions);
  if (regionKeys.length === 0) return null;

  return (
    <div className="flex-shrink-0 px-2 py-1.5 overflow-x-auto scroll-thin">
      <div className="flex gap-1.5">
        <button
          onClick={() => onSelectRegion(null)}
          className={`
            flex-shrink-0 px-2.5 py-1.5 rounded border text-left transition-all
            bg-[#111827] hover:bg-[#151d2e]
            ${activeRegion === null ? "border-blue-500/30" : "border-[#1a2235]"}
          `}
        >
          <div className="text-[10px] font-medium text-slate-200">Global</div>
        </button>
        {regionKeys.map((key) => {
          const region = regions[key];
          const stat = stats[key];
          const isActive = activeRegion === key;
          const label = abbreviate(key, region.name);

          return (
            <button
              key={key}
              onClick={() => onSelectRegion(key)}
              className={`
                flex-shrink-0 px-2.5 py-1.5 rounded border text-left transition-all
                bg-[#111827] hover:bg-[#151d2e]
                ${isActive ? "border-blue-500/30" : "border-[#1a2235]"}
              `}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-slate-200 truncate max-w-[80px]">
                  {label}
                </span>
                {stat && stat.escalationCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[14px] h-[12px] px-0.5 rounded-full bg-red-500/20 text-red-400 text-[8px] font-semibold">
                    {stat.escalationCount}
                  </span>
                )}
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5">
                {stat?.vesselCount ?? "..."} vessels
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
