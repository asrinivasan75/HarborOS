import Link from "next/link";
import { SiteNav, SiteFooter } from "@/app/components/SiteChrome";
import LaunchButton from "@/app/components/LaunchButton";

export default function DocsPage() {
  return (
    <main className="min-h-screen">
      <SiteNav active="Docs" />
      <DocsHero />

      <section id="quickstart" className="max-w-[1100px] mx-auto px-8 pb-14">
        <SectionLabel>Quickstart</SectionLabel>
        <h2 className="text-[26px] font-semibold tracking-[-0.02em] leading-[1.15] mb-8">
          From clone to console in a minute.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StepCard n="01" title="Seed the database">
            <CodeBlock>
              {`cd backend\nsource venv/bin/activate\npython -m app.seed`}
            </CodeBlock>
          </StepCard>
          <StepCard n="02" title="Start the API">
            <CodeBlock>
              {`uvicorn app.main:app --reload --port 3003`}
            </CodeBlock>
          </StepCard>
          <StepCard n="03" title="Launch the console">
            <CodeBlock>
              {`cd frontend\nnpm install\nnpm run dev`}
            </CodeBlock>
          </StepCard>
        </div>
        <p className="text-[12.5px] text-slate-500 mt-5">
          Or run both with <span className="font-mono text-slate-400">./start.sh</span> from the repo root.
        </p>
      </section>

      <section id="endpoints" className="max-w-[1100px] mx-auto px-8 pb-14">
        <SectionLabel>REST API</SectionLabel>
        <h2 className="text-[26px] font-semibold tracking-[-0.02em] leading-[1.15] mb-2">
          Core endpoints.
        </h2>
        <p className="text-[13.5px] text-slate-400 leading-[1.55] mb-8 max-w-[620px]">
          Every endpoint returns JSON. Pagination is offset-based. OpenAPI is served at <span className="font-mono text-slate-300">/docs</span>.
        </p>
        <div className="glass rounded-xl overflow-hidden">
          {ENDPOINTS.map((e, i) => (
            <EndpointRow key={e.path + e.method} {...e} last={i === ENDPOINTS.length - 1} />
          ))}
        </div>
      </section>

      <section className="max-w-[1100px] mx-auto px-8 pb-14">
        <SectionLabel>Example</SectionLabel>
        <h2 className="text-[26px] font-semibold tracking-[-0.02em] leading-[1.15] mb-8">
          Pull the LA Harbor alert queue.
        </h2>
        <div className="glass rounded-xl p-5">
          <CodeBlock lang="bash">
            {`curl "http://localhost:3003/api/alerts?region=la_harbor&status=active&limit=50"`}
          </CodeBlock>
          <div className="h-px bg-white/[0.06] my-4" />
          <CodeBlock lang="json">
            {`{
  "items": [
    {
      "id": "alert-...",
      "vessel_id": "vessel-538007493",
      "vessel_name": "MV Jade Star",
      "vessel_mmsi": "538007493",
      "risk_score": 100,
      "recommended_action": "escalate",
      "status": "active",
      "signals": ["dark_transit", "geofence_breach"]
    }
  ],
  "total": 12,
  "limit": 50,
  "offset": 0
}`}
          </CodeBlock>
        </div>
      </section>

      <section className="max-w-[1100px] mx-auto px-8 pb-14">
        <SectionLabel>Stack</SectionLabel>
        <h2 className="text-[26px] font-semibold tracking-[-0.02em] leading-[1.15] mb-8">
          What it's built on.
        </h2>
        <div className="glass rounded-xl overflow-hidden">
          {STACK.map((row, i) => (
            <div
              key={row.layer}
              className={`grid grid-cols-[140px_1fr] items-center px-5 py-3.5 ${
                i === STACK.length - 1 ? "" : "border-b border-white/[0.05]"
              }`}
            >
              <div className="text-[11px] font-mono tracking-[0.14em] uppercase text-slate-500">{row.layer}</div>
              <div className="text-[13px] text-slate-200">{row.tech}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-[1100px] mx-auto px-8 pb-24">
        <div className="glass-strong rounded-2xl p-10 flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <h3 className="text-[22px] font-semibold tracking-[-0.02em] mb-2">Questions? Open an issue.</h3>
            <p className="text-[13.5px] text-slate-400 leading-[1.55] max-w-[520px]">
              The full OpenAPI schema is served by the backend — the console consumes the same surface you'd build against.
            </p>
          </div>
          <LaunchButton className="btn-primary text-[13px] px-4 py-2 rounded-md inline-flex items-center gap-2 self-start">
            Try the console <span aria-hidden>→</span>
          </LaunchButton>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function DocsHero() {
  return (
    <section className="max-w-[1100px] mx-auto px-8 pt-14 pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.05fr] gap-10 items-start">
        {/* Left: tight headline + CTAs */}
        <div className="pt-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.02] text-[11.5px] text-slate-400 font-mono mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            API · v2.4 · REST
          </div>
          <h1 className="text-[38px] leading-[1.04] tracking-[-0.03em] font-semibold mb-5">
            One surface.
            <br />
            Everything the console sees.
          </h1>
          <p className="text-[14.5px] leading-[1.6] text-slate-400 max-w-[480px] mb-7">
            The HarborOS REST API exposes every vessel, alert, geofence, and analytics rollup that powers the console. Same surface the UI consumes. Runnable in under a minute.
          </p>
          <div className="flex flex-wrap gap-2.5 items-center">
            <Link href="#endpoints" className="btn-primary text-[13px] px-4 py-2 rounded-md inline-flex items-center gap-2">
              Browse endpoints <span aria-hidden>→</span>
            </Link>
            <Link href="#quickstart" className="btn-secondary text-[13px] px-4 py-2 rounded-md inline-flex items-center gap-2 backdrop-blur">
              60-second quickstart
            </Link>
          </div>
        </div>

        {/* Right: terminal-style hero */}
        <div className="glass rounded-xl overflow-hidden border border-white/[0.08]">
          <div className="flex items-center gap-2.5 px-3.5 py-2 border-b border-white/[0.06] bg-white/[0.015]">
            <span className="w-2 h-2 rounded-full bg-white/15" />
            <span className="w-2 h-2 rounded-full bg-white/15" />
            <span className="w-2 h-2 rounded-full bg-white/15" />
            <span className="font-mono text-[10px] text-slate-500 tracking-[0.12em] uppercase ml-1.5">
              harboros · shell
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: "subtle-pulse 2.4s infinite" }} />
              <span className="font-mono text-[9.5px] text-emerald-300 tracking-[0.14em] uppercase">Live</span>
            </span>
          </div>
          <pre className="px-4 py-4 text-[12.5px] font-mono leading-[1.75] text-slate-300 overflow-x-auto">
<code><span className="text-slate-600">$</span> <span className="text-violet-300">curl</span> https://harboros.app/api/alerts?region=la_harbor{"\n"}
<span className="text-slate-600">{"{"}</span>{"\n"}
{"  "}<span className="text-cyan-300">"items"</span>: [{"\n"}
{"    "}{"{"}{"\n"}
{"      "}<span className="text-cyan-300">"vessel_name"</span>: <span className="text-emerald-300">"MV Jade Star"</span>,{"\n"}
{"      "}<span className="text-cyan-300">"vessel_mmsi"</span>: <span className="text-emerald-300">"538007493"</span>,{"\n"}
{"      "}<span className="text-cyan-300">"risk_score"</span>: <span className="text-pink-300">100</span>,{"\n"}
{"      "}<span className="text-cyan-300">"recommended_action"</span>: <span className="text-red-300">"escalate"</span>,{"\n"}
{"      "}<span className="text-cyan-300">"signals"</span>: [<span className="text-emerald-300">"dark_transit"</span>, <span className="text-emerald-300">"geofence_breach"</span>]{"\n"}
{"    "}{"}"}{"\n"}
{"  "}],{"\n"}
{"  "}<span className="text-cyan-300">"total"</span>: <span className="text-pink-300">12</span>{"\n"}
<span className="text-slate-600">{"}"}</span>
</code>
          </pre>
        </div>
      </div>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10.5px] font-mono tracking-[0.22em] text-slate-500 uppercase mb-2">{children}</div>;
}

function StepCard({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 rounded-lg border border-white/[0.08] bg-white/[0.02] flex items-center justify-center font-mono text-[11px] text-slate-400">
          {n}
        </div>
        <h3 className="text-[13px] font-semibold text-slate-100">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function CodeBlock({ children, lang }: { children: React.ReactNode; lang?: string }) {
  return (
    <div className="rounded-lg bg-black/30 border border-white/[0.05] overflow-hidden">
      {lang && (
        <div className="px-3 py-1.5 border-b border-white/[0.05] text-[9.5px] font-mono tracking-[0.14em] uppercase text-slate-500">
          {lang}
        </div>
      )}
      <pre className="px-3.5 py-3 text-[11.5px] font-mono leading-[1.65] text-slate-300 overflow-x-auto">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function EndpointRow({ method, path, desc, last }: {
  method: string;
  path: string;
  desc: string;
  last?: boolean;
}) {
  const methodColor = method === "GET"
    ? "text-cyan-300 border-cyan-400/25 bg-cyan-400/8"
    : method === "POST"
      ? "text-violet-300 border-violet-400/25 bg-violet-400/8"
      : "text-amber-300 border-amber-400/25 bg-amber-400/8";
  return (
    <div className={`grid grid-cols-[64px_minmax(0,280px)_1fr] items-center gap-4 px-5 py-3 ${last ? "" : "border-b border-white/[0.05]"}`}>
      <span className={`text-[10px] font-mono font-semibold tracking-[0.1em] uppercase px-2 py-0.5 rounded border text-center ${methodColor}`}>
        {method}
      </span>
      <span className="font-mono text-[12.5px] text-slate-200 truncate">{path}</span>
      <span className="text-[12px] text-slate-500">{desc}</span>
    </div>
  );
}

const ENDPOINTS = [
  { method: "GET", path: "/api/regions", desc: "List all sectors with bounding boxes and centers." },
  { method: "GET", path: "/api/vessels?region={key}", desc: "Paginated live vessels. Filters by region." },
  { method: "GET", path: "/api/vessels/{id}", desc: "Full vessel detail — positions, signals, weather." },
  { method: "GET", path: "/api/alerts?status=active", desc: "Triage queue. Filter by status, region, limit." },
  { method: "POST", path: "/api/alerts/{id}/action", desc: "Acknowledge, dismiss, or escalate an alert." },
  { method: "GET", path: "/api/geofences", desc: "All zones — TSS, restricted, exclusion." },
  { method: "GET", path: "/api/analytics/distribution", desc: "Risk histogram and MARSEC tier counts." },
  { method: "GET", path: "/api/detection/metrics", desc: "Precision, recall, active/resolved counts." },
  { method: "GET", path: "/api/scenario/timeline", desc: "Demo scenario timeline for presentations." },
  { method: "GET", path: "/api/satellite/info", desc: "Sentinel-2 task status and coverage." },
];

const STACK = [
  { layer: "Backend", tech: "Python · FastAPI · SQLAlchemy · Pydantic · SQLite" },
  { layer: "Frontend", tech: "Next.js 16 · React 19 · TypeScript · Tailwind CSS v4" },
  { layer: "Mapping", tech: "MapLibre GL · vector tiles · custom Sentinel style" },
  { layer: "Data", tech: "AISStream · Sentinel-2 L2A · NWS weather · NOAA charts" },
  { layer: "Ports", tech: "API 3003 · Console 2003 · OpenAPI at /docs" },
];
