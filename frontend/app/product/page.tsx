import { SiteNav, SiteFooter, PageHero } from "@/app/components/SiteChrome";
import Reveal from "@/app/components/Reveal";
import LaunchButton from "@/app/components/LaunchButton";

export default function ProductPage() {
  return (
    <main className="min-h-screen">
      <SiteNav active="Product" />
      <PageHero
        eyebrow="The console · v2.4"
        title="The operations console"
        gradient="made for the 3 AM call."
        body="One surface for every AIS track, satellite pass, and behavioral signal. Triage in seconds, verify in hours, report in a single click."
        secondaryHref="#workflow"
        secondaryLabel="See the workflow"
      />

      <section className="max-w-[1100px] mx-auto px-8 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { n: "14,287", l: "Vessels tracked today" },
            { n: "1.4s", l: "End-to-end ingest latency" },
            { n: "99.2%", l: "Precision · rolling 30d" },
          ].map((s, i) => (
            <Reveal key={s.l} delay={i * 80}>
              <ProofStat n={s.n} l={s.l} />
            </Reveal>
          ))}
        </div>
      </section>

      <section id="workflow" className="max-w-[1100px] mx-auto px-8 pb-16">
        <Reveal>
          <div className="flex items-baseline gap-3 mb-4">
            <span className="font-mono text-[13px] tabular-nums text-violet-300">01</span>
            <span className="w-6 h-px bg-white/[0.12]" />
            <span className="text-[13px] text-slate-300 font-medium tracking-tight">The loop</span>
          </div>
          <h2 className="text-[30px] font-semibold tracking-[-0.02em] leading-[1.15] mb-10">
            Ingest · detect · verify · report.
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 80}>
              <div className="glass rounded-xl p-5 hover:border-white/[0.12] transition-colors h-full">
                <div className="flex items-start gap-3 mb-2">
                  <div className="w-7 h-7 rounded-lg border border-white/[0.08] bg-white/[0.02] flex items-center justify-center font-mono text-[11px] text-slate-400 shrink-0">
                    {s.step}
                  </div>
                  <div>
                    <h3 className="text-[14px] font-semibold text-slate-100">{s.title}</h3>
                    <div className="text-[10.5px] font-mono tracking-[0.14em] uppercase text-slate-500 mt-0.5">{s.kicker}</div>
                  </div>
                </div>
                <p className="text-[12.5px] text-slate-400 leading-[1.6] mt-2.5">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="max-w-[1100px] mx-auto px-8 pb-20">
        <Reveal>
          <SectionLabel>Capabilities</SectionLabel>
          <h2 className="text-[30px] font-semibold tracking-[-0.02em] leading-[1.15] mb-10">
            What the console does.
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {CAPABILITIES.map((c, i) => (
            <Reveal key={c.title} delay={(i % 3) * 70}>
              <div className="glass rounded-xl p-5 h-full">
                <div className="w-8 h-8 rounded-lg mb-3.5 border border-white/[0.08] bg-white/[0.02] flex items-center justify-center" style={{ color: c.color }}>
                  {c.icon}
                </div>
                <h4 className="text-[13px] font-semibold text-slate-100 mb-1">{c.title}</h4>
                <p className="text-[12px] text-slate-500 leading-[1.55]">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="max-w-[1100px] mx-auto px-8 pb-24">
        <Reveal>
        <div className="glass-strong rounded-2xl p-10 flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <h3 className="text-[22px] font-semibold tracking-[-0.02em] mb-2">Launch the operations console.</h3>
            <p className="text-[13.5px] text-slate-400 leading-[1.55] max-w-[520px]">
              The full console ships with nine sectors pre-seeded, a guided tour, and live ingest streaming straight to the map.
            </p>
          </div>
          <LaunchButton className="btn-primary text-[13px] px-4 py-2 rounded-md inline-flex items-center gap-2 self-start" />
        </div>
        </Reveal>
      </section>

      <SiteFooter />
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10.5px] font-mono tracking-[0.22em] text-slate-500 uppercase mb-2">{children}</div>;
}

function ProofStat({ n, l }: { n: string; l: string }) {
  return (
    <div className="glass rounded-xl px-5 py-4">
      <div className="text-[26px] font-semibold tracking-[-0.02em] tabular-nums leading-none">{n}</div>
      <div className="text-[11.5px] text-slate-500 font-medium mt-2">{l}</div>
    </div>
  );
}

const STEPS = [
  {
    step: "01",
    kicker: "Ingest",
    title: "Every track, every sector",
    body: "AIS streams from nine sectors into a unified pipeline. Sentinel-2 passes fuse with radar at ingest. No brokers, no batching — positions arrive in under two seconds.",
  },
  {
    step: "02",
    kicker: "Detect",
    title: "Eleven behavioral detectors",
    body: "Dark transit, spoofing, loitering, rendezvous, and seven more signals run continuously. Confidence scores are normalized across detectors so the triage queue is always ranked correctly.",
  },
  {
    step: "03",
    kicker: "Verify",
    title: "One-click satellite tasking",
    body: "Dispatch Sentinel-2 optical or SAR tasks from the vessel panel. Overlay returns onto the track in the same view — no handoff, no tab-switch.",
  },
  {
    step: "04",
    kicker: "Report",
    title: "Signed, shareable briefs",
    body: "Export interagency-ready PDFs with evidence chains intact. Operator actions are audit-logged and attached to every brief.",
  },
];

const CAPABILITIES = [
  {
    color: "#a78bfa",
    title: "Global AIS ingest",
    body: "Nine live sectors. 14k+ vessels. Sub-2s latency. No sampling.",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>,
  },
  {
    color: "#22d3ee",
    title: "Sentinel-2 fusion",
    body: "10m optical. Verify any contact in one click.",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
  },
  {
    color: "#f472b6",
    title: "Command palette",
    body: "⌘K anywhere. Jump to a vessel, a sector, or an alert.",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6v6H9z"/></svg>,
  },
  {
    color: "#4ade80",
    title: "Risk scoring",
    body: "Normalized 0–100 across detectors. Tunable thresholds per sector.",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg>,
  },
  {
    color: "#fbbf24",
    title: "Pattern learning",
    body: "Per-vessel baselines. Deviations surface before static thresholds would.",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>,
  },
  {
    color: "#fb923c",
    title: "Exportable reports",
    body: "PDF briefs with audit trails. Interagency-ready. Signed.",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>,
  },
];
