"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface FeatureTourProps {
  active: boolean;
  startAt?: number;
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
  noDim?: boolean; // no overlay/spotlight, just a floating tooltip
  nextLabel?: string;
  action?: () => void;
  cleanup?: () => void;
}

/* ── Step index constants for readability ── */
const STEP_REGION = 2;
const STEP_FEATURE_LAST = 5; // analytics — last "feature tour" step
const STEP_VESSEL_DEMO = 6; // first vessel demo step

export default function FeatureTour({
  active,
  startAt = 0,
  onComplete,
  onSelectRegion,
  onSelectVessel,
  onDeselectVessel,
  onToggleAnalytics,
  onFlyTo,
  analyticsOpen,
  activeRegion,
}: FeatureTourProps) {
  const [step, setStep] = useState(startAt);
  const [visible, setVisible] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [spotlightStyle, setSpotlightStyle] = useState<React.CSSProperties>({});
  const [transitioning, setTransitioning] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const prevRegionRef = useRef<string | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  // Reset step when startAt changes (re-opened for a different phase)
  useEffect(() => {
    setStep(startAt);
  }, [startAt]);

  const steps: TourStep[] = [
    /* ── Feature Tour (0-5) ──────────────────────── */
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
      title: "Search, Filter & Sort",
      description: "Search by vessel name, MMSI, or anomaly type. Filter between active and historical alerts. Sort by risk score, vessel name, or time to find what matters most.",
      hint: "Try the controls \u2014 they\u2019re live",
      target: "alert-controls",
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

    /* ── Vessel Demo (6-9) ───────────────────────── */
    {
      title: "How We Detect Threats",
      description: "Let\u2019s look at a real example. MV DARK HORIZON is a Marshall Islands-flagged cargo vessel that triggered multiple anomaly detectors \u2014 loitering, AIS dark periods, geofence breach, and more. Each signal has a severity score and a human-readable explanation.",
      hint: "Scroll the panel to explore each signal",
      target: "vessel-detail",
      position: "left",
      noDim: true,
      action: () => {
        onDeselectVessel();
        if (analyticsOpen) onToggleAnalytics();
        onSelectRegion("la_harbor");
        setTimeout(() => onSelectVessel("v-dark-horizon"), 600);
      },
    },
    {
      title: "Exportable Intelligence Reports",
      description: "Every vessel assessment can be exported as a comprehensive incident report \u2014 including position trail, anomaly signals with severity scores, and risk assessment. Designed for interagency sharing with Coast Guard, Navy, or intelligence partners.",
      hint: "Click \u2018Export\u2019 at the top of the panel to see the full report",
      target: "vessel-detail",
      position: "left",
      noDim: true,
    },
    {
      title: "Satellite Imagery Verification",
      description: "When a vessel is flagged, operators can request satellite imagery verification through the Copernicus Data Space \u2014 ESA\u2019s Sentinel-2 constellation providing 10m resolution optical imagery. This adds a second layer of confirmation beyond AIS.",
      hint: "Try requesting satellite imagery below",
      target: "vessel-detail",
      position: "left",
      noDim: true,
    },
    {
      title: "Your Turn",
      description: "This isn\u2019t the only suspicious vessel. The system is continuously monitoring every ship in the fleet. Click on any alert in the feed or any vessel on the map to investigate it yourself.",
      hint: "Click a vessel on the map or an alert in the feed",
      target: "map",
      position: "left",
      noDim: true,
      action: () => {
        onDeselectVessel();
        onSelectRegion("la_harbor");
        onFlyTo([-118.26, 33.73], 12.5);
      },
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

  // Elevate interactive targets above overlay
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

  // Auto-advance when user picks a region during the region step
  useEffect(() => {
    if (!active) return;
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
  }, [active, activeRegion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Run step action and position elements
  useEffect(() => {
    if (!active || !current) return;

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (current.action) current.action();
    if (current.cleanup) cleanupRef.current = current.cleanup;

    // Longer delay for vessel steps that need data to load
    const delay = step >= STEP_VESSEL_DEMO ? 800 : 400;
    const timer = setTimeout(() => {
      positionElements();
      setVisible(true);
      setTransitioning(false);
    }, delay);

    return () => clearTimeout(timer);
  }, [active, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reposition on resize
  useEffect(() => {
    if (!active) return;
    const handler = () => positionElements();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [active, positionElements]);

  // Keyboard navigation
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }); // intentionally no deps

  const transition = (nextStep: number) => {
    setTransitioning(true);
    setVisible(false);
    setTimeout(() => setStep(nextStep), 250);
  };

  // When started at 0 (feature tour), stop after analytics (step 5)
  // When started at STEP_VESSEL_DEMO, run to the end
  const lastStep = startAt === 0 ? STEP_FEATURE_LAST : totalSteps - 1;

  const goNext = () => {
    if (step >= lastStep) { handleClose(); return; }
    transition(step + 1);
  };

  const goPrev = () => {
    if (step > startAt) transition(step - 1);
  };

  const handleClose = () => {
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    setVisible(false);
    setStep(startAt);
    onComplete();
  };

  if (!active) return null;

  const isInteractive = current?.interactive;

  // Progress: show feature tour dots and vessel demo dots separately
  const isVesselPhase = step >= STEP_VESSEL_DEMO;
  const featureSteps = STEP_FEATURE_LAST + 1;
  const vesselSteps = totalSteps - STEP_VESSEL_DEMO;

  const isNoDim = current?.noDim;

  return (
    <div className="fixed inset-0 z-[60]" style={{ pointerEvents: "none" }}>
      {/* Dark overlay with spotlight cutout — hidden for noDim steps */}
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

          {/* Click blocker — only when NOT interactive and NOT noDim */}
          {!isInteractive && (
            <div className="absolute inset-0" style={{ zIndex: 2, pointerEvents: "auto" }} onClick={(e) => e.stopPropagation()} />
          )}
        </>
      )}

      {/* Tooltip card */}
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
              {isVesselPhase ? "Live Demo" : "Feature Tour"}{" "}
              <span className="text-slate-600">
                {isVesselPhase
                  ? `${step - STEP_VESSEL_DEMO + 1} / ${vesselSteps}`
                  : `${step + 1} / ${featureSteps}`
                }
              </span>
            </span>
            <button onClick={handleClose} className="text-slate-600 hover:text-slate-300 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <h3 className="text-lg font-bold text-white mb-2">{current?.title}</h3>
          <p className="text-[13px] text-slate-400 leading-relaxed mb-1">{current?.description}</p>

          {current?.hint && (
            <p className="text-[11px] text-cyan-400/80 mb-4 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0">
                <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
              </svg>
              {current.hint}
            </p>
          )}
          {!current?.hint && <div className="mb-4" />}

          <div className="flex items-center justify-between">
            <button
              onClick={goPrev}
              disabled={step === 0}
              className="text-[11px] text-slate-500 hover:text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
            >
              Back
            </button>

            <div className="flex items-center gap-3">
              {/* Feature tour dots */}
              <div className="flex gap-1">
                {Array.from({ length: featureSteps }).map((_, i) => (
                  <div
                    key={`f${i}`}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      !isVesselPhase && i === step
                        ? "w-5 bg-blue-400"
                        : i < step
                          ? "w-1.5 bg-blue-400/30"
                          : isVesselPhase
                            ? "w-1.5 bg-blue-400/30"
                            : "w-1.5 bg-slate-700"
                    }`}
                  />
                ))}
              </div>
              {/* Separator */}
              <div className="w-px h-2 bg-slate-700" />
              {/* Vessel demo dots */}
              <div className="flex gap-1">
                {Array.from({ length: vesselSteps }).map((_, i) => {
                  const absIdx = STEP_VESSEL_DEMO + i;
                  return (
                    <div
                      key={`v${i}`}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        absIdx === step
                          ? "w-5 bg-cyan-400"
                          : absIdx < step
                            ? "w-1.5 bg-cyan-400/30"
                            : "w-1.5 bg-slate-700"
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            <button
              onClick={goNext}
              className={`text-[11px] font-semibold text-white px-4 py-1.5 rounded-lg transition-colors ${
                step === STEP_FEATURE_LAST
                  ? "bg-cyan-600 hover:bg-cyan-500"
                  : "bg-blue-600/80 hover:bg-blue-500"
              }`}
            >
              {current?.nextLabel ?? (step >= totalSteps - 1 ? "Finish" : "Next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
