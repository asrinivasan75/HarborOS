"use client";

import { useEffect, useState } from "react";
import Logomark from "@/app/components/Logomark";
import type { IngestionStatus } from "@/app/lib/api";

interface IngestBannerProps {
  vesselCount: number;
  status: IngestionStatus | null;
  isLive: boolean;
  connectionOk: boolean;
}

const POPULATED_THRESHOLD = 20;

export default function IngestBanner({ vesselCount, status, isLive, connectionOk }: IngestBannerProps) {
  if (!connectionOk) return null;
  if (vesselCount >= POPULATED_THRESHOLD) return null;

  const positions = status?.positions_ingested ?? 0;
  const messages = status?.stream_stats?.messages_received ?? 0;
  const regions = status?.stream_stats?.regions?.length ?? 0;
  const connectedSince = status?.stream_stats?.connected_since ?? null;

  const headline = !isLive
    ? "Waiting for AIS stream"
    : vesselCount === 0
      ? "Receiving live AIS data"
      : "Streaming live AIS · building fleet";

  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-[64px] z-20 pointer-events-none w-[min(560px,92vw)]">
      <div className="relative rounded-2xl overflow-hidden border border-white/[0.16] bg-[rgba(14,18,32,0.9)] backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
        <div
          aria-hidden
          className="absolute inset-0 opacity-70 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 80% at 0% 50%, rgba(34,211,238,0.12), transparent 60%), radial-gradient(ellipse 50% 80% at 100% 50%, rgba(167,139,250,0.08), transparent 60%)",
          }}
        />
        <div aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-violet-400 via-cyan-400 to-pink-400" />

        <div className="relative flex items-center gap-4 px-5 py-3.5">
          <div className="w-11 h-11 rounded-xl border border-white/[0.12] bg-white/[0.03] flex items-center justify-center text-slate-300 shrink-0">
            <Logomark size={28} animate />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="relative flex items-center justify-center w-2 h-2">
                <span className="absolute w-2 h-2 rounded-full bg-cyan-400/40" style={{ animation: "ring-pulse 1.8s infinite" }} />
                <span className="relative w-1.5 h-1.5 rounded-full bg-cyan-400" />
              </span>
              <span className="text-[13.5px] font-semibold text-slate-100 truncate">{headline}</span>
              {isLive && (
                <span className="font-mono text-[9.5px] px-1.5 py-[1px] rounded bg-emerald-400/10 text-emerald-300 border border-emerald-400/20 tracking-[0.14em] uppercase">
                  Live
                </span>
              )}
            </div>

            <div className="mt-2 grid grid-cols-4 gap-4">
              <Stat label="Vessels" value={vesselCount.toLocaleString()} />
              <Stat label="Positions" value={positions.toLocaleString()} accent />
              <Stat label="Messages" value={messages.toLocaleString()} />
              <Stat label="Sectors" value={regions > 0 ? `${regions}` : "—"} />
            </div>

            <div className="mt-2.5 font-mono text-[10px] text-slate-500 tabular-nums tracking-[0.08em]">
              {connectedSince ? (
                <>CONNECTED · <Uptime since={connectedSince} /> · AISSTREAM</>
              ) : (
                "HANDSHAKE IN PROGRESS…"
              )}
            </div>
          </div>
        </div>

        {/* Animated scanner line */}
        <div aria-hidden className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/[0.04] overflow-hidden">
          <div
            className="h-full w-[30%] bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
            style={{ animation: "ingest-scan 2.4s ease-in-out infinite" }}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[9.5px] font-mono uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className={`font-mono text-[14px] font-semibold tabular-nums tracking-tight leading-none mt-1 ${accent ? "text-cyan-300" : "text-slate-100"}`}>
        {value}
      </div>
    </div>
  );
}

function Uptime({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const start = Date.parse(since);
  const secs = Number.isNaN(start) ? 0 : Math.max(0, Math.floor((now - start) / 1000));
  let text: string;
  if (secs < 60) text = `${secs}s`;
  else if (secs < 3600) text = `${Math.floor(secs / 60)}m ${secs % 60}s`;
  else {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    text = `${h}h ${m}m`;
  }
  return <>{text}</>;
}
