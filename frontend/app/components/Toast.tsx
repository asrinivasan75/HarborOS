"use client";

import { useEffect, useRef, useCallback } from "react";

export interface ToastItem {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const ICONS: Record<ToastItem["type"], string> = {
  success: "M20 6L9 17l-5-5",
  error: "M18 6L6 18M6 6l12 12",
  info: "M12 16v-4m0-4h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z",
};

const COLORS: Record<ToastItem["type"], { border: string; icon: string; bg: string }> = {
  success: { border: "border-emerald-500/25", icon: "text-emerald-400", bg: "bg-emerald-500/10" },
  error: { border: "border-red-500/25", icon: "text-red-400", bg: "bg-red-500/10" },
  info: { border: "border-blue-500/25", icon: "text-blue-400", bg: "bg-blue-500/10" },
};

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 3000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [onDismiss]);

  const c = COLORS[toast.type];

  return (
    <div
      className={`w-72 ${c.bg} backdrop-blur-md border ${c.border} rounded-lg px-3 py-2.5 flex items-start gap-2.5 shadow-xl shadow-black/30`}
      style={{ animation: "fade-in-up 0.25s ease-out" }}
    >
      <div className={`shrink-0 mt-0.5 ${c.icon}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICONS[toast.type]} />
        </svg>
      </div>
      <p className="flex-1 text-[11px] text-slate-200 leading-relaxed">{toast.message}</p>
      <button
        onClick={onDismiss}
        className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors mt-0.5"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default function Toast({ toasts, onDismiss }: ToastProps) {
  const handleDismiss = useCallback((id: string) => () => onDismiss(id), [onDismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={handleDismiss(t.id)} />
      ))}
    </div>
  );
}
