"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface FeatureTourProps {
  active: boolean;
  onComplete: () => void;
  onSelectRegion: (region: string | null) => void;
  onSelectVessel: (vesselId: string) => void;
  onDeselectVessel: () => void;
  onToggleAnalytics: () => void;
  onFlyTo: (center: [number, number], zoom: number) => void;
  analyticsOpen: boolean;
  activeRegion: string | null;
}

interface TourStep {
  title: string;
  description: string;
  hint?: string;
  target: string;
  position: "right" | "left" | "bottom" | "top";
  interactive?: boolean;
  extraInteractive?: string[];
  noDim?: boolean;
  nextLabel?: string;
  action?: () => void;
  cleanup?: () => void;
}

const STEP_REGION = 2;

export default function FeatureTour({
  active,
  onComplete,
  onSelectRegion,
  onSelectVessel: _onSelectVessel,
  onDeselectVessel,
  onToggleAnalytics: _onToggleAnalytics,
  onFlyTo,
  analyticsOpen: _analyticsOpen,
  activeRegion,
}: FeatureTourProps) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [spotlightStyle, setSpotlightStyle] = useState<React.CSSProperties>({});
  const [transitioning, setTransitioning] = useState(false);
  const [paused, setPaused] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const prevRegionRef = useRef<string | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  const steps: TourStep[] = [
    {
      title: "Live Vessel Map",
      description: "Real-time vessel positions rendered on a global maritime map. Vessel markers are color-coded by risk level \u2014 green for normal, yellow for monitor, orange for verify, red for escalate.",
      target: "map",
      position: "left",
      action: () => {
        onDeselectVessel();
        onSelectRegion(null);
        onFlyTo([20, 0], 2);
      },
    },
    {
      title: "Vessel Density Heatmap",
      description: "When zoomed out, vessels aggregate into a density heatmap showing traffic concentration across waterways. Zoom in past the threshold and individual ship markers appear.",
      hint: "Zoom and pan the map to explore",
      target: "map",
      position: "left",
      interactive: true,
      action: () => {
        onSelectRegion(null);
        onFlyTo([20, 0], 2);
      },
    },
    {
      title: "Region Selector",
      description: "9 contested waterways monitored in real time. Click any region to zoom in, filter vessels and alerts to that area, and see per-region vessel counts and alert badges.",
      hint: "Click a region above to try it",
      target: "regions",
      position: "bottom",
      interactive: true,
      action: () => {
        onSelectRegion(null);
        prevRegionRef.current = null;
      },
    },
    {
      title: "Alert Feed",
      description: "Every vessel that triggers anomaly detection appears here with its composite risk score. Alerts are triaged into action tiers \u2014 ESCALATE, VERIFY, MONITOR \u2014 based on fuzzy inference.",
      hint: "Scroll through the alerts",
      target: "alerts",
      position: "right",
      interactive: true,
    },
    {
      title: "Analytics Dashboard",
      description: "Command-level overview: risk distribution across the fleet, alert counts by action tier, detection metrics, and ingestion throughput. Click the Analytics button to open it.",
      hint: "Click Analytics to open the dashboard",
      target: "analytics-btn",
      position: "left",
      interactive: true,
    },
  ];

  const totalSteps = steps.length;
  const current = steps[step];

  const positionElements = useCallback(() => {
    if (!current) return;
    const el = document.querySelector(`[data-tour="${current.target}"]`);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const pad = 8;

    setSpotlightStyle({
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
      borderRadius: 12,
    });

    const tooltipW = 340;
    const tooltipH = 220;
    let top = 0;
    let left = 0;

    switch (current.position) {
      case "right":
        top = rect.top + rect.height / 2 - tooltipH / 2;
        left = rect.right + 20;
        break;
      case "left":
        top = rect.top + rect.height / 2 - tooltipH / 2;
        left = rect.left - tooltipW - 20;
        break;
      case "bottom":
        top = rect.bottom + 16;
        left = rect.left + rect.width / 2 - tooltipW / 2;
        break;
      case "top":
        top = rect.top - tooltipH - 16;
        left = rect.left + rect.width / 2 - tooltipW / 2;
        break;
    }

    top = Math.max(16, Math.min(top, window.innerHeight - tooltipH - 16));
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipW - 16));

    setTooltipStyle({ top, left, width: tooltipW });
  }, [current]);

  useEffect(() => {
    if (!active || !current) return;
    if (!current.interactive) return;

    const elevated: HTMLElement[] = [];
    const el = document.querySelector(`[data-tour="${current.target}"]`) as HTMLElement | null;
    if (el) {
      el.style.position = "relative";
      el.style.zIndex = "61";
      elevated.push(el);
    }

    if (current.extraInteractive) {
      const timer = setTimeout(() => {
        for (const id of current.extraInteractive!) {
          const extra = document.querySelector(`[data-tour="${id}"]`) as HTMLElement | null;
          if (extra) {
            extra.style.zIndex = "61";
            elevated.push(extra);
          }
        }
      }, 500);
      return () => {
        clearTimeout(timer);
        for (const e of elevated) { e.style.position = ""; e.style.zIndex = ""; }
      };
    }

    return () => {
      for (const e of elevated) { e.style.position = ""; e.style.zIndex = ""; }
    };
  }, [active, step, current]);

  // Auto-advance when user picks a region during the region step (suspended while paused)
  useEffect(() => {
    if (!active || paused) return;
    if (stepRef.current !== STEP_REGION) {
      prevRegionRef.current = activeRegion;
      return;
    }
    if (activeRegion && activeRegion !== prevRegionRef.current) {
      const timer = setTimeout(() => {
        transition(stepRef.current + 1);
      }, 1200);
      return () => clearTimeout(timer);
    }
    prevRegionRef.current = activeRegion;
  }, [active, activeRegion, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!active || !current) return;

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (current.action) current.action();
    if (current.cleanup) cleanupRef.current = current.cleanup;

    const timer = setTimeout(() => {
      positionElements();
      setVisible(true);
      setTransitioning(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [active, step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!active) return;
    const handler = () => positionElements();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [active, positionElements]);

  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (paused) return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const transition = (nextStep: number) => {
    setTransitioning(true);
    setVisible(false);
    setTimeout(() => setStep(nextStep), 250);
  };

  const goNext = () => {
    if (step >= totalSteps - 1) { handleClose(); return; }
    transition(step + 1);
  };

  const goPrev = () => {
    if (step > 0) transition(step - 1);
  };

  const handleClose = () => {
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    setVisible(false);
    setPaused(false);
    setStep(0);
    onComplete();
  };

  const handleRestart = () => {
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    setPaused(false);
    if (step === 0) {
      const action = steps[0]?.action;
      if (action) action();
      return;
    }
    transition(0);
  };

  if (!active) return null;

  const isInteractive = current?.interactive;
  const isNoDim = current?.noDim;

  return (
    <div className="fixed inset-0 z-[60]" style={{ pointerEvents: "none" }}>
      {!isNoDim && (
        <>
          <div
            className="absolute inset-0 transition-opacity duration-300"
            style={{ opacity: visible ? 1 : 0, pointerEvents: "none" }}
          >
            <div className="absolute inset-0 bg-black/50" />

            <div
              className="absolute transition-all duration-500 ease-out"
              style={{
                ...spotlightStyle,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.50)",
                border: `2px solid ${isInteractive ? "rgba(34, 211, 238, 0.5)" : "rgba(59, 130, 246, 0.4)"}`,
                zIndex: 1,
                pointerEvents: "none",
              }}
            />
          </div>

          {!isInteractive && !paused && (
            <div className="absolute inset-0" style={{ zIndex: 2, pointerEvents: "auto" }} onClick={(e) => e.stopPropagation()} />
          )}
        </>
      )}

      <div
        className={isNoDim ? "fixed z-10" : "absolute z-10"}
        style={isNoDim
          ? {
              bottom: 32,
              left: "50%",
              transform: visible && !transitioning ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(8px)",
              width: 420,
              pointerEvents: "auto",
              transition: "opacity 300ms ease, transform 300ms ease",
              opacity: visible && !transitioning ? 1 : 0,
            }
          : {
              ...tooltipStyle,
              pointerEvents: "auto",
              transition: "opacity 300ms ease, transform 300ms ease",
              opacity: visible && !transitioning ? 1 : 0,
              transform: visible && !transitioning ? "translateY(0)" : "translateY(8px)",
            }
        }
      >
        <div className="bg-[#0d1320]/95 backdrop-blur-xl border border-blue-500/20 rounded-xl shadow-2xl shadow-black/40 p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-widest">
              Feature Tour{" "}
              <span className="text-slate-600">{step + 1} / {totalSteps}</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPaused((p) => !p)}
                title={paused ? "Resume" : "Pause"}
                className="text-slate-500 hover:text-slate-200 transition-colors p-1 rounded hover:bg-white/5"
              >
                {paused ? (
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                )}
              </button>
              <button
                onClick={handleRestart}
                title="Begin again"
                className="text-slate-500 hover:text-slate-200 transition-colors p-1 rounded hover:bg-white/5"
              >
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
              </button>
              <button
                onClick={handleClose}
                title="Close"
                className="text-slate-600 hover:text-slate-300 transition-colors p-1 rounded hover:bg-white/5"
              >
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <h3 className="text-lg font-bold text-white mb-2">
            {paused ? "Paused" : current?.title}
          </h3>
          <p className="text-[13px] text-slate-400 leading-relaxed mb-1">
            {paused
              ? "The tour is paused. Explore freely — resume when you're ready, or begin again from the top."
              : current?.description}
          </p>

          {!paused && current?.hint && (
            <p className="text-[11px] text-cyan-400/80 mb-4 flex items-center gap-1.5">
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0">
                <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
              </svg>
              {current.hint}
            </p>
          )}
          {(paused || !current?.hint) && <div className="mb-4" />}

          <div className="flex items-center justify-between">
            <button
              onClick={goPrev}
              disabled={paused || step === 0}
              className="text-[11px] text-slate-500 hover:text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
            >
              Back
            </button>

            <div className="flex gap-1">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step
                      ? "w-5 bg-blue-400"
                      : i < step
                        ? "w-1.5 bg-blue-400/30"
                        : "w-1.5 bg-slate-700"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={goNext}
              disabled={paused}
              className="text-[11px] font-semibold text-white px-4 py-1.5 rounded-lg transition-colors bg-blue-600/80 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {current?.nextLabel ?? (step >= totalSteps - 1 ? "Finish" : "Next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
