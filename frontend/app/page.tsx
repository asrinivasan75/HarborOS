import Link from "next/link";
import { SiteNav, SiteFooter } from "@/app/components/SiteChrome";
import LaunchButton from "@/app/components/LaunchButton";

export default function Landing() {
  return (
    <main className="min-h-screen">
      <SiteNav />
      <Hero />
      <Features />
      <ConsolePreview />
      <SiteFooter />
    </main>
  );
}

function Hero() {
  return (
    <section className="max-w-[1400px] mx-auto px-8 pt-20 pb-24 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-16 items-center">
      <div>
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.02] text-[11.5px] text-slate-400 font-mono mb-7">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          v2.4 · Sentinel-2 fusion
        </div>

        <h1 className="text-[44px] lg:text-[52px] leading-[1.04] tracking-[-0.03em] font-semibold mb-5">
          Maritime intelligence,
          <br />
          <span className="gradient-text">for every horizon.</span>
        </h1>

        <p className="text-[15.5px] leading-[1.55] text-slate-400 max-w-[520px] mb-8">
          Live AIS, satellite fusion, and behavioral detection across nine contested waterways. Built for operators who decide in seconds and answer in hours.
        </p>

        <div className="flex flex-wrap gap-2.5 items-center mb-12">
          <LaunchButton className="btn-primary text-[13px] px-4 py-2 rounded-md inline-flex items-center gap-2" />
          <a href="#preview" className="btn-secondary text-[13px] px-4 py-2 rounded-md inline-flex items-center gap-2 backdrop-blur">
            See the console
          </a>
        </div>

        <div className="flex flex-wrap gap-x-10 gap-y-5 pt-7 border-t border-white/[0.06]">
          <Proof n="14,287" l="Tracked today" />
          <Proof n="1.4s" l="Latency" />
          <Proof n="99.2%" l="Precision (30d)" />
          <Proof n="9" l="Sectors" />
        </div>
      </div>

      <UiStack />
    </section>
  );
}

function Proof({ n, l }: { n: string; l: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[20px] font-semibold tracking-[-0.02em] tabular-nums">{n}</div>
      <div className="text-[11.5px] text-slate-500 font-medium">{l}</div>
    </div>
  );
}

function UiStack() {
  return (
    <div className="relative w-full min-h-[440px]">
      {/* Map card */}
      <div className="absolute top-0 right-0 w-[460px] max-w-full h-[320px] glass rounded-xl p-4 overflow-hidden">
        <div className="flex justify-between items-center mb-2.5">
          <h3 className="text-[12.5px] font-semibold text-slate-200">LA Harbor</h3>
          <span className="font-mono text-[10px] text-slate-400 py-0.5 px-2 rounded-full bg-white/[0.04] border border-white/[0.06]">149 active</span>
        </div>
        <div className="relative w-full h-[calc(100%-28px)] rounded-lg overflow-hidden bg-[#0a0e1a]">
          <div aria-hidden className="absolute inset-0 opacity-50"
               style={{
                 backgroundImage: "linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px)",
                 backgroundSize: "32px 32px"
               }} />
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 500 340" preserveAspectRatio="none">
            <path d="M 0 180 Q 80 160 160 170 Q 240 180 320 175 Q 400 170 500 180" stroke="rgba(255,255,255,.08)" strokeWidth="1" fill="none" />
            <path d="M 0 220 Q 100 210 200 220 Q 300 230 400 225 Q 450 220 500 225" stroke="rgba(255,255,255,.05)" strokeWidth="1" fill="none" />
          </svg>
          <Dot color="green" top="30%" left="20%" />
          <Dot color="green" top="36%" left="32%" />
          <Dot color="green" top="42%" left="48%" />
          <Dot color="amber" top="50%" left="62%" />
          <Dot color="red" top="45%" left="72%" />
          <Dot color="green" top="60%" left="28%" />
          <Dot color="green" top="68%" left="55%" />
          <Dot color="amber" top="72%" left="82%" />
        </div>
      </div>

      {/* Alert card */}
      <div className="absolute top-[220px] -left-4 sm:-left-6 lg:-left-10 w-[320px] max-w-[92vw] glass rounded-xl p-4">
        <div className="flex justify-between items-start mb-2.5">
          <div className="min-w-0">
            <h4 className="text-[14px] font-semibold leading-tight truncate">MV Jade Star</h4>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">MMSI 538007493</div>
          </div>
          <span className="text-[9.5px] font-semibold py-0.5 px-2 rounded-full bg-red-400/12 text-red-300 border border-red-400/25 uppercase tracking-[0.1em] shrink-0">Escalate</span>
        </div>
        <Signal name="Dark transit" w={98} />
        <Signal name="Geofence breach" w={92} />
        <Signal name="AIS spoofing" w={84} />
        <Signal name="Loitering" w={76} />
      </div>

      {/* Stats card */}
      <div className="absolute top-[380px] right-4 w-[280px] max-w-[88%] glass rounded-xl p-3.5 flex gap-4">
        <div className="flex-1">
          <div className="text-[20px] font-semibold tracking-[-0.02em] text-amber-300 tabular-nums leading-none">47</div>
          <div className="text-[10.5px] text-slate-400 mt-1">Active alerts</div>
        </div>
        <div className="w-px bg-white/[0.08]" />
        <div className="flex-1">
          <div className="text-[20px] font-semibold tracking-[-0.02em] text-emerald-300 tabular-nums leading-none">99.98%</div>
          <div className="text-[10.5px] text-slate-400 mt-1">Ingest uptime</div>
        </div>
      </div>
    </div>
  );
}

function Dot({ color, top, left }: { color: "green" | "amber" | "red"; top: string; left: string }) {
  const colorMap = {
    green: "bg-emerald-400",
    amber: "bg-amber-400",
    red: "bg-red-400",
  };
  return (
    <div
      className={`absolute w-[7px] h-[7px] rounded-full -translate-x-1/2 -translate-y-1/2 ${colorMap[color]}`}
      style={{ top, left }}
    />
  );
}

function Signal({ name, w }: { name: string; w: number }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-t border-white/[0.04] first:border-t-0">
      <span className="text-[12px] text-slate-300">{name}</span>
      <div className="flex items-center gap-2.5">
        <div className="w-[56px] h-[3px] bg-white/[0.06] rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-red-400/70" style={{ width: `${w}%` }} />
        </div>
        <span className="font-mono text-[10.5px] text-slate-400 tabular-nums w-6 text-right">{w}</span>
      </div>
    </div>
  );
}

function Features() {
  const detectors = [
    { name: "Dark transit", w: 96 },
    { name: "AIS spoofing", w: 88 },
    { name: "Geofence breach", w: 80 },
    { name: "Loitering", w: 72 },
    { name: "Rendezvous", w: 64 },
    { name: "Route deviation", w: 54 },
    { name: "Speed anomaly", w: 46 },
    { name: "Heading anomaly", w: 40 },
  ];

  return (
    <section className="max-w-[1400px] mx-auto px-8">
      {/* Inline counter strip */}
      <div className="flex items-center flex-wrap gap-x-8 gap-y-3 py-5 px-6 rounded-xl border border-white/[0.06] bg-white/[0.015] mb-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] tracking-[0.16em] text-slate-500 uppercase">Detectors</span>
          <span className="font-mono text-[17px] font-semibold tabular-nums">11</span>
        </div>
        <span className="w-px h-5 bg-white/[0.08]" />
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] tracking-[0.16em] text-slate-500 uppercase">Sectors</span>
          <span className="font-mono text-[17px] font-semibold tabular-nums">9</span>
        </div>
        <span className="w-px h-5 bg-white/[0.08]" />
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] tracking-[0.16em] text-slate-500 uppercase">Vessels · 24h</span>
          <span className="font-mono text-[17px] font-semibold tabular-nums">14,287</span>
        </div>
        <span className="w-px h-5 bg-white/[0.08]" />
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] tracking-[0.16em] text-slate-500 uppercase">Ingest latency</span>
          <span className="font-mono text-[17px] font-semibold tabular-nums">1.4s</span>
        </div>
        <span className="w-px h-5 bg-white/[0.08]" />
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] tracking-[0.16em] text-slate-500 uppercase">Satellites</span>
          <span className="font-mono text-[17px] font-semibold tabular-nums">Sentinel-2</span>
        </div>
      </div>

      {/* Asymmetric spotlight — detectors on left, two stacked cards on right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3">
        {/* Left: detector signal panel */}
        <div className="glass rounded-xl p-6 relative overflow-hidden">
          <div aria-hidden className="absolute top-0 right-0 w-64 h-64 bg-violet-500/[0.04] rounded-full blur-3xl -translate-y-20 translate-x-20" />
          <div className="relative">
            <div className="flex items-baseline justify-between mb-5">
              <div>
                <div className="text-[10.5px] font-mono tracking-[0.18em] text-slate-500 uppercase mb-1">Behavioral detectors</div>
                <h3 className="text-[20px] font-semibold tracking-[-0.01em]">Eleven signals, running continuously.</h3>
              </div>
              <div className="font-mono text-[10.5px] text-slate-500 tracking-[0.12em] uppercase hidden md:block">Live signal</div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {detectors.map((d) => (
                <div key={d.name} className="flex items-center gap-3 py-1.5 border-t border-white/[0.04] first:border-t-0">
                  <span className="text-[12px] text-slate-300 flex-1 truncate">{d.name}</span>
                  <div className="w-[80px] h-[3px] bg-white/[0.05] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-400/70 to-cyan-400/70"
                      style={{ width: `${d.w}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10.5px] text-slate-500 tabular-nums w-6 text-right">{d.w}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: two stacked cards */}
        <div className="flex flex-col gap-3">
          <div className="glass rounded-xl p-5 flex-1 relative overflow-hidden">
            <div aria-hidden className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/[0.05] rounded-full blur-2xl -translate-y-10 translate-x-10" />
            <div className="relative">
              <div className="w-9 h-9 rounded-lg mb-3 border border-cyan-400/25 bg-cyan-500/[0.06] flex items-center justify-center text-cyan-300">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>
              </div>
              <h4 className="text-[14px] font-semibold mb-1 text-slate-100">Sentinel-2 fusion</h4>
              <p className="text-[12.5px] text-slate-400 leading-[1.55]">10 m optical, live Copernicus catalog. Verify any contact on the map in one click.</p>
            </div>
          </div>

          <div className="glass rounded-xl p-5 flex-1 relative overflow-hidden">
            <div aria-hidden className="absolute top-0 right-0 w-32 h-32 bg-pink-500/[0.05] rounded-full blur-2xl -translate-y-10 translate-x-10" />
            <div className="relative">
              <div className="w-9 h-9 rounded-lg mb-3 border border-pink-400/25 bg-pink-500/[0.06] flex items-center justify-center text-pink-300">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></svg>
              </div>
              <h4 className="text-[14px] font-semibold mb-1 text-slate-100">Signed incident reports</h4>
              <p className="text-[12.5px] text-slate-400 leading-[1.55]">PDF briefs with audit chain intact. Interagency-ready. Exported from the vessel panel.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ConsolePreview() {
  return (
    <section id="preview" className="max-w-[1400px] mx-auto px-8 pt-24 pb-24">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-[10.5px] font-mono tracking-[0.22em] text-slate-500 uppercase mb-2">The Console</div>
          <h2 className="text-[30px] font-semibold tracking-[-0.02em] leading-[1.15]">Every signal, one view.</h2>
          <p className="text-[13.5px] text-slate-400 mt-2 max-w-[440px] leading-[1.5]">
            Contacts, sectors, triage queue, and verification at operator tempo.
          </p>
        </div>
        <LaunchButton className="btn-primary text-[13px] px-4 py-2 rounded-md inline-flex items-center gap-2">
          Open console <span aria-hidden>→</span>
        </LaunchButton>
      </div>

      <div className="glass rounded-xl overflow-hidden border border-white/[0.08]">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.015]">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          </div>
          <div className="mx-auto font-mono text-[10.5px] text-slate-500 px-2.5 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.05]">
            harboros.app/dashboard
          </div>
          <div className="w-16" />
        </div>
        <div className="grid grid-cols-[200px_1fr_320px] h-[440px]">
          {/* sectors */}
          <aside className="border-r border-white/[0.06] p-2 overflow-hidden">
            <div className="text-[9.5px] font-mono uppercase tracking-[0.18em] text-slate-500 px-2 py-1.5">Sectors · 9</div>
            {[
              ["Los Angeles Harbor", "crit", 12, true],
              ["Strait of Hormuz", "warn", 8],
              ["Black Sea", "warn", 6],
              ["Taiwan Strait", "n", 4],
              ["South China Sea", "n", 5],
              ["English Channel", "n", 3],
              ["Eastern Med", "n", 4],
            ].map(([name, kind, count, active]) => (
              <div key={String(name)} className={`flex justify-between items-center px-2.5 py-2 rounded-md text-[11.5px] ${active ? "bg-white/[0.05] text-slate-100" : "text-slate-400 hover:bg-white/[0.02]"}`}>
                <span className="font-medium">{name}</span>
                <span className={`font-mono text-[10px] px-1.5 py-0 rounded ${
                  kind === "crit" ? "bg-red-400/12 text-red-300"
                    : kind === "warn" ? "bg-amber-400/12 text-amber-300"
                    : "text-slate-500"
                }`}>{count}</span>
              </div>
            ))}
          </aside>

          {/* map */}
          <div className="relative overflow-hidden bg-[#0a0e1a]">
            <div aria-hidden className="absolute inset-0"
                 style={{
                   backgroundImage: "linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px)",
                   backgroundSize: "44px 44px"
                 }} />
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1000 600" preserveAspectRatio="none">
              <path d="M 80 300 Q 180 280 280 290 T 460 310 L 510 280 Q 560 270 600 300 L 650 330 Q 720 340 780 310 T 960 340" stroke="rgba(255,255,255,.08)" strokeWidth="1" fill="none" />
              <path d="M 80 360 Q 200 380 320 360 T 560 380 L 600 400 Q 680 410 780 385 T 960 405" stroke="rgba(255,255,255,.05)" strokeWidth="1" fill="none" />
            </svg>
            {[
              ["g", 30, 18], ["g", 26, 24], ["g", 44, 33], ["a", 52, 42],
              ["r", 38, 51], ["a", 56, 58], ["g", 41, 66], ["g", 49, 72],
              ["r", 34, 79], ["g", 62, 47], ["a", 68, 29], ["g", 71, 54],
            ].map(([c, t, l], i) => (
              <Dot key={i} color={c === "g" ? "green" : c === "a" ? "amber" : "red"} top={`${t}%`} left={`${l}%`} />
            ))}
            <div className="absolute top-4 left-4 p-3.5 rounded-lg min-w-[220px] glass-strong">
              <div className="text-[9.5px] font-semibold text-slate-500 tracking-[0.14em] uppercase mb-1.5">Contact</div>
              <div className="text-[13.5px] font-semibold">MV Jade Star</div>
              <div className="text-[10.5px] text-slate-500 font-mono mt-0.5 mb-3">MMSI 538007493</div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-2">
                <KV l="Speed" v="3.2 kn" />
                <KV l="Heading" v="247°" />
                <KV l="Risk" v="100" vClass="text-red-300" />
                <KV l="Last seen" v="47s" />
              </div>
            </div>
          </div>

          {/* triage */}
          <aside className="border-l border-white/[0.06] overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-white/[0.06]">
              <h3 className="text-[12px] font-semibold text-slate-100">Triage</h3>
              <span className="font-mono text-[10px] text-red-300">47 active</span>
            </div>
            <div className="p-1.5 space-y-1 overflow-auto h-[calc(100%-45px)]">
              <TriageItem name="MV Jade Star" desc="Dark transit; manifest inconsistent." mmsi="538007493" risk={100} tier="r" tags={["Dark transit","Geofence"]} selected />
              <TriageItem name="Lohanka" desc="47min AIS gap; identity altered." mmsi="319563000" risk={94} tier="r" tags={["Spoofing"]} />
              <TriageItem name="F/V Victoire" desc="Loitering near restricted zone." mmsi="227313580" risk={78} tier="a" tags={["Loitering"]} />
              <TriageItem name="Tenacity" desc="Draft / manifest mismatch." mmsi="338126674" risk={71} tier="a" tags={["Draft"]} />
              <TriageItem name="Amber Bee" desc="Rendezvous with AIS-dark contact." mmsi="229456000" risk={62} tier="c" tags={["Rendezvous"]} />
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function KV({ l, v, vClass }: { l: string; v: string; vClass?: string }) {
  return (
    <div>
      <div className="text-[9.5px] font-semibold text-slate-500 tracking-[0.14em] uppercase">{l}</div>
      <div className={`font-mono text-[12px] font-medium tabular-nums mt-0.5 ${vClass ?? ""}`}>{v}</div>
    </div>
  );
}

function TriageItem({ name, desc, mmsi, risk, tier, tags, selected }: {
  name: string; desc: string; mmsi: string; risk: number;
  tier: "r" | "a" | "c"; tags: string[]; selected?: boolean;
}) {
  const riskColor = tier === "r" ? "text-red-300" : tier === "a" ? "text-amber-300" : "text-cyan-300";
  return (
    <div className={`p-2.5 rounded-lg cursor-pointer transition-colors border ${
      selected
        ? "bg-white/[0.04] border-white/[0.08]"
        : "border-transparent hover:bg-white/[0.02]"
    }`}>
      <div className="flex justify-between gap-2 mb-0.5">
        <div className="text-[12.5px] font-semibold leading-tight text-slate-100">{name}</div>
        <div className={`text-[15px] font-bold tabular-nums leading-none tracking-[-0.02em] ${riskColor}`}>{risk}</div>
      </div>
      <div className="text-[11px] text-slate-500 leading-[1.45] mb-1.5 line-clamp-1">{desc}</div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {tags.map((t) => (
          <span key={t} className={`text-[9.5px] px-1.5 py-[1px] rounded border font-medium ${
            tier === "r"
              ? "bg-red-400/8 text-red-300/90 border-red-400/20"
              : tier === "a"
              ? "bg-amber-400/8 text-amber-300/90 border-amber-400/20"
              : "bg-cyan-400/8 text-cyan-300/90 border-cyan-400/20"
          }`}>{t}</span>
        ))}
      </div>
      <div className="font-mono text-[9.5px] text-slate-600 flex justify-between tabular-nums">
        <span>MMSI {mmsi}</span>
        <span>15:41 UTC</span>
      </div>
    </div>
  );
}

