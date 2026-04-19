"use client";

import Link from "next/link";

interface HeaderProps {
  alertCount: number;
  vesselCount: number;
  isLive: boolean;
  positionsIngested?: number;
  onToggleAnalytics: () => void;
  analyticsOpen?: boolean;
  connectionOk?: boolean;
}

export default function Header({
  alertCount, vesselCount, isLive, positionsIngested, onToggleAnalytics, analyticsOpen, connectionOk = true,
}: HeaderProps) {
  return (
    <header className="h-14 glass-strong border-b border-white/[0.08] flex items-center justify-between px-5 shrink-0 relative z-20">
      <div className="flex items-center gap-5">
        <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
          <div className="relative w-6 h-6 rounded-md bg-gradient-to-br from-violet-400 to-cyan-400 flex items-center justify-center">
            <div className="absolute inset-[1.5px] rounded-[4px] bg-gradient-to-br from-[#1a1230] to-[#0d1a2a]" />
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10 text-white">
              <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" />
            </svg>
          </div>
          <span className="text-[14px] font-semibold tracking-tight text-slate-100 leading-none">HarborOS</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 ml-2">
          <NavLink href="/dashboard" active>Operations</NavLink>
          <NavLink href="/dashboard">Fleet</NavLink>
          <NavLink href="/dashboard">Alerts</NavLink>
          <NavLink href="/analytics">Analytics</NavLink>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <Stat label="CONTACTS" value={vesselCount} />
        <Stat label="ALERTS" value={alertCount} alert={alertCount > 0} />
        {isLive && positionsIngested != null && (
          <Stat label="INGEST" value={positionsIngested.toLocaleString()} />
        )}

        <button
          data-tour="analytics-btn"
          onClick={onToggleAnalytics}
          className={`text-[11px] transition-all font-medium tracking-wide px-3 py-1.5 rounded-lg ml-1 ${
            analyticsOpen
              ? "text-violet-300 bg-violet-500/10 border border-violet-400/30"
              : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] border border-transparent"
          }`}
        >
          Analytics
        </button>

        {!connectionOk && (
          <div className="flex items-center gap-1.5 border border-red-400/25 rounded-full px-2.5 py-1 ml-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400" style={{ animation: "subtle-pulse 1.4s infinite" }} />
            <span className="text-[10px] font-semibold text-red-300 tracking-wider font-mono">OFFLINE</span>
          </div>
        )}

        {isLive ? (
          <div className="flex items-center gap-1.5 border border-emerald-400/20 rounded-full px-2.5 py-1 ml-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: "subtle-pulse 2.4s infinite" }} />
            <span className="text-[10px] font-semibold text-emerald-300 tracking-wider font-mono">LIVE</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 border border-amber-400/20 rounded-full px-2.5 py-1 ml-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[10px] font-semibold text-amber-300 tracking-wider font-mono">SCENARIO</span>
          </div>
        )}
      </div>
    </header>
  );
}

function NavLink({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`relative text-[13px] font-medium transition-colors px-3 py-1.5 rounded-lg ${
        active ? "text-slate-100" : "text-slate-400 hover:text-slate-100"
      }`}
    >
      {children}
      {active && (
        <span className="absolute left-3 right-3 -bottom-[15px] h-[2px] bg-gradient-to-r from-violet-400 to-cyan-400 rounded-full" />
      )}
    </Link>
  );
}

function Stat({ label, value, alert }: { label: string; value: number | string; alert?: boolean }) {
  return (
    <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-1.5">
      <span className="text-[9px] text-slate-500 font-semibold tracking-[0.14em] font-mono">{label}</span>
      <span className={`text-xs font-mono font-semibold tabular-nums ${alert ? "text-red-300" : "text-slate-100"}`}>
        {value}
      </span>
    </div>
  );
}
