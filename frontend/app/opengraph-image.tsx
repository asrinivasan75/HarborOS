import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "HarborOS — Maritime intelligence, for every horizon.";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "radial-gradient(ellipse 50% 40% at 15% 0%, rgba(167,139,250,0.18), transparent 70%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(34,211,238,0.14), transparent 70%), #080b14",
          color: "#e7ebf3",
          fontFamily: "system-ui",
        }}
      >
        {/* Top: logo + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="54" height="54" viewBox="0 0 24 24">
            <defs>
              <linearGradient id="og-sweep" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="10.5" fill="none" stroke="#e7ebf3" strokeOpacity="0.22" strokeWidth="0.8" />
            <circle cx="12" cy="12" r="7" fill="none" stroke="#e7ebf3" strokeOpacity="0.14" strokeWidth="0.8" />
            <circle cx="12" cy="12" r="4" fill="none" stroke="#e7ebf3" strokeOpacity="0.12" strokeWidth="0.8" />
            <path d="M12 12 L12 1.5 A10.5 10.5 0 0 1 21 16 Z" fill="url(#og-sweep)" opacity="0.75" />
            <line x1="12" y1="12" x2="12" y2="1.5" stroke="#22d3ee" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="17" cy="7.2" r="1.1" fill="#f472b6" />
          </svg>
          <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em" }}>HarborOS</div>
        </div>

        {/* Middle: headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 16,
              fontFamily: "monospace",
              color: "#94a3b8",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: 999, background: "#22d3ee" }} />
            v2.4 · Sentinel-2 fusion
          </div>
          <div
            style={{
              fontSize: 88,
              fontWeight: 600,
              lineHeight: 1.04,
              letterSpacing: "-0.03em",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Maritime intelligence,</span>
            <span
              style={{
                backgroundImage: "linear-gradient(120deg, #a78bfa 0%, #22d3ee 50%, #f472b6 100%)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              for every horizon.
            </span>
          </div>
          <div style={{ fontSize: 26, color: "#9aa3b8", maxWidth: 900, lineHeight: 1.4 }}>
            Live AIS, satellite fusion, and behavioral detection across nine contested waterways.
          </div>
        </div>

        {/* Bottom: stats strip */}
        <div
          style={{
            display: "flex",
            gap: 56,
            paddingTop: 24,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            fontFamily: "monospace",
          }}
        >
          <StatBlock n="14,287" l="Tracked today" />
          <StatBlock n="1.4s" l="Ingest latency" />
          <StatBlock n="99.2%" l="Precision · 30d" />
          <StatBlock n="9" l="Sectors" />
          <StatBlock n="11" l="Detectors" />
        </div>
      </div>
    ),
    { ...size }
  );
}

function StatBlock({ n, l }: { n: string; l: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 34, fontWeight: 600, color: "#e7ebf3", letterSpacing: "-0.02em" }}>{n}</div>
      <div style={{ fontSize: 14, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{l}</div>
    </div>
  );
}
