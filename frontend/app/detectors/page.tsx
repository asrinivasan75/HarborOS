import { SiteNav, SiteFooter, PageHero } from "@/app/components/SiteChrome";
import Reveal from "@/app/components/Reveal";

export default function DetectorsPage() {
  return (
    <main id="main" className="min-h-screen">
      <SiteNav active="Detectors" />
      <PageHero
        eyebrow="11 detectors · normalized"
        title="Eleven ways to see"
        gradient="what shouldn't be happening."
        body="Every position, every track, every second. The behavioral detectors run continuously and report normalized confidence scores so the triage queue stays ranked by priority, not by detector."
        secondaryHref="/dashboard"
        secondaryLabel="See them running"
      />

      <section className="max-w-[1100px] mx-auto px-8 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DETECTORS.map((d, i) => (
            <Reveal key={d.name} delay={(i % 2) * 80}>
              <DetectorCard {...d} />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="max-w-[1100px] mx-auto px-8 pb-24">
        <Reveal>
        <div className="glass rounded-2xl p-8">
          <div className="flex items-baseline gap-3 mb-4">
            <span className="font-mono text-[13px] tabular-nums text-pink-300">03</span>
            <span className="w-6 h-px bg-white/[0.12]" />
            <span className="text-[13px] text-slate-300 font-medium tracking-tight">How they compose</span>
          </div>
          <h3 className="text-[22px] font-semibold tracking-[-0.02em] mb-4 max-w-[680px]">
            Signals fuse into a single risk score per vessel.
          </h3>
          <p className="text-[13.5px] text-slate-400 leading-[1.6] max-w-[680px] mb-6">
            Each detector emits a confidence between 0 and 1. Scores are weighted by sector context — a geofence breach in Hormuz carries more weight than the same breach in the Channel — then combined into a normalized 0–100 risk score with MARSEC tiering.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <TierPill color="text-emerald-300 border-emerald-400/25 bg-emerald-400/8" label="Normal" range="0–34" />
            <TierPill color="text-yellow-300 border-yellow-400/25 bg-yellow-400/8" label="Monitor" range="35–59" />
            <TierPill color="text-amber-300 border-amber-400/25 bg-amber-400/8" label="Verify" range="60–79" />
            <TierPill color="text-red-300 border-red-400/25 bg-red-400/8" label="Escalate" range="80–100" />
          </div>
        </div>
        </Reveal>
      </section>

      <SiteFooter />
    </main>
  );
}

function DetectorCard({ name, kicker, body, signals }: {
  name: string;
  kicker: string;
  body: string;
  signals: string[];
}) {
  return (
    <div className="glass rounded-xl p-5 hover:border-white/[0.12] transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div>
          <h3 className="text-[14px] font-semibold text-slate-100 leading-tight">{name}</h3>
          <div className="text-[10.5px] font-mono tracking-[0.12em] uppercase text-slate-500 mt-1">{kicker}</div>
        </div>
      </div>
      <p className="text-[12.5px] text-slate-400 leading-[1.6] mb-4">{body}</p>
      <div className="flex flex-wrap gap-1.5 pt-3 border-t border-white/[0.05]">
        {signals.map((s) => (
          <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-slate-400 font-mono">
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function TierPill({ color, label, range }: { color: string; label: string; range: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${color}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em]">{label}</div>
      <div className="font-mono text-[14px] tabular-nums font-semibold mt-1">{range}</div>
    </div>
  );
}

const DETECTORS = [
  {
    name: "Dark transit",
    kicker: "AIS continuity",
    body: "Identifies vessels going dark — turning AIS off mid-transit through monitored waters. Weighted by prior dwell and geofence proximity.",
    signals: ["ais_gap", "dark_vessel", "zone_lingering"],
  },
  {
    name: "AIS spoofing",
    kicker: "Identity integrity",
    body: "Detects MMSI swaps, impossible jumps, and inconsistent static fields. Flags vessels whose reported identity doesn't match kinematic history.",
    signals: ["identity_change", "kinematic_implausibility"],
  },
  {
    name: "Loitering",
    kicker: "Behavioral",
    body: "Course-change intensity formula catches active loitering distinct from anchorage. Speed threshold separates idle hulls from surveillance patterns.",
    signals: ["low_speed", "course_variance"],
  },
  {
    name: "Rendezvous",
    kicker: "Contact fusion",
    body: "Two vessels closing to within transfer range, one of them dark. Often precedes ship-to-ship transfers or sanctions evasion.",
    signals: ["proximity", "dark_pair"],
  },
  {
    name: "Geofence breach",
    kicker: "Zone enforcement",
    body: "Entry into restricted, exclusion, or sensitive zones. Configurable per sector — Taiwan median line, Hormuz TSS, Azov exclusion.",
    signals: ["zone_entry", "tss_violation"],
  },
  {
    name: "Speed anomaly",
    kicker: "Kinematic",
    body: "Departures from the vessel's own historical speed baseline, not static thresholds. Captures both unusual sprints and unexplained drifts.",
    signals: ["speed_outlier", "baseline_drift"],
  },
  {
    name: "Heading anomaly",
    kicker: "Kinematic",
    body: "Erratic heading changes inconsistent with vessel type and traffic density. Tuned to distinguish fishing from evasion.",
    signals: ["heading_variance", "type_mismatch"],
  },
  {
    name: "Route deviation",
    kicker: "Path analysis",
    body: "Track divergence from declared destination or typical corridor. Weighted by distance-to-detour and time-off-path.",
    signals: ["detour", "dest_mismatch"],
  },
  {
    name: "Kinematic implausibility",
    kicker: "Physics gate",
    body: "Positions that imply impossible speeds or heading changes between reports — a common signature of spoofing and replayed tracks.",
    signals: ["impossible_transit", "replay"],
  },
  {
    name: "Statistical outlier",
    kicker: "Population context",
    body: "Per-vessel baselines combined with peer-group distributions flag behaviors that look normal in isolation but not against similar hulls.",
    signals: ["peer_outlier", "baseline_deviation"],
  },
  {
    name: "Collision risk",
    kicker: "CPA analysis",
    body: "Closest-point-of-approach forecasts across tracks. Surfaces near-miss geometries before they materialize — also a proxy for coerced encounters.",
    signals: ["cpa", "tcpa"],
  },
];
