"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/app/lib/api";

interface TimelineProps {
  onTimeChange: (timestamp: string | null) => void;
}

export default function Timeline({ onTimeChange }: TimelineProps) {
  const [timelineData, setTimelineData] = useState<{ start: string; end: string } | null>(null);
  const [position, setPosition] = useState(100); // 0-100, 100 = live/now
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const playInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.getTimeline().then((t) => {
      if (t.start && t.end) setTimelineData({ start: t.start, end: t.end });
    }).catch(() => {});
  }, []);

  const getTimestampForPosition = useCallback((pos: number): string | null => {
    if (!timelineData || pos >= 100) return null;
    const start = new Date(timelineData.start).getTime();
    const end = new Date(timelineData.end).getTime();
    const ts = start + (pos / 100) * (end - start);
    return new Date(ts).toISOString();
  }, [timelineData]);

  const formatTime = useCallback((pos: number): string => {
    if (pos >= 100) return "LIVE";
    const ts = getTimestampForPosition(pos);
    if (!ts) return "--:--";
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [getTimestampForPosition]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setPosition(val);
    setIsLive(val >= 100);
    onTimeChange(val >= 100 ? null : getTimestampForPosition(val));
  }, [getTimestampForPosition, onTimeChange]);

  const handleGoLive = useCallback(() => {
    setPosition(100);
    setIsLive(true);
    setIsPlaying(false);
    onTimeChange(null);
  }, [onTimeChange]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (position >= 100) setPosition(0);
      setIsPlaying(true);
    }
  }, [isPlaying, position]);

  // Auto-advance when playing
  useEffect(() => {
    if (playInterval.current) clearInterval(playInterval.current);
    if (!isPlaying) return;

    playInterval.current = setInterval(() => {
      setPosition((prev) => {
        const next = prev + 0.5;
        if (next >= 100) {
          setIsPlaying(false);
          setIsLive(true);
          onTimeChange(null);
          return 100;
        }
        const ts = getTimestampForPosition(next);
        onTimeChange(ts);
        return next;
      });
    }, 100);

    return () => { if (playInterval.current) clearInterval(playInterval.current); };
  }, [isPlaying, getTimestampForPosition, onTimeChange]);

  if (!timelineData) return null;

  return (
    <div className="h-10 bg-[#0d1320] border-t border-[#1a2235] flex items-center px-4 gap-3 shrink-0">
      {/* Play/Pause */}
      <button
        onClick={togglePlay}
        className="w-7 h-7 flex items-center justify-center rounded-md bg-[#111827] border border-[#1a2235] text-slate-400 hover:text-blue-400 hover:border-blue-500/30 transition-colors"
      >
        {isPlaying ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <rect x="1" y="1" width="3" height="8" rx="0.5" />
            <rect x="6" y="1" width="3" height="8" rx="0.5" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <polygon points="2,1 9,5 2,9" />
          </svg>
        )}
      </button>

      {/* Current time */}
      <span className="text-[10px] font-mono text-slate-400 w-12 text-center">
        {formatTime(position)}
      </span>

      {/* Slider */}
      <div className="flex-1 relative">
        <input
          type="range"
          min="0"
          max="100"
          step="0.5"
          value={position}
          onChange={handleSliderChange}
          className="timeline-slider"
        />
        {/* Progress fill */}
        <div
          className="absolute top-1/2 -translate-y-1/2 left-0 h-1 bg-blue-500/40 rounded-full pointer-events-none"
          style={{ width: `${position}%` }}
        />
      </div>

      {/* Live button */}
      <button
        onClick={handleGoLive}
        className={`text-[9px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md transition-colors ${
          isLive
            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
            : "bg-[#111827] text-slate-500 border border-[#1a2235] hover:text-emerald-400 hover:border-emerald-500/25"
        }`}
      >
        {isLive ? "LIVE" : "GO LIVE"}
      </button>
    </div>
  );
}
