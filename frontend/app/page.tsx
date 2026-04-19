import Link from "next/link";

export default function Landing() {
  return (
    <main className="min-h-screen">
      <Nav />
      <Hero />
      <Features />
      <ConsolePreview />
      <Footer />
    </main>
  );
}

function Nav() {
  return (
    <nav className="max-w-[1400px] mx-auto flex items-center px-8 py-4 gap-10">
      <Link href="/" className="flex items-center gap-2.5">
        <div className="relative w-6 h-6 rounded-md bg-gradient-to-br from-violet-400 to-cyan-400 flex items-center justify-center">
          <div className="absolute inset-[1.5px] rounded-[4px] bg-gradient-to-br from-[#1a1230] to-[#0d1a2a]" />
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" className="relative z-10 text-white">
            <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" />
          </svg>
        </div>
        <span className="text-[14px] font-semibold tracking-tight">HarborOS</span>
      </Link>
      <div className="flex gap-6">
        <NavItem>Product</NavItem>
        <NavItem>Sectors</NavItem>
        <NavItem>Detectors</NavItem>
        <NavItem>Docs</NavItem>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[11px] text-emerald-300 font-mono">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: "subtle-pulse 2.4s infinite" }} />
          Live · 14,287
        </div>
        <Link href="/dashboard" className="btn-primary text-[12.5px] px-3.5 py-1.5 rounded-md inline-flex items-center gap-1.5">
          Launch <span aria-hidden className="text-[14px] leading-none">→</span>
        </Link>
      </div>
    </nav>
  );
}

function NavItem({ children }: { children: React.ReactNode }) {
  return (
    <a href="#" className="text-[13px] font-medium text-slate-400 hover:text-slate-100 transition-colors">
      {children}
    </a>
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
          <Link href="/dashboard" className="btn-primary text-[13px] px-4 py-2 rounded-md inline-flex items-center gap-2">
            Launch Operations <span aria-hidden>→</span>
          </Link>
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
  const feats = [
    {
      color: "#a78bfa",
      title: "Global AIS ingest",
      body: "14,287 vessels streamed. 9 sectors. 24/7.",
      icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>),
    },
    {
      color: "#22d3ee",
      title: "11 behavioral detectors",
      body: "Dark transit, spoofing, loitering, rendezvous, manifest.",
      icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>),
    },
    {
      color: "#f472b6",
      title: "Sentinel-2 fusion",
      body: "10m optical. Verify any contact in one click.",
      icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>),
    },
    {
      color: "#4ade80",
      title: "Exportable reports",
      body: "PDF briefs. Interagency-ready. Signed.",
      icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>),
    },
  ];
  return (
    <section className="max-w-[1400px] mx-auto px-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
      {feats.map((f) => (
        <div key={f.title} className="glass rounded-xl p-5 hover:border-white/[0.12] transition-colors">
          <div className="w-8 h-8 rounded-lg mb-3.5 border border-white/[0.08] bg-white/[0.02] flex items-center justify-center" style={{ color: f.color }}>
            {f.icon}
          </div>
          <h4 className="text-[13px] font-semibold mb-1 text-slate-100">{f.title}</h4>
          <p className="text-[12px] text-slate-500 leading-[1.5]">{f.body}</p>
        </div>
      ))}
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
        <Link href="/dashboard" className="btn-primary text-[13px] px-4 py-2 rounded-md inline-flex items-center gap-2">
          Open console <span aria-hidden>→</span>
        </Link>
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

function Footer() {
  return (
    <footer className="max-w-[1400px] mx-auto px-8 py-8 border-t border-white/[0.06] flex flex-wrap justify-between gap-4 text-[12px] text-slate-500">
      <div>HarborOS · v2.4.1 · AIS + SAR fusion for maritime operators</div>
      <div className="font-mono">© 2026 · Los Angeles, CA</div>
    </footer>
  );
}
