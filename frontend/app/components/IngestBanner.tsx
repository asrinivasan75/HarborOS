"use client";

interface IngestBannerProps {
  vesselCount: number;
  positionsIngested?: number;
  isLive: boolean;
  connectionOk: boolean;
}

const LOW_THRESHOLD = 20;

export default function IngestBanner({ vesselCount, positionsIngested, isLive, connectionOk }: IngestBannerProps) {
  if (!connectionOk) return null;
  if (vesselCount >= LOW_THRESHOLD) return null;

  const label = !isLive
    ? "Waiting for AIS stream…"
    : vesselCount === 0
    ? "Ingesting live AIS data…"
    : `Streaming live AIS · ${vesselCount} vessel${vesselCount === 1 ? "" : "s"} so far`;

  const sub = isLive && positionsIngested != null && positionsIngested > 0
    ? `${positionsIngested.toLocaleString()} positions processed`
    : "Vessels will appear as they broadcast their positions";

  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-[72px] z-20 pointer-events-none">
      <div className="flex items-center gap-3 pl-3 pr-4 py-2 rounded-full bg-[rgba(18,22,36,0.85)] backdrop-blur-xl border border-white/[0.14] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <span className="relative flex items-center justify-center w-5 h-5">
          <span className="absolute w-5 h-5 rounded-full bg-cyan-400/20" style={{ animation: "ring-pulse 2s infinite" }} />
          <span className="relative w-1.5 h-1.5 rounded-full bg-cyan-400" />
        </span>
        <div className="leading-tight">
          <div className="text-[12.5px] font-semibold text-slate-100">{label}</div>
          <div className="font-mono text-[10.5px] text-slate-400 tabular-nums mt-0.5">{sub}</div>
        </div>
      </div>
    </div>
  );
}
