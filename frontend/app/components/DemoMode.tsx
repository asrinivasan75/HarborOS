"use client";

import { useState, useCallback, useEffect } from "react";

interface DemoStep {
  title: string;
  narration: string;
  action: () => void;
  duration: number; // ms before auto-advancing (0 = manual)
}

interface DemoModeProps {
  onFlyTo: (center: [number, number], zoom: number) => void;
  onSelectVessel: (vesselId: string) => void;
  onSelectRegion: (region: string | null) => void;
  darkHorizonId: string;
}

const DEMO_STEPS: Omit<DemoStep, "action">[] = [
  {
    title: "Welcome to HarborOS",
    narration: "HarborOS is a maritime awareness and decision-support platform. It detects suspicious vessels, assesses risk, and recommends operator actions \u2014 from ignoring routine traffic to escalating threats for verification.",
    duration: 0,
  },
  {
    title: "Global Coverage",
    narration: "We're monitoring 9 contested waterways simultaneously \u2014 from the Strait of Malacca to the Black Sea. Every vessel with an AIS transponder is tracked, scored, and triaged in real time.",
    duration: 0,
  },
  {
    title: "Los Angeles Harbor",
    narration: "Let's zoom into LA Harbor \u2014 the busiest container port in the Western Hemisphere. Notice the vessel markers: green is normal, yellow means monitor, orange means verify, red means escalate.",
    duration: 0,
  },
  {
    title: "Suspicious Contact: EventEdgeHQ.com",
    narration: "The system flagged this vessel automatically. It entered a restricted terminal zone, loitered for 47 minutes with erratic speed changes, had a 14-minute AIS transmission gap, and is lingering near the LNG security zone. Risk score: 100. Recommended action: ESCALATE.",
    duration: 0,
  },
  {
    title: "Explainable Signals",
    narration: "Every alert is explainable. The operator sees exactly which anomaly signals triggered, their severity, and a human-readable explanation. No black box \u2014 the system shows its work.",
    duration: 0,
  },
  {
    title: "Verification Dispatch",
    narration: "With one click, the operator can request satellite imagery for the vessel or the current map focus. HarborOS returns the best available scene immediately and overlays the real image when bbox metadata is available.",
    duration: 0,
  },
  {
    title: "The Bigger Picture",
    narration: "HarborOS turns raw vessel data into operator decisions. Detect, assess, recommend, verify \u2014 that's the loop. It works today with software alone, and scales to hardware tomorrow.",
    duration: 0,
  },
];

export default function DemoMode({ onFlyTo, onSelectVessel, onSelectRegion, darkHorizonId }: DemoModeProps) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  const executeStep = useCallback((stepIndex: number) => {
    switch (stepIndex) {
      case 0: // Welcome
        onSelectRegion(null);
        onFlyTo([20, 0], 2);
        break;
      case 1: // Global coverage
        onFlyTo([20, 0], 2);
        break;
      case 2: // LA Harbor
        onSelectRegion("la_harbor");
        onFlyTo([-118.26, 33.73], 12.5);
        break;
      case 3: // Dark Horizon
        onSelectVessel(darkHorizonId);
        break;
      case 4: // Explainable signals (already on detail panel)
        break;
      case 5: // Verification
        break;
      case 6: // Bigger picture
        onSelectRegion(null);
        onFlyTo([20, 0], 2);
        break;
    }
  }, [onFlyTo, onSelectVessel, onSelectRegion, darkHorizonId]);

  const handleStart = useCallback(() => {
    setActive(true);
    setStep(0);
    executeStep(0);
  }, [executeStep]);

  const handleNext = useCallback(() => {
    if (step < DEMO_STEPS.length - 1) {
      const next = step + 1;
      setStep(next);
      executeStep(next);
    } else {
      setActive(false);
      setStep(0);
    }
  }, [step, executeStep]);

  const handlePrev = useCallback(() => {
    if (step > 0) {
      const prev = step - 1;
      setStep(prev);
      executeStep(prev);
    }
  }, [step, executeStep]);

  const handleClose = useCallback(() => {
    setActive(false);
    setStep(0);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, handleNext, handlePrev, handleClose]);

  if (!active) {
    return (
      <button
        onClick={handleStart}
        className="absolute top-4 right-16 z-50 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-lg shadow-blue-500/20 transition-colors flex items-center gap-2"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5,3 19,12 5,21" />
        </svg>
        Start Demo
      </button>
    );
  }

  const currentStep = DEMO_STEPS[step];
  const progress = ((step + 1) / DEMO_STEPS.length) * 100;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 w-[560px]">
      <div className="bg-[#0d1320]/95 backdrop-blur-md border border-[#1a2235] rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
        {/* Progress bar */}
        <div className="h-0.5 bg-[#1a2235]">
          <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        <div className="p-5">
          {/* Step counter + title */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                {step + 1}/{DEMO_STEPS.length}
              </span>
              <h3 className="text-sm font-semibold text-slate-100">{currentStep.title}</h3>
            </div>
            <button
              onClick={handleClose}
              className="text-slate-600 hover:text-slate-400 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Narration */}
          <p className="text-[12px] text-slate-400 leading-relaxed mb-4">{currentStep.narration}</p>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={handlePrev}
              disabled={step === 0}
              className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-3 py-1.5"
            >
              Previous
            </button>
            <div className="flex gap-1">
              {DEMO_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === step ? "bg-blue-400" : i < step ? "bg-blue-400/30" : "bg-slate-700"
                  }`}
                />
              ))}
            </div>
            <button
              onClick={handleNext}
              className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors px-3 py-1.5 bg-blue-500/10 rounded-lg"
            >
              {step === DEMO_STEPS.length - 1 ? "Finish" : "Next \u2192"}
            </button>
          </div>

          <p className="text-[9px] text-slate-700 text-center mt-2">Arrow keys or Space to navigate \u00b7 Esc to close</p>
        </div>
      </div>
    </div>
  );
}
