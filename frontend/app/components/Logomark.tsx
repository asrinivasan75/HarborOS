interface LogomarkProps {
  size?: number;
  animate?: boolean;
  className?: string;
}

export default function Logomark({ size = 24, animate = false, className = "" }: LogomarkProps) {
  const compact = size <= 18;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="hos-sweep" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      {!compact && (
        <>
          <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
          <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="0.8" />
        </>
      )}
      <circle cx="12" cy="12" r={compact ? 10 : 4} fill="none" stroke="currentColor" strokeOpacity={compact ? 0.25 : 0.1} strokeWidth={compact ? 1.1 : 0.8} />
      <g style={animate ? { transformOrigin: "12px 12px", animation: "hos-sweep 3.2s linear infinite" } : undefined}>
        <path d="M12 12 L12 1.5 A10.5 10.5 0 0 1 21 16 Z" fill="url(#hos-sweep)" opacity="0.6" />
        <line x1="12" y1="12" x2="12" y2="1.5" stroke="#22d3ee" strokeWidth="1.2" strokeLinecap="round" />
      </g>
      {!compact && <circle cx="17" cy="7.2" r="0.85" fill="#f472b6" />}
    </svg>
  );
}
