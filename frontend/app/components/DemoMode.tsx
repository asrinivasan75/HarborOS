"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface DemoModeProps {
  onFlyTo: (center: [number, number], zoom: number) => void;
  onSelectVessel: (vesselId: string) => void;
  onSelectRegion: (region: string | null) => void;
  onDeselectVessel: () => void;
  onShowAnalytics: (show: boolean) => void;
  darkHorizonId: string;
  jadeStarId: string;
  darkOpticalId: string;
  normalVesselIds: string[];
}

interface DemoStage {
  title: string;
  body: React.ReactNode;
  subtitle?: React.ReactNode;
  callout?: React.ReactNode;
  callout2?: React.ReactNode;
  isStar?: boolean; // Makes the stage visually bigger/bolder
  action: (props: DemoModeProps) => void;
}

function buildStages(): DemoStage[] {
  return [
    // ── Stage 1: The Problem ──────────────────────────
    {
      title: "Maritime Awareness in Contested Waters",
      body: (
        <div className="space-y-4">
          <p>
            Global maritime traffic exceeds{" "}
            <span className="text-cyan-400 font-semibold">100,000 vessels daily</span>.
            Among them: vessels running dark — AIS transponders disabled, spoofed
            identities, and increasingly, unmanned surface vehicles invisible to
            traditional tracking.
          </p>
          <p>
            The uptick in stealth platforms — from Iranian fast-attack craft to
            Houthi explosive USVs — has exposed a critical gap:{" "}
            <span className="text-orange-400 font-semibold">
              AIS alone cannot provide maritime domain awareness.
            </span>
          </p>
          <p>
            The future of naval warfare is shifting from ship-to-ship combat to
            asymmetric drone warfare.{" "}
            <span className="text-white font-semibold">
              HarborOS is built for this new reality.
            </span>
          </p>
        </div>
      ),
      subtitle: (
        <p className="text-slate-400 text-sm mt-4 italic">
          HarborOS fuses AIS intelligence, anomaly detection, satellite imagery,
          and computer vision to provide a unified operating picture.
        </p>
      ),
      action: (props) => {
        props.onSelectRegion(null);
        props.onDeselectVessel();
        props.onShowAnalytics(false);
        props.onFlyTo([20, 0], 2);
      },
    },

    // ── Stage 2: AIS Intelligence ─────────────────────
    {
      title: "Starting with AIS: Global Vessel Tracking",
      body: (
        <div className="space-y-4">
          <p>
            <span className="text-cyan-400 font-semibold">AIS</span> (Automatic
            Identification System) is the backbone of maritime tracking. Every
            commercial vessel over{" "}
            <span className="font-mono text-cyan-300">300 gross tons</span> is
            required to broadcast its position, speed, heading, and identity.
          </p>
          <p>
            HarborOS ingests live AIS feeds via the{" "}
            <span className="text-cyan-400">AISStream WebSocket API</span>,
            covering{" "}
            <span className="text-white font-semibold">
              9 contested waterways
            </span>{" "}
            worldwide.
          </p>
          <p>
            Here we&apos;re looking at{" "}
            <span className="text-white font-semibold">LA Harbor</span> — one of
            the busiest ports in the Western Hemisphere.
          </p>
        </div>
      ),
      action: (props) => {
        props.onSelectRegion("la_harbor");
        props.onFlyTo([-118.26, 33.73], 12.5);
      },
    },

    // ── Stage 3: Spoofing Detection ───────────────────
    {
      title: "But AIS Can Be Spoofed",
      body: (
        <div className="space-y-4">
          <p>
            Not all AIS data can be trusted. Vessels can{" "}
            <span className="text-orange-400 font-semibold">
              disable their transponders
            </span>{" "}
            (going &ldquo;dark&rdquo;), broadcast false positions, or manipulate
            their identity.
          </p>
          <p>
            Our anomaly detection engine catches this. Watch: this vessel —{" "}
            <span className="text-red-400 font-semibold">JADE STAR</span> —
            reported positions that are{" "}
            <span className="text-red-400 font-semibold">
              physically impossible
            </span>
            . It appeared to jump{" "}
            <span className="font-mono text-red-300">50 nm</span> in under{" "}
            <span className="font-mono text-red-300">2 minutes</span>.
          </p>
          <p>
            HarborOS flagged this as{" "}
            <span className="text-cyan-400 font-semibold">
              kinematic implausibility
            </span>{" "}
            — a strong indicator of AIS spoofing or GPS manipulation.
          </p>
        </div>
      ),
      action: (props) => {
        props.onSelectVessel(props.jadeStarId);
      },
    },

    // ── Stage 4: Anomaly Detection ────────────────────
    {
      title: "11 Anomaly Detectors. One Risk Score.",
      body: (
        <div className="space-y-4">
          <p>
            Every vessel is continuously evaluated by{" "}
            <span className="text-cyan-400 font-semibold">
              11 anomaly detection algorithms
            </span>{" "}
            — from geofence breaches to loitering patterns to AIS dark periods.
          </p>
          <p>
            Here&apos;s{" "}
            <span className="text-red-400 font-semibold">MV DARK HORIZON</span>{" "}
            — a Marshall Islands-flagged cargo vessel that triggered{" "}
            <span className="text-red-400 font-semibold">
              multiple alarms
            </span>
            .
          </p>
          <p>
            Each signal has a severity score and a human-readable explanation. The
            composite risk score uses{" "}
            <span className="text-cyan-400">
              fuzzy inference (Mamdani method)
            </span>{" "}
            to combine signals — requiring converging evidence before escalation.
          </p>
        </div>
      ),
      subtitle: (
        <p className="text-slate-400 text-sm mt-3 font-mono leading-relaxed">
          Loitering:{" "}
          <span className="text-orange-300">
            Circling in a 4.8nm area for 27 min with 331° course change
          </span>
          . AIS Gap:{" "}
          <span className="text-orange-300">12-minute dark period</span>.
          Geofence Breach:{" "}
          <span className="text-red-300">
            Inside restricted LNG terminal zone
          </span>
          .
        </p>
      ),
      action: (props) => {
        props.onSelectVessel(props.darkHorizonId);
      },
    },

    // ── Stage 5: Export & Reporting ────────────────────
    {
      title: "Exportable Intelligence Reports",
      body: (
        <div className="space-y-4">
          <p>
            Every vessel assessment can be exported as a{" "}
            <span className="text-cyan-400 font-semibold">
              comprehensive incident report
            </span>{" "}
            — including position trail, anomaly signals with severity scores,
            operator audit trail, and risk assessment.
          </p>
          <p>
            This is designed for{" "}
            <span className="text-white font-semibold">
              interagency sharing
            </span>
            : Coast Guard, Navy, port authority, or intelligence partners.
          </p>
        </div>
      ),
      action: (props) => {
        props.onSelectVessel(props.darkHorizonId);
        // Open report in new tab after delay
        setTimeout(() => {
          window.open(`/report?vesselId=${props.darkHorizonId}`, "_blank");
        }, 1200);
      },
    },

    // ── Stage 6: Satellite Verification ───────────────
    {
      title: "Eyes in the Sky — Copernicus Sentinel-2",
      body: (
        <div className="space-y-4">
          <p>
            When a vessel is flagged, operators can request{" "}
            <span className="text-cyan-400 font-semibold">
              satellite imagery verification
            </span>{" "}
            through the Copernicus Data Space — ESA&apos;s Sentinel-2 constellation
            providing{" "}
            <span className="font-mono text-cyan-300">10m resolution</span>{" "}
            optical imagery with a{" "}
            <span className="font-mono text-cyan-300">5-day revisit</span>.
          </p>
          <p>
            HarborOS searches the Copernicus catalog for the most recent
            cloud-free imagery over the vessel&apos;s position and overlays it
            directly on the operational map.
          </p>
          <p>
            This adds a{" "}
            <span className="text-white font-semibold">
              second layer of confirmation
            </span>{" "}
            beyond AIS — you can visually verify if a vessel is actually where it
            claims to be.
          </p>
        </div>
      ),
      action: (props) => {
        props.onSelectVessel(props.darkHorizonId);
      },
    },

    // ── Stage 7: Dark Ship Detection (THE STAR) ───────
    {
      title: "Beyond AIS: Optical Dark Ship Detection",
      isStar: true,
      body: (
        <div className="space-y-4">
          <p>
            This is what sets HarborOS apart. Our edge computing system —{" "}
            <span className="text-cyan-400 font-semibold">SeaPod</span> — uses
            shore-mounted cameras and onboard{" "}
            <span className="text-cyan-400 font-semibold">computer vision</span>{" "}
            to detect vessels that AIS cannot see.
          </p>
          <p>
            This vessel has{" "}
            <span className="text-red-400 font-semibold">
              no AIS transponder
            </span>
            , no IMO number, no registered identity. It was detected purely
            through optical analysis —{" "}
            <span className="text-cyan-400">
              wake pattern recognition and hull detection
            </span>{" "}
            at{" "}
            <span className="font-mono text-cyan-300">3.3 nautical miles</span>.
          </p>
          <p>
            The CV pipeline extracts velocity, heading, and position from image
            sequences — creating a track for a vessel that would otherwise be{" "}
            <span className="text-red-400 font-semibold">
              completely invisible
            </span>
            .
          </p>
        </div>
      ),
      callout: (
        <div className="mt-4 border-l-2 border-cyan-500/60 bg-white/5 rounded-r-lg px-4 py-3">
          <p className="text-sm text-slate-300 leading-relaxed">
            <span className="text-cyan-400 font-semibold">
              OPTICAL DARK SHIP DETECTION
            </span>{" "}
            by SeaPod_Alpha. Unregistered vessel detected at range{" "}
            <span className="font-mono text-cyan-300">3.3 nm</span>, bearing{" "}
            <span className="font-mono text-cyan-300">295°</span>. No AIS
            transponder signal. Detection confidence:{" "}
            <span className="font-mono text-cyan-300">50%</span>.
          </p>
        </div>
      ),
      callout2: (
        <p className="mt-4 text-center text-lg text-cyan-300 leading-relaxed">
          In a full deployment, a network of SeaPod cameras across a harbor
          creates a complete optical vessel map — tracking every ship regardless
          of AIS compliance. More cameras, more coverage, higher confidence.
        </p>
      ),
      action: (props) => {
        props.onSelectVessel(props.darkOpticalId);
      },
    },

    // ── Stage 8: Analytics ────────────────────────────
    {
      title: "Operational Analytics",
      body: (
        <div className="space-y-4">
          <p>
            HarborOS tracks detection metrics across all monitored regions —{" "}
            <span className="text-cyan-400 font-semibold">precision rates</span>,
            alert distribution, vessel counts, and ingestion throughput.
          </p>
          <p>
            This is the{" "}
            <span className="text-white font-semibold">command-level view</span>:
            how many vessels are we tracking, how many alerts have we generated,
            and how accurate are our detections.
          </p>
        </div>
      ),
      action: (props) => {
        props.onDeselectVessel();
        props.onShowAnalytics(true);
      },
    },

    // ── Stage 9: Closing ──────────────────────────────
    {
      title: "HarborOS",
      body: (
        <div className="text-center space-y-4">
          <p className="text-xl text-slate-200 leading-relaxed">
            Maritime domain awareness for the age of autonomous warfare.
          </p>
          <p className="text-base text-cyan-400 tracking-wide">
            AIS Intelligence · Anomaly Detection · Satellite Verification ·
            Computer Vision
          </p>
        </div>
      ),
      subtitle: (
        <p className="text-center text-slate-500 text-sm mt-4">
          Built by Team HarborOS. Questions?
        </p>
      ),
      action: (props) => {
        props.onDeselectVessel();
        props.onShowAnalytics(false);
        props.onSelectRegion(null);
        props.onFlyTo([20, 0], 2);
      },
    },
  ];
}

export default function DemoMode(props: DemoModeProps) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [visible, setVisible] = useState(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stagesRef = useRef<DemoStage[]>(buildStages());
  const stages = stagesRef.current;

  // Clear all pending timeouts
  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  // Schedule a timeout and track it for cleanup
  const scheduleTimeout = useCallback(
    (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      timeoutsRef.current.push(id);
      return id;
    },
    []
  );

  // Execute a stage's auto-action with delay
  const executeStageAction = useCallback(
    (stageIndex: number) => {
      clearAllTimeouts();
      scheduleTimeout(() => {
        stages[stageIndex].action(props);

        // Stage 2 (AIS Intelligence): cycle through normal vessels
        if (stageIndex === 1 && props.normalVesselIds.length > 0) {
          const vesselIds = props.normalVesselIds.slice(0, 3);
          vesselIds.forEach((vid, i) => {
            scheduleTimeout(() => props.onSelectVessel(vid), 1500 + i * 2500);
            if (i < vesselIds.length - 1) {
              scheduleTimeout(() => props.onDeselectVessel(), 1500 + i * 2500 + 1800);
            }
          });
        }
      }, 800);
    },
    [props, stages, clearAllTimeouts, scheduleTimeout]
  );

  const handleStart = useCallback(() => {
    setActive(true);
    setStep(0);
    // Fade in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    executeStageAction(0);
  }, [executeStageAction]);

  const advanceTo = useCallback(
    (nextStep: number) => {
      setTransitioning(true);
      scheduleTimeout(() => {
        setStep(nextStep);
        setTransitioning(false);
        executeStageAction(nextStep);
      }, 250);
    },
    [executeStageAction, scheduleTimeout]
  );

  const handleNext = useCallback(() => {
    if (step < stages.length - 1) {
      advanceTo(step + 1);
    } else {
      // Finish demo
      clearAllTimeouts();
      setVisible(false);
      scheduleTimeout(() => {
        setActive(false);
        setStep(0);
        props.onDeselectVessel();
        props.onShowAnalytics(false);
      }, 300);
    }
  }, [step, stages.length, advanceTo, clearAllTimeouts, scheduleTimeout, props]);

  const handlePrev = useCallback(() => {
    if (step > 0) advanceTo(step - 1);
  }, [step, advanceTo]);

  const handleClose = useCallback(() => {
    clearAllTimeouts();
    setVisible(false);
    scheduleTimeout(() => {
      setActive(false);
      setStep(0);
    }, 300);
  }, [clearAllTimeouts, scheduleTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearAllTimeouts();
  }, [clearAllTimeouts]);

  // Keyboard navigation
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        handleNext();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      }
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

  const current = stages[step];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      style={{ transition: "opacity 300ms ease", opacity: visible ? 1 : 0 }}
    >
      {/* Click-through backdrop — just for visual darkening */}
      <div className="absolute inset-0 bg-black/30 pointer-events-none" />

      {/* Overlay panel */}
      <div
        className="pointer-events-auto relative w-[700px] max-h-[85vh] overflow-y-auto"
        style={{
          transition: "transform 250ms ease, opacity 250ms ease",
          transform: transitioning ? "scale(0.96)" : "scale(1)",
          opacity: transitioning ? 0 : 1,
        }}
      >
        <div
          className={`bg-[#0a0e1a]/95 backdrop-blur-xl border rounded-2xl shadow-2xl shadow-black/50 ${
            current.isStar
              ? "border-cyan-500/30 ring-1 ring-cyan-500/10"
              : "border-white/10"
          }`}
        >
          <div className="p-8 md:p-10">
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-slate-600 hover:text-slate-300 transition-colors p-1"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {/* Stage title */}
            <h2
              className={`font-bold text-white mb-5 leading-tight ${
                current.isStar ? "text-3xl" : "text-2xl"
              }`}
            >
              {current.isStar && (
                <span className="text-cyan-400">&#9670; </span>
              )}
              {current.title}
            </h2>

            {/* Body */}
            <div className="text-base text-slate-300 leading-relaxed">
              {current.body}
            </div>

            {/* Optional subtitle */}
            {current.subtitle}

            {/* Optional callouts */}
            {current.callout}
            {current.callout2}

            {/* Navigation */}
            <div className="mt-8 flex items-center justify-between">
              <button
                onClick={handlePrev}
                disabled={step === 0}
                className="text-sm text-slate-500 hover:text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors px-4 py-2 rounded-lg hover:bg-white/5"
              >
                Back
              </button>

              {/* Step dots */}
              <div className="flex gap-1.5">
                {stages.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      i === step
                        ? "bg-cyan-400 scale-125"
                        : i < step
                          ? "bg-cyan-400/30"
                          : "bg-slate-700"
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={handleNext}
                className={`text-sm font-semibold transition-colors px-5 py-2 rounded-lg ${
                  step === stages.length - 1
                    ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                    : "bg-blue-600/80 hover:bg-blue-500 text-white"
                }`}
              >
                {step === stages.length - 1 ? "Finish Demo" : "Next"}
              </button>
            </div>

            <p className="text-[10px] text-slate-700 text-center mt-3">
              Arrow keys or Space to navigate · Esc to close
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
