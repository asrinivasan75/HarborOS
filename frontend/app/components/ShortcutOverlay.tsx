"use client";

import { useEffect, useState } from "react";

type Shortcut = { keys: string[]; desc: string };

const GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: "Navigation",
    items: [
      { keys: ["⌘", "K"], desc: "Open command palette" },
      { keys: ["⌘", "/"], desc: "Show this cheatsheet" },
      { keys: ["Esc"], desc: "Close active panel" },
    ],
  },
  {
    title: "Panels",
    items: [
      { keys: ["A"], desc: "Toggle analytics panel" },
      { keys: ["?"], desc: "Show shortcut hint toast" },
    ],
  },
  {
    title: "Map",
    items: [
      { keys: ["Click"], desc: "Select vessel" },
      { keys: ["Scroll"], desc: "Zoom in / out" },
      { keys: ["Drag"], desc: "Pan the map" },
    ],
  },
];

export default function ShortcutOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(8,11,20,0.72)] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[min(480px,92vw)] rounded-2xl border border-white/[0.14] bg-[rgba(18,22,36,0.92)] backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.55)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "fade-in-up 0.2s ease-out" }}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08]">
          <div>
            <div className="text-[13px] font-semibold text-slate-100">Keyboard shortcuts</div>
            <div className="text-[10.5px] font-mono tracking-[0.14em] uppercase text-slate-500 mt-0.5">
              Operator tempo
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
            aria-label="Close shortcuts"
          >
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500 mb-2.5">
                {group.title}
              </div>
              <div className="space-y-1.5">
                {group.items.map((s) => (
                  <div key={s.desc} className="flex items-center justify-between py-1">
                    <span className="text-[12.5px] text-slate-200">{s.desc}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((k) => (
                        <kbd
                          key={k}
                          className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-slate-300 min-w-[22px] text-center"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-white/[0.06] text-[10.5px] font-mono text-slate-500 tracking-[0.08em]">
          Press <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-slate-300">Esc</kbd> or click outside to close.
        </div>
      </div>
    </div>
  );
}
