import Link from "next/link";
import { SiteNav, SiteFooter } from "@/app/components/SiteChrome";
import Reveal from "@/app/components/Reveal";

export default function SectorsPage() {
  return (
    <main id="main" className="min-h-screen">
      <SiteNav active="Sectors" />
      <SectorsHero />

      <section id="sector-grid" className="max-w-[1100px] mx-auto px-8 pb-20 pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {SECTORS.map(({ key, ...s }, i) => (
            <Reveal key={key} delay={(i % 3) * 70}>
              <SectorCard {...s} />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="max-w-[1100px] mx-auto px-8 pb-24">
        <Reveal>
        <div className="glass rounded-2xl p-8">
          <div className="flex items-baseline gap-3 mb-4">
            <span className="font-mono text-[13px] tabular-nums text-cyan-300">02</span>
            <span className="w-6 h-px bg-white/[0.12]" />
            <span className="text-[13px] text-slate-300 font-medium tracking-tight">Why these sectors</span>
          </div>
          <h3 className="text-[22px] font-semibold tracking-[-0.02em] mb-4 max-w-[640px]">
            Each corridor moves a critical fraction of global trade, fuel, or force projection.
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <FactStat n="~30%" l="Global oil through Hormuz" />
            <FactStat n="~40%" l="World trade via Malacca" />
            <FactStat n="500+" l="Vessels/day Dover Strait" />
            <FactStat n="9" l="Live sectors now" />
          </div>
        </div>
        </Reveal>
      </section>

      <SiteFooter />
    </main>
  );
}

function SectorCard({ name, region, description, tone, activity }: {
  name: string;
  region: string;
  description: string;
  tone: "crit" | "warn" | "normal";
  activity: string;
}) {
  const toneMap = {
    crit: { pill: "bg-red-400/12 text-red-300 border-red-400/25", dot: "bg-red-400" },
    warn: { pill: "bg-amber-400/12 text-amber-300 border-amber-400/25", dot: "bg-amber-400" },
    normal: { pill: "bg-emerald-400/12 text-emerald-300 border-emerald-400/25", dot: "bg-emerald-400" },
  };
  const t = toneMap[tone];
  return (
    <div className="glass rounded-xl p-5 hover:border-white/[0.12] transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div>
          <h3 className="text-[14px] font-semibold text-slate-100 leading-tight">{name}</h3>
          <div className="text-[10.5px] font-mono tracking-[0.12em] uppercase text-slate-500 mt-1">{region}</div>
        </div>
        <span className={`text-[9.5px] font-semibold py-0.5 px-2 rounded-full border uppercase tracking-[0.1em] shrink-0 flex items-center gap-1.5 ${t.pill}`}>
          <span className={`w-1 h-1 rounded-full ${t.dot}`} />
          {tone === "crit" ? "Critical" : tone === "warn" ? "Elevated" : "Nominal"}
        </span>
      </div>
      <p className="text-[12px] text-slate-400 leading-[1.55] mb-4">{description}</p>
      <div className="font-mono text-[10.5px] text-slate-500 pt-3 border-t border-white/[0.05]">
        {activity}
      </div>
    </div>
  );
}

function FactStat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div className="text-[22px] font-semibold tracking-[-0.02em] tabular-nums leading-none">{n}</div>
      <div className="text-[11px] text-slate-500 mt-1.5">{l}</div>
    </div>
  );
}

// Sector dots on an equirectangular projection — (x%, y%) of a world map frame.
// Roughly matches the real lat/lng for each sector.
const SECTOR_DOTS: { key: string; x: number; y: number; tone: "crit" | "warn" | "normal"; label: string }[] = [
  { key: "la_harbor",        x: 17,  y: 40, tone: "warn",   label: "LA Harbor" },
  { key: "english_channel",  x: 48,  y: 29, tone: "normal", label: "English Channel" },
  { key: "eastern_med",      x: 54.5, y: 38, tone: "warn",   label: "E. Med" },
  { key: "black_sea",        x: 57,  y: 33, tone: "warn",   label: "Black Sea" },
  { key: "sea_of_azov",      x: 58.5, y: 32, tone: "warn",   label: "Azov" },
  { key: "strait_of_hormuz", x: 63,  y: 43, tone: "crit",   label: "Hormuz" },
  { key: "strait_of_malacca",x: 76,  y: 56, tone: "normal", label: "Malacca" },
  { key: "south_china_sea",  x: 81,  y: 52, tone: "warn",   label: "S. China Sea" },
  { key: "taiwan_strait",    x: 83,  y: 46, tone: "crit",   label: "Taiwan Strait" },
];

function SectorsHero() {
  const toneFill: Record<string, string> = {
    crit: "#f87171",
    warn: "#fbbf24",
    normal: "#34d399",
  };
  return (
    <section className="max-w-[1200px] mx-auto px-8 pt-14 pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-10 items-center">
        {/* Left: headline */}
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.02] text-[11.5px] text-slate-400 font-mono mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" style={{ animation: "subtle-pulse 2.4s infinite" }} />
            9 sectors · live
          </div>
          <h1 className="text-[44px] leading-[1.04] tracking-[-0.03em] font-semibold mb-5">
            Nine corridors.
            <br />
            <span className="gradient-text">One watch.</span>
          </h1>
          <p className="text-[15px] leading-[1.6] text-slate-400 max-w-[520px] mb-7">
            HarborOS tracks the most strategically important waterways on the planet. Every sector is pre-seeded with geofences, traffic lanes, and sector-specific risk thresholds.
          </p>
          <div className="flex flex-wrap gap-2.5 items-center mb-8">
            <Link href="/dashboard" className="btn-primary text-[13px] px-4 py-2 rounded-md inline-flex items-center gap-2">
              Open the map <span aria-hidden>→</span>
            </Link>
            <Link href="#sector-grid" className="btn-secondary text-[13px] px-4 py-2 rounded-md inline-flex items-center gap-2 backdrop-blur">
              Browse sectors
            </Link>
          </div>
          <div className="flex items-center gap-5 text-[11px] text-slate-500 font-mono tracking-[0.08em]">
            <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Critical · 2</div>
            <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Elevated · 5</div>
            <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Nominal · 2</div>
          </div>
        </div>

        {/* Right: mini world map */}
        <div className="glass rounded-xl p-4 relative overflow-hidden">
          <div aria-hidden className="absolute top-0 right-0 w-full h-full opacity-80 pointer-events-none" style={{
            background:
              "radial-gradient(ellipse 50% 60% at 80% 0%, rgba(167,139,250,0.07), transparent 60%), radial-gradient(ellipse 50% 60% at 20% 100%, rgba(34,211,238,0.06), transparent 60%)",
          }} />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] text-slate-500 tracking-[0.14em] uppercase">Global watch · live</span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: "subtle-pulse 2.4s infinite" }} />
                <span className="font-mono text-[9.5px] text-emerald-300 tracking-[0.14em] uppercase">Streaming</span>
              </span>
            </div>
            <div className="relative rounded-lg overflow-hidden bg-[#0a0e1a] aspect-[2/1]">
              {/* grid */}
              <div aria-hidden className="absolute inset-0 opacity-50" style={{
                backgroundImage: "linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px)",
                backgroundSize: "40px 40px",
              }} />
              {/* World silhouette — crude continent blobs */}
              <svg aria-hidden="true" className="absolute inset-0 w-full h-full" viewBox="0 0 1000 500" preserveAspectRatio="none">
                <g fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.09)" strokeWidth="0.6">
                  {/* North America */}
                  <path d="M 60 120 Q 90 80 160 90 L 230 110 Q 260 150 245 200 L 205 245 Q 170 260 145 245 L 105 220 Q 70 180 60 120 Z" />
                  {/* South America */}
                  <path d="M 220 280 Q 245 280 260 310 L 265 365 Q 255 410 230 420 L 210 415 Q 195 380 205 340 Q 210 300 220 280 Z" />
                  {/* Europe */}
                  <path d="M 455 115 Q 500 100 540 115 L 565 140 Q 555 165 520 175 L 475 170 Q 455 150 455 115 Z" />
                  {/* Africa */}
                  <path d="M 490 190 Q 540 180 575 210 L 590 280 Q 575 340 540 360 Q 510 360 495 330 L 485 270 Q 475 215 490 190 Z" />
                  {/* Asia */}
                  <path d="M 565 110 Q 660 85 780 110 L 860 145 Q 880 190 840 230 L 760 250 Q 690 250 640 220 L 580 180 Q 555 145 565 110 Z" />
                  {/* Southeast Asia / Indonesia */}
                  <path d="M 790 260 Q 820 255 840 270 L 850 290 Q 830 300 805 295 Q 785 285 790 260 Z" />
                  {/* Australia */}
                  <path d="M 830 330 Q 880 320 905 345 L 910 380 Q 880 395 845 385 Q 820 370 830 330 Z" />
                </g>
              </svg>
              {/* Sector dots */}
              {SECTOR_DOTS.map((d) => {
                const fill = toneFill[d.tone];
                return (
                  <div
                    key={d.key}
                    className="absolute -translate-x-1/2 -translate-y-1/2 group"
                    style={{ left: `${d.x}%`, top: `${d.y}%` }}
                  >
                    <span
                      className="block w-2.5 h-2.5 rounded-full"
                      style={{
                        background: fill,
                        boxShadow: `0 0 12px ${fill}, 0 0 0 2px ${fill}22`,
                        animation: d.tone === "crit" ? "subtle-pulse 1.6s infinite" : undefined,
                      }}
                    />
                    <span className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+4px)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none font-mono text-[9px] tracking-[0.08em] text-slate-300 bg-[rgba(18,22,36,0.95)] border border-white/[0.14] rounded px-1.5 py-0.5 whitespace-nowrap">
                      {d.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-3 text-[10px] font-mono">
              <div>
                <div className="text-slate-500 tracking-[0.14em] uppercase">Tracked · 24h</div>
                <div className="text-slate-100 text-[14px] font-semibold tabular-nums mt-0.5">14,287</div>
              </div>
              <div>
                <div className="text-slate-500 tracking-[0.14em] uppercase">Alerts</div>
                <div className="text-amber-300 text-[14px] font-semibold tabular-nums mt-0.5">47</div>
              </div>
              <div>
                <div className="text-slate-500 tracking-[0.14em] uppercase">Sectors</div>
                <div className="text-slate-100 text-[14px] font-semibold tabular-nums mt-0.5">9</div>
              </div>
              <div>
                <div className="text-slate-500 tracking-[0.14em] uppercase">Uptime</div>
                <div className="text-emerald-300 text-[14px] font-semibold tabular-nums mt-0.5">99.98%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const SECTORS = [
  {
    key: "la_harbor",
    name: "Los Angeles Harbor",
    region: "US · Pacific",
    tone: "warn" as const,
    description: "Port of Los Angeles and Long Beach — the busiest container complex in the United States. High-density anchorage and approach lanes.",
    activity: "149 active · 12 alerts",
  },
  {
    key: "taiwan_strait",
    name: "Taiwan Strait",
    region: "Asia · Pacific",
    tone: "crit" as const,
    description: "Major shipping lane and geopolitical flashpoint. Median line monitoring with sensitive military exclusion zones.",
    activity: "214 active · 8 alerts",
  },
  {
    key: "south_china_sea",
    name: "South China Sea",
    region: "Asia · Pacific",
    tone: "warn" as const,
    description: "Spratly and Paracel island chains, overlapping territorial claims. Heavy fishing fleet activity layered over transit lanes.",
    activity: "312 active · 5 alerts",
  },
  {
    key: "strait_of_malacca",
    name: "Strait of Malacca",
    region: "Indian Ocean",
    tone: "normal" as const,
    description: "World's busiest shipping lane. Dense tanker and bulker traffic funneling between Indian Ocean and Pacific.",
    activity: "482 active · 3 alerts",
  },
  {
    key: "strait_of_hormuz",
    name: "Strait of Hormuz",
    region: "Persian Gulf",
    tone: "crit" as const,
    description: "Critical oil transit chokepoint — roughly a third of global seaborne oil passes through. IMO-designated traffic separation scheme enforced.",
    activity: "187 active · 8 alerts",
  },
  {
    key: "black_sea",
    name: "Black Sea",
    region: "Eastern Europe",
    tone: "warn" as const,
    description: "Odesa, Crimea, Sevastopol, and the Turkish straits approach. Grain corridor plus naval exclusion zones.",
    activity: "94 active · 6 alerts",
  },
  {
    key: "sea_of_azov",
    name: "Sea of Azov",
    region: "Eastern Europe",
    tone: "warn" as const,
    description: "Kerch Strait, Mariupol approach, contested waters. Dark-transit-prone corridor with frequent AIS gaps.",
    activity: "38 active · 4 alerts",
  },
  {
    key: "english_channel",
    name: "English Channel",
    region: "Europe · Atlantic",
    tone: "normal" as const,
    description: "Dover Strait traffic separation scheme. Dense mixed traffic — ferries, cargo, and cross-Channel small craft.",
    activity: "276 active · 2 alerts",
  },
  {
    key: "eastern_med",
    name: "Eastern Mediterranean",
    region: "Mediterranean",
    tone: "warn" as const,
    description: "Syria, Lebanon, and Cyprus corridor. Sanctions-monitoring heavy — ship-to-ship transfers and identity swaps.",
    activity: "162 active · 4 alerts",
  },
];
