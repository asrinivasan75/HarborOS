"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Logomark from "@/app/components/Logomark";

interface ReturnHomeProps {
  className?: string;
  children: React.ReactNode;
}

const NAVIGATE_AT = 1100;

export default function ReturnHome({ className, children }: ReturnHomeProps) {
  const [closing, setClosing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/");
  }, [router]);

  return (
    <>
      <button
        type="button"
        onClick={() => !closing && setClosing(true)}
        className={className}
      >
        {children}
      </button>
      {closing && <ExitOverlay onDone={() => router.push("/")} />}
    </>
  );
}

function ExitOverlay({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
    }, NAVIGATE_AT);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-[100] pointer-events-auto">
      {/* Iris close — four panels wipe in from edges */}
      <div className="absolute inset-0 exit-iris-top bg-[#080b14]" />
      <div className="absolute inset-0 exit-iris-bottom bg-[#080b14]" />
      <div className="absolute inset-0 exit-iris-left bg-[#080b14]" />
      <div className="absolute inset-0 exit-iris-right bg-[#080b14]" />

      {/* Core glow + mark */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="exit-core relative flex flex-col items-center gap-4">
          {/* Expanding rings */}
          <div aria-hidden className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40">
            <span className="absolute inset-0 rounded-full border border-cyan-400/40 exit-ring" />
            <span className="absolute inset-0 rounded-full border border-violet-400/30 exit-ring exit-ring-2" />
            <span className="absolute inset-0 rounded-full border border-pink-400/25 exit-ring exit-ring-3" />
          </div>

          <div className="relative w-14 h-14 rounded-2xl border border-white/[0.14] bg-[rgba(18,22,36,0.85)] backdrop-blur-xl flex items-center justify-center text-slate-200 shadow-[0_0_40px_rgba(167,139,250,0.35)]">
            <Logomark size={36} animate />
          </div>
          <div className="text-center">
            <div className="text-[13px] font-semibold tracking-tight text-slate-100">Securing console</div>
            <div className="text-[10.5px] font-mono tracking-[0.18em] uppercase text-slate-500 mt-1">Returning to harbor</div>
          </div>
        </div>
      </div>
    </div>
  );
}
