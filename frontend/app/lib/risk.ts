// Centralized risk thresholds used across all components
export const RISK_THRESHOLDS = {
  escalate: 80,
  verify: 60,
  monitor: 35,
} as const;

export const RISK_COLORS = {
  hex: { escalate: "#ef4444", verify: "#f97316", monitor: "#f59e0b", normal: "#22c55e" },
  text: { escalate: "text-red-400", verify: "text-orange-400", monitor: "text-yellow-400", normal: "text-green-400" },
  bg: { escalate: "bg-red-500/10", verify: "bg-orange-500/10", monitor: "bg-yellow-500/10", normal: "bg-green-500/10" },
  glow: { escalate: "shadow-red-500/20", verify: "shadow-orange-500/20", monitor: "", normal: "" },
} as const;

export function riskLevel(score: number | null): "escalate" | "verify" | "monitor" | "normal" {
  if (!score || score < RISK_THRESHOLDS.monitor) return "normal";
  if (score < RISK_THRESHOLDS.verify) return "monitor";
  if (score < RISK_THRESHOLDS.escalate) return "verify";
  return "escalate";
}

export function riskHex(score: number | null): string {
  return RISK_COLORS.hex[riskLevel(score)];
}

export function riskTextClass(score: number | null): string {
  return RISK_COLORS.text[riskLevel(score)];
}

export function riskBgClass(score: number | null): string {
  return RISK_COLORS.bg[riskLevel(score)];
}

export function riskGlowClass(score: number | null): string {
  return RISK_COLORS.glow[riskLevel(score)];
}
