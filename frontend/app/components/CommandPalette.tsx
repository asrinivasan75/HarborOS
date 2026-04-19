"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { Alert, Vessel, Region } from "@/app/lib/api";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  alerts: Alert[];
  vessels: Vessel[];
  regions: Record<string, Region>;
  activeRegion: string | null;
  onSelectAlert: (alert: Alert) => void;
  onSelectRegion: (key: string | null) => void;
  onToggleAnalytics: () => void;
}

type Result =
  | { kind: "region"; key: string | null; label: string; badge?: string }
  | { kind: "alert"; alert: Alert }
  | { kind: "vessel"; vessel: Vessel }
  | { kind: "action"; label: string; run: () => void; shortcut?: string };

export default function CommandPalette({
  open, onClose, alerts, vessels, regions, activeRegion, onSelectAlert, onSelectRegion, onToggleAnalytics,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Result[] = [];

    // Actions
    const actions: Array<Extract<Result, { kind: "action" }>> = [
      { kind: "action", label: "Toggle analytics", run: onToggleAnalytics, shortcut: "A" },
      { kind: "action", label: "Show global view", run: () => onSelectRegion(null) },
    ];
    for (const a of actions) {
      if (!q || a.label.toLowerCase().includes(q)) out.push(a);
    }

    // Regions
    const regionEntries: Array<Extract<Result, { kind: "region" }>> = [
      { kind: "region", key: null, label: "Global" },
      ...Object.keys(regions).map((key) => ({ kind: "region" as const, key, label: regions[key].name })),
    ];
    for (const r of regionEntries) {
      if (r.key === activeRegion) continue;
      if (!q || r.label.toLowerCase().includes(q)) out.push(r);
    }

    // Alerts
    for (const a of alerts) {
      const name = (a.vessel_name || "").toLowerCase();
      const mmsi = (a.vessel_mmsi || "").toLowerCase();
      const signalsMatch = a.anomaly_signals.some((s) => s.anomaly_type.replace(/_/g, " ").toLowerCase().includes(q));
      if (!q || name.includes(q) || mmsi.includes(q) || signalsMatch || a.recommended_action.toLowerCase().includes(q)) {
        out.push({ kind: "alert", alert: a });
      }
      if (out.length > 40) break;
    }

    // Vessels (only when query exists, to avoid overwhelming)
    if (q && out.length < 30) {
      for (const v of vessels) {
        const name = (v.name || "").toLowerCase();
        const mmsi = (v.mmsi || "").toLowerCase();
        if (name.includes(q) || mmsi.includes(q)) {
          out.push({ kind: "vessel", vessel: v });
        }
        if (out.length > 40) break;
      }
    }

    return out.slice(0, 40);
  }, [query, alerts, vessels, regions, activeRegion, onSelectRegion, onToggleAnalytics]);

  useEffect(() => {
    if (selected >= results.length) setSelected(Math.max(0, results.length - 1));
  }, [results.length, selected]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
      if (e.key === "Enter") { e.preventDefault(); runResult(results[selected]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function runResult(r: Result | undefined) {
    if (!r) return;
    if (r.kind === "region") onSelectRegion(r.key);
    if (r.kind === "alert") onSelectAlert(r.alert);
    if (r.kind === "vessel") {
      // Open vessel detail via the alert path (no dedicated action, find alert or select directly)
      // Simplest: just close and let user click on map. For now: find an alert for this vessel
      const a = alerts.find((al) => al.vessel_id === r.vessel.id);
      if (a) onSelectAlert(a);
    }
    if (r.kind === "action") r.run();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[640px] rounded-2xl bg-[rgba(18,22,36,0.96)] backdrop-blur-2xl border border-white/[0.14] shadow-[0_32px_80px_rgba(0,0,0,0.55)] overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-white/[0.06]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-slate-500">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            placeholder="Search vessels, switch regions, run actions..."
            className="flex-1 bg-transparent outline-none text-[14px] text-slate-100 placeholder-slate-500"
          />
          <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-slate-400">esc</kbd>
        </div>

        <div className="max-h-[min(440px,60vh)] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-slate-500">No matches for "{query}"</div>
          )}
          {results.map((r, i) => (
            <ResultRow key={rowKey(r, i)} result={r} selected={i === selected} onHover={() => setSelected(i)} onRun={() => runResult(r)} />
          ))}
        </div>

        <div className="flex items-center justify-between px-4 h-9 border-t border-white/[0.06] bg-white/[0.015] text-[10.5px] text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd>navigate</span>
            <span className="flex items-center gap-1.5"><Kbd>↵</Kbd>select</span>
          </div>
          <span className="font-mono">{results.length} results</span>
        </div>
      </div>
    </div>
  );
}

function rowKey(r: Result, i: number): string {
  if (r.kind === "region") return `region:${r.key ?? "global"}`;
  if (r.kind === "alert") return `alert:${r.alert.id}`;
  if (r.kind === "vessel") return `vessel:${r.vessel.id}`;
  return `action:${r.label}:${i}`;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-slate-400">{children}</kbd>;
}

function ResultRow({ result, selected, onHover, onRun }: { result: Result; selected: boolean; onHover: () => void; onRun: () => void }) {
  const base = `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
    selected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
  }`;

  if (result.kind === "region") {
    return (
      <button className={base} onMouseEnter={onHover} onClick={onRun}>
        <Kind icon="region" />
        <span className="flex-1 text-[13px] text-slate-100">{result.label}</span>
        <span className="font-mono text-[10px] text-slate-500">region</span>
      </button>
    );
  }

  if (result.kind === "alert") {
    const tierColor = result.alert.recommended_action === "escalate"
      ? "text-red-300"
      : result.alert.recommended_action === "verify"
      ? "text-amber-300"
      : "text-cyan-300";
    return (
      <button className={base} onMouseEnter={onHover} onClick={onRun}>
        <Kind icon="alert" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-slate-100 truncate">{result.alert.vessel_name || "Unknown"}</div>
          <div className="font-mono text-[10.5px] text-slate-500 tabular-nums">MMSI {result.alert.vessel_mmsi || "—"}</div>
        </div>
        <span className={`font-mono text-[11px] font-semibold tabular-nums ${tierColor}`}>
          {Math.round(result.alert.risk_score)}
        </span>
      </button>
    );
  }

  if (result.kind === "vessel") {
    return (
      <button className={base} onMouseEnter={onHover} onClick={onRun}>
        <Kind icon="vessel" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-slate-100 truncate">{result.vessel.name || "Unknown"}</div>
          <div className="font-mono text-[10.5px] text-slate-500 tabular-nums">MMSI {result.vessel.mmsi}</div>
        </div>
        <span className="font-mono text-[10px] text-slate-500">{result.vessel.vessel_type || "vessel"}</span>
      </button>
    );
  }

  // action
  return (
    <button className={base} onMouseEnter={onHover} onClick={onRun}>
      <Kind icon="action" />
      <span className="flex-1 text-[13px] text-slate-100">{result.label}</span>
      {result.shortcut && <Kbd>{result.shortcut}</Kbd>}
    </button>
  );
}

function Kind({ icon }: { icon: "region" | "alert" | "vessel" | "action" }) {
  const paths: Record<string, React.ReactNode> = {
    region: (<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>),
    alert: (<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>),
    vessel: (<><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /></>),
    action: (<><circle cx="12" cy="12" r="9" /><polyline points="10 8 14 12 10 16" /></>),
  };
  return (
    <div className="w-7 h-7 flex items-center justify-center rounded-md bg-white/[0.04] border border-white/[0.06] shrink-0">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
        {paths[icon]}
      </svg>
    </div>
  );
}
