"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Logomark from "@/app/components/Logomark";

interface LaunchButtonProps {
  className?: string;
  children?: React.ReactNode;
  href?: string;
}

const STEPS = [
  { label: "Connecting to ingest stream", at: 0 },
  { label: "Loading 9 sectors", at: 350 },
  { label: "Initializing detectors", at: 700 },
  { label: "Console ready", at: 1100 },
];

const NAVIGATE_AT = 1500;

export default function LaunchButton({ className, children, href = "/dashboard" }: LaunchButtonProps) {
  const [launching, setLaunching] = useState(false);
  const router = useRouter();

  useEffect(() => {
    router.prefetch(href);
  }, [router, href]);

  return (
    <>
      <button
        type="button"
        onClick={() => !launching && setLaunching(true)}
        className={className}
      >
        {children ?? (
          <>
            Launch Operations <span aria-hidden>→</span>
          </>
        )}
      </button>
      {launching && <LaunchOverlay onDone={() => router.push(href)} />}
    </>
  );
}

function LaunchOverlay({ onDone }: { onDone: () => void }) {
  const [stepIdx, setStepIdx] = useState(-1);
  const doneRef = useRef(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    STEPS.forEach((s, i) => {
      timers.push(setTimeout(() => setStepIdx(i), s.at));
    });
    timers.push(
      setTimeout(() => {
        if (doneRef.current) return;
        doneRef.current = true;
        onDone();
      }, NAVIGATE_AT),
    );
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(8,11,20,0.88)] backdrop-blur-md launch-fade-in">
      {/* sweep */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="launch-sweep absolute -inset-x-[50%] top-1/2 h-[2px] bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />
        <div className="launch-grid absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgba(167,139,250,0.08) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.08) 1px,transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="relative w-[min(460px,88vw)] rounded-2xl border border-white/[0.12] bg-[rgba(18,22,36,0.72)] backdrop-blur-2xl p-8 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl border border-white/[0.1] bg-white/[0.02] flex items-center justify-center launch-logo-glow text-slate-300">
            <Logomark size={28} animate />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight">HarborOS</div>
            <div className="text-[10.5px] font-mono tracking-[0.14em] uppercase text-slate-500 mt-0.5">Launching console</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-[3px] w-full rounded-full bg-white/[0.05] overflow-hidden mb-5">
          <div className="launch-bar h-full rounded-full bg-gradient-to-r from-violet-400 via-cyan-400 to-pink-400" />
        </div>

        {/* Status lines */}
        <div className="space-y-1.5">
          {STEPS.map((s, i) => {
            const state = i < stepIdx ? "done" : i === stepIdx ? "active" : "pending";
            return (
              <div key={s.label} className="flex items-center gap-2.5 text-[12px] font-mono">
                <StatusDot state={state} />
                <span
                  className={
                    state === "done"
                      ? "text-slate-400"
                      : state === "active"
                        ? "text-slate-100"
                        : "text-slate-600"
                  }
                >
                  {s.label}
                </span>
                <span className="ml-auto text-[10px] text-slate-600 tabular-nums">
                  {state === "done" ? "OK" : state === "active" ? "…" : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatusDot({ state }: { state: "done" | "active" | "pending" }) {
  if (state === "done") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400 shrink-0">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }
  if (state === "active") {
    return <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" style={{ animation: "subtle-pulse 0.9s infinite" }} />;
  }
  return <span className="w-2 h-2 rounded-full bg-white/[0.08] shrink-0" />;
}
