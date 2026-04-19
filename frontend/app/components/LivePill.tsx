"use client";

import { useEffect, useState } from "react";
import { api } from "@/app/lib/api";

export default function LivePill() {
  const [count, setCount] = useState<number | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const status = await api.getIngestionStatus();
        if (cancelled) return;
        setLive(!!(status.running && status.connected));
        setCount(status.positions_ingested);
      } catch {
        if (!cancelled) setLive(false);
      }
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const dotTone = live ? "bg-emerald-400" : "bg-amber-400";
  const textTone = live ? "text-emerald-300" : "text-amber-300";

  return (
    <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[11px] font-mono">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotTone}`} style={{ animation: "subtle-pulse 2.4s infinite" }} />
      <span className={textTone}>
        {live ? "Live" : "Scenario"}
        {count != null ? ` · ${count.toLocaleString()}` : ""}
      </span>
    </div>
  );
}
