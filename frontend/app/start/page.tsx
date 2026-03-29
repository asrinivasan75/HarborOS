"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

/* ── Animated counter hook ─────────────────────────── */
function useAnimatedCount(target: number, duration = 2000, delay = 0, active = true) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) { setValue(0); return; }
    const timeout = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(timeout);
  }, [target, duration, delay, active]);
  return value;
}

/* ── Slide definitions ─────────────────────────────── */

interface Slide {
  id: string;
  render: (visible: boolean) => React.ReactNode;
}

function buildSlides(): Slide[] {
  return [
    /* ── 0: Title ──────────────────────────────────── */
    {
      id: "title",
      render: () => null, // handled separately (landing page)
    },

    /* ── 1: The Problem ────────────────────────────── */
    {
      id: "problem",
      render: (visible) => (
        <SlideLayout>
          <Stagger visible={visible} delay={0}>
            <p className="text-[11px] text-cyan-400 uppercase tracking-[0.3em] font-semibold mb-6">
              The Problem
            </p>
          </Stagger>

          <Stagger visible={visible} delay={100}>
            <h2 className="text-5xl font-bold text-white leading-[1.15] mb-8 max-w-3xl">
              The ocean is the world&apos;s largest{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">
                blind spot
              </span>
            </h2>
          </Stagger>

          <Stagger visible={visible} delay={250}>
            <p className="text-lg text-slate-400 leading-relaxed max-w-2xl mb-10">
              Over 100,000 vessels transit international waters every day. Among them &mdash;
              ships running dark, broadcasting false positions, or operating with no
              electronic signature at all.
            </p>
          </Stagger>

          <div className="grid grid-cols-3 gap-6 max-w-3xl w-full">
            {[
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-red-400">
                    <path d="M2.5 2v6h6M21.5 22v-6h-6" />
                    <path d="M22 11.5A10 10 0 0 0 3.2 7.2M2 12.5a10 10 0 0 0 18.8 4.3" />
                  </svg>
                ),
                stat: "59%",
                label: "increase in AIS spoofing incidents since 2021",
                color: "border-red-500/20 bg-red-500/5",
                delay: 400,
              },
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-orange-400">
                    <path d="M12 9v4M12 17h.01" />
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                ),
                stat: "4,000+",
                label: "dark vessel transits in contested waterways per month",
                color: "border-orange-500/20 bg-orange-500/5",
                delay: 550,
              },
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-yellow-400">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                ),
                stat: "~45 min",
                label: "average time to detect an AIS gap with manual monitoring",
                color: "border-yellow-500/20 bg-yellow-500/5",
                delay: 700,
              },
            ].map((card) => (
              <Stagger key={card.stat} visible={visible} delay={card.delay}>
                <div className={`rounded-xl border p-5 ${card.color} transition-all duration-500`}>
                  <div className="mb-3">{card.icon}</div>
                  <div className="text-2xl font-bold text-white font-mono mb-1">{card.stat}</div>
                  <div className="text-[11px] text-slate-500 leading-relaxed">{card.label}</div>
                </div>
              </Stagger>
            ))}
          </div>
        </SlideLayout>
      ),
    },

    /* ── 2: Emerging Threats ────────────────────────── */
    {
      id: "threats",
      render: (visible) => (
        <SlideLayout>
          <Stagger visible={visible} delay={0}>
            <p className="text-[11px] text-orange-400 uppercase tracking-[0.3em] font-semibold mb-6">
              Emerging Threats
            </p>
          </Stagger>

          <Stagger visible={visible} delay={100}>
            <h2 className="text-5xl font-bold text-white leading-[1.15] mb-6 max-w-3xl">
              The threat landscape is{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500">
                evolving faster
              </span>{" "}
              than legacy systems
            </h2>
          </Stagger>

          <Stagger visible={visible} delay={200}>
            <p className="text-lg text-slate-400 leading-relaxed max-w-2xl mb-10">
              From Iranian fast-attack craft to Houthi explosive USVs, adversaries
              are exploiting the gaps in conventional maritime surveillance.
            </p>
          </Stagger>

          <div className="grid grid-cols-2 gap-4 max-w-3xl w-full">
            {[
              {
                title: "AIS Spoofing",
                desc: "Vessels broadcast false positions, creating phantom tracks while operating elsewhere undetected.",
                icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
                accent: "text-red-400",
                delay: 350,
              },
              {
                title: "Dark Transits",
                desc: "Transponders deliberately disabled during sensitive operations. Invisible to AIS-dependent systems.",
                icon: "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18",
                accent: "text-orange-400",
                delay: 500,
              },
              {
                title: "Unmanned Surface Vehicles",
                desc: "Autonomous or remote-controlled craft with no crew, no AIS, and explosive payloads.",
                icon: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8",
                accent: "text-yellow-400",
                delay: 650,
              },
              {
                title: "Identity Deception",
                desc: "Vessels falsifying MMSI, IMO, flag state, or vessel type to evade sanctions and inspections.",
                icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
                accent: "text-cyan-400",
                delay: 800,
              },
            ].map((item) => (
              <Stagger key={item.title} visible={visible} delay={item.delay}>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] transition-colors duration-300">
                  <div className="flex items-start gap-4">
                    <div className={`shrink-0 mt-0.5 ${item.accent}`}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d={item.icon} />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white mb-1">{item.title}</h3>
                      <p className="text-[12px] text-slate-500 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </div>
              </Stagger>
            ))}
          </div>
        </SlideLayout>
      ),
    },

    /* ── 3: Current Solutions ──────────────────────── */
    {
      id: "current",
      render: (visible) => (
        <SlideLayout>
          <Stagger visible={visible} delay={0}>
            <p className="text-[11px] text-slate-500 uppercase tracking-[0.3em] font-semibold mb-6">
              Current Solutions
            </p>
          </Stagger>

          <Stagger visible={visible} delay={100}>
            <h2 className="text-5xl font-bold text-white leading-[1.15] mb-6 max-w-3xl">
              Existing tools were built for a{" "}
              <span className="text-slate-500">different era</span>
            </h2>
          </Stagger>

          <Stagger visible={visible} delay={200}>
            <p className="text-lg text-slate-400 leading-relaxed max-w-2xl mb-10">
              Today&apos;s maritime tracking platforms are designed for commercial logistics &mdash;
              not threat detection. They show you where ships say they are, not where they actually are.
            </p>
          </Stagger>

          <div className="max-w-3xl w-full space-y-3">
            {[
              {
                name: "MarineTraffic / VesselFinder",
                what: "AIS aggregation and vessel tracking",
                gap: "No anomaly detection. No behavioral analysis. Trusts all AIS data at face value.",
                delay: 350,
              },
              {
                name: "LRIT / VMS",
                what: "Government-mandated position reporting",
                gap: "Low update frequency (every 6 hours). Siloed across agencies. No real-time alerting.",
                delay: 500,
              },
              {
                name: "Radar / ELINT",
                what: "Military electronic surveillance",
                gap: "Expensive, short range, requires dedicated naval assets on station.",
                delay: 650,
              },
              {
                name: "Manual Watch",
                what: "Human operators monitoring screens",
                gap: "Cannot scale. Fatigue-prone. Hours to detect anomalies that algorithms catch in seconds.",
                delay: 800,
              },
            ].map((item) => (
              <Stagger key={item.name} visible={visible} delay={item.delay}>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 flex items-start gap-5">
                  <div className="shrink-0 w-48">
                    <div className="text-sm font-semibold text-white">{item.name}</div>
                    <div className="text-[11px] text-slate-600 mt-0.5">{item.what}</div>
                  </div>
                  <div className="flex-1 flex items-start gap-3">
                    <div className="shrink-0 mt-0.5 text-red-400/60">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </div>
                    <p className="text-[12px] text-slate-400 leading-relaxed">{item.gap}</p>
                  </div>
                </div>
              </Stagger>
            ))}
          </div>
        </SlideLayout>
      ),
    },

    /* ── 4: Enter HarborOS ─────────────────────────── */
    {
      id: "enter",
      render: (visible) => (
        <SlideLayout center>
          <Stagger visible={visible} delay={0}>
            <div className="w-20 h-20 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-8 mx-auto"
              style={{ boxShadow: "0 0 60px rgba(59, 130, 246, 0.2)" }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
              </svg>
            </div>
          </Stagger>

          <Stagger visible={visible} delay={200}>
            <h2 className="text-5xl font-bold text-white leading-[1.15] mb-4 text-center">
              What if you could see{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                everything?
              </span>
            </h2>
          </Stagger>

          <Stagger visible={visible} delay={400}>
            <p className="text-lg text-slate-400 leading-relaxed max-w-xl text-center mb-10">
              HarborOS fuses AIS intelligence, anomaly detection, satellite imagery,
              and computer vision into a single operating picture.
            </p>
          </Stagger>

          <div className="flex items-center gap-6 mb-8">
            {[
              { label: "AIS Intelligence", icon: "M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M9.172 14.828a4 4 0 010-5.656m5.656 0a4 4 0 010 5.656M12 12h.01", color: "text-cyan-400", delay: 600 },
              { label: "Anomaly Detection", icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z", color: "text-orange-400", delay: 700 },
              { label: "Satellite Verification", icon: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z", color: "text-yellow-400", delay: 800 },
              { label: "Computer Vision", icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z", color: "text-green-400", delay: 900 },
            ].map((item) => (
              <Stagger key={item.label} visible={visible} delay={item.delay}>
                <div className="flex flex-col items-center gap-2">
                  <div className={`w-12 h-12 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-center ${item.color}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d={item.icon} />
                    </svg>
                  </div>
                  <span className="text-[10px] text-slate-500 tracking-wider uppercase">{item.label}</span>
                </div>
              </Stagger>
            ))}
          </div>

          <Stagger visible={visible} delay={1000}>
            <p className="text-sm text-cyan-400/80 tracking-wide animate-pulse">
              Press <span className="font-mono bg-white/5 px-2 py-0.5 rounded text-white">&#8594;</span> to see it live
            </p>
          </Stagger>
        </SlideLayout>
      ),
    },
  ];
}

/* ── Layout helpers ────────────────────────────────── */

function SlideLayout({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className={`h-full flex flex-col ${center ? "items-center justify-center" : "justify-center"} px-16 max-w-5xl mx-auto`}>
      {children}
    </div>
  );
}

function Stagger({ children, visible, delay }: { children: React.ReactNode; visible: boolean; delay: number }) {
  return (
    <div
      style={{
        transition: `opacity 500ms ease ${delay}ms, transform 500ms ease ${delay}ms`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(18px)",
      }}
    >
      {children}
    </div>
  );
}

/* ── Grid background ───────────────────────────────── */
const GRID_LINES = 24;

function GridBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: GRID_LINES }).map((_, i) => (
        <div key={`h${i}`} className="absolute left-0 right-0 h-px" style={{ top: `${(i / GRID_LINES) * 100}%`, background: "rgba(59,130,246,0.03)" }} />
      ))}
      {Array.from({ length: GRID_LINES }).map((_, i) => (
        <div key={`v${i}`} className="absolute top-0 bottom-0 w-px" style={{ left: `${(i / GRID_LINES) * 100}%`, background: "rgba(59,130,246,0.03)" }} />
      ))}
    </div>
  );
}

/* ── Radar canvas ──────────────────────────────────── */

function RadarCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 400;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let angle = 0;
    let frame: number;

    const blips = [
      { x: 0.3, y: 0.25 }, { x: 0.65, y: 0.35 }, { x: 0.7, y: 0.6 },
      { x: 0.25, y: 0.7 }, { x: 0.55, y: 0.2 }, { x: 0.4, y: 0.75 },
    ];

    const draw = () => {
      const cx = size / 2, cy = size / 2, r = size / 2 - 20;
      ctx.clearRect(0, 0, size, size);

      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (r * i) / 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(59,130,246,${0.06 + i * 0.02})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(59,130,246,0.08)";
      ctx.beginPath();
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
      ctx.stroke();

      for (let i = 0; i < 60; i++) {
        const a = angle - (i * Math.PI) / 90;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, a, a + Math.PI / 90); ctx.closePath();
        ctx.fillStyle = `rgba(34,211,238,${(1 - i / 60) * 0.15})`;
        ctx.fill();
      }

      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      ctx.strokeStyle = "rgba(34,211,238,0.6)"; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(34,211,238,0.8)"; ctx.fill();

      blips.forEach((b) => {
        const bx = b.x * size, by = b.y * size;
        const blipAngle = Math.atan2(by - cy, bx - cx);
        const diff = ((angle - blipAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const brightness = diff < 0.8 ? Math.max(0, 1 - diff / 0.8) : 0;
        ctx.beginPath();
        ctx.arc(bx, by, brightness > 0.05 ? 2 + brightness * 2 : 2, 0, Math.PI * 2);
        ctx.fillStyle = brightness > 0.05 ? `rgba(34,211,238,${0.3 + brightness * 0.7})` : "rgba(34,211,238,0.2)";
        ctx.fill();
        if (brightness > 0.05) {
          ctx.beginPath(); ctx.arc(bx, by, 6 + brightness * 6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(34,211,238,${brightness * 0.15})`; ctx.fill();
        }
      });

      angle += 0.015;
      frame = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="absolute pointer-events-none" style={{ opacity: 0.4, top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>
      <canvas ref={canvasRef} style={{ width: 400, height: 400 }} />
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────── */

export default function StartPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"landing" | "slides">("landing");
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideVisible, setSlideVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  const slides = useRef(buildSlides()).current;
  const totalSlides = slides.length - 1; // exclude title slide

  const vesselCount = useAnimatedCount(100000, 2200, 800, mode === "landing");
  const waterwayCount = useAnimatedCount(9, 1200, 1000, mode === "landing");
  const detectorCount = useAnimatedCount(11, 1400, 1200, mode === "landing");

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  /* Enter slideshow */
  const startDemo = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setMode("slides");
      setSlideIndex(1); // skip title slide
      setExiting(false);
      // stagger the content appearing
      setTimeout(() => setSlideVisible(true), 50);
    }, 500);
  }, []);

  /* Navigate slides */
  const goNext = useCallback(() => {
    if (slideIndex >= slides.length - 1) {
      // Last slide → transition to dashboard with demo
      setSlideVisible(false);
      setTimeout(() => router.push("/?tour=1"), 500);
      return;
    }
    setSlideVisible(false);
    setTimeout(() => {
      setSlideIndex((i) => i + 1);
      setTimeout(() => setSlideVisible(true), 50);
    }, 350);
  }, [slideIndex, slides.length, router]);

  const goPrev = useCallback(() => {
    if (slideIndex <= 1) return;
    setSlideVisible(false);
    setTimeout(() => {
      setSlideIndex((i) => i - 1);
      setTimeout(() => setSlideVisible(true), 50);
    }, 350);
  }, [slideIndex]);

  const goToLanding = useCallback(() => {
    setSlideVisible(false);
    setTimeout(() => {
      setMode("landing");
      setSlideIndex(0);
      setExiting(false);
    }, 400);
  }, []);

  /* Keyboard nav */
  useEffect(() => {
    if (mode !== "slides") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      if (e.key === "Escape") goToLanding();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, goNext, goPrev, goToLanding]);

  const handleEnterDashboard = () => {
    setExiting(true);
    setTimeout(() => router.push("/"), 500);
  };

  return (
    <div
      className="h-screen w-screen overflow-hidden relative"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #0c1a2e 0%, #060a14 50%, #020408 100%)" }}
    >
      <GridBg />

      {/* Glow orbs */}
      <div className="absolute w-[600px] h-[600px] rounded-full pointer-events-none" style={{ top: "10%", left: "50%", transform: "translateX(-50%)", background: "radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)" }} />
      <div className="absolute w-[400px] h-[400px] rounded-full pointer-events-none" style={{ bottom: "5%", right: "10%", background: "radial-gradient(circle, rgba(34,211,238,0.05) 0%, transparent 70%)" }} />

      {/* ── Landing Mode ──────────────────────────── */}
      {mode === "landing" && (
        <div
          className="relative z-10 h-full flex flex-col items-center justify-center"
          style={{
            transition: "opacity 500ms ease, transform 500ms ease",
            opacity: exiting ? 0 : mounted ? 1 : 0,
            transform: exiting ? "scale(1.03)" : mounted ? "scale(1)" : "scale(0.95)",
          }}
        >
          <RadarCanvas />

          <div className="relative flex flex-col items-center">
            <Stagger visible={mounted && !exiting} delay={200}>
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 mx-auto" style={{ boxShadow: "0 0 40px rgba(59,130,246,0.15)" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                  <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
                </svg>
              </div>
            </Stagger>

            <Stagger visible={mounted && !exiting} delay={400}>
              <h1 className="text-6xl font-bold tracking-tight mb-3 text-center">
                <span className="text-white">HARBOR</span>
                <span className="text-blue-400">OS</span>
              </h1>
            </Stagger>

            <Stagger visible={mounted && !exiting} delay={550}>
              <p className="text-lg text-slate-400 tracking-wide mb-2 text-center">Maritime Domain Awareness Platform</p>
            </Stagger>

            <Stagger visible={mounted && !exiting} delay={650}>
              <p className="text-sm text-slate-600 tracking-widest uppercase mb-12 text-center">
                Autonomous Threat Detection &middot; Real-Time Intelligence
              </p>
            </Stagger>

            <Stagger visible={mounted && !exiting} delay={800}>
              <div className="flex items-center gap-8 mb-14">
                <StatBlock value={vesselCount.toLocaleString()} label="Vessels Daily" suffix="+" />
                <div className="w-px h-10 bg-slate-800" />
                <StatBlock value={String(waterwayCount)} label="Contested Waterways" />
                <div className="w-px h-10 bg-slate-800" />
                <StatBlock value={String(detectorCount)} label="Anomaly Detectors" />
              </div>
            </Stagger>

            <Stagger visible={mounted && !exiting} delay={1000}>
              <div className="flex flex-col items-center gap-3">
                <button onClick={handleEnterDashboard} className="group relative">
                  <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-blue-500/20 to-cyan-500/20 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative flex items-center gap-3 bg-blue-600/90 hover:bg-blue-500 text-white font-semibold text-sm tracking-wide px-8 py-3.5 rounded-xl border border-blue-400/20 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20">
                    Launch Dashboard
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:translate-x-1">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>

                <button onClick={startDemo} className="group flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-400 transition-colors duration-300 px-4 py-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="transition-transform duration-300 group-hover:scale-110">
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                  Demo
                </button>
              </div>
            </Stagger>
          </div>

          {/* Tech badges */}
          <div className="absolute bottom-12 flex items-center gap-3" style={{ transition: "opacity 600ms ease", transitionDelay: "1200ms", opacity: mounted && !exiting ? 1 : 0 }}>
            {["AIS Intelligence", "Fuzzy Inference", "Satellite Verification", "Computer Vision", "Edge Computing"].map((t) => (
              <span key={t} className="text-[10px] text-slate-600 tracking-wider uppercase px-3 py-1.5 rounded-full border border-slate-800/60 bg-slate-900/30">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Slideshow Mode ────────────────────────── */}
      {mode === "slides" && (
        <div className="relative z-10 h-full">
          {/* Slide content */}
          <div className="h-full">
            {slides[slideIndex]?.render(slideVisible)}
          </div>

          {/* Bottom bar */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-8 py-5">
            {/* Left: back / logo */}
            <button onClick={slideIndex <= 1 ? goToLanding : goPrev} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-300 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              {slideIndex <= 1 ? "Back" : "Previous"}
            </button>

            {/* Center: progress dots + slide number */}
            <div className="flex items-center gap-4">
              <div className="flex gap-1.5">
                {Array.from({ length: totalSlides }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i + 1 === slideIndex
                        ? "w-6 bg-blue-400"
                        : i + 1 < slideIndex
                          ? "w-1.5 bg-blue-400/30"
                          : "w-1.5 bg-slate-700"
                    }`}
                  />
                ))}
              </div>
              <span className="text-[10px] text-slate-600 font-mono">
                {slideIndex} / {totalSlides}
              </span>
            </div>

            {/* Right: next */}
            <button onClick={goNext} className="flex items-center gap-2 text-sm font-semibold text-white bg-blue-600/80 hover:bg-blue-500 px-5 py-2 rounded-lg transition-colors">
              {slideIndex >= slides.length - 1 ? "See it Live" : "Next"}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Keyboard hint */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
            <p className="text-[9px] text-slate-700 tracking-wider">
              Arrow keys or Space to navigate &middot; Esc to exit
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Stat block ────────────────────────────────────── */

function StatBlock({ value, label, suffix }: { value: string; label: string; suffix?: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-mono font-bold text-white tracking-tight">
        {value}
        {suffix && <span className="text-blue-400 text-lg">{suffix}</span>}
      </div>
      <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">{label}</div>
    </div>
  );
}
