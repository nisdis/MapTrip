import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LocateFixed, Pause, Play, RotateCcw } from "lucide-react";
import type { Replay } from "../hooks/useReplay";
import { chartSamples, RATES, type Timeline } from "../utils/replay";
import { MS_TO_KMH, formatClock, formatKm, formatSpeedKmh, speedColor } from "../utils/tripStats";

/** A photo or video that pops up when the replay reaches the moment it was taken. */
export interface ReplayMedia {
  id: string;
  /** trip time it was taken */
  ms: number;
  thumb: ReactNode;
  onOpen: () => void;
}

interface ReplayControlsProps {
  timeline: Timeline;
  replay: Replay;
  /** Shown until the replay starts (the trip's totals). */
  summary: ReactNode;
  /** Show the time of day as it happened (own trips; not on shared pages). */
  showClock?: boolean;
  media?: ReplayMedia[];
  /** px from the bottom of the screen to show a popped-up photo at (just above the panel) */
  popupBottom?: number;
}

const POP_MS = 4000;

function Cell({ label, value, unit, swatch }: { label: string; value: string; unit?: string; swatch?: string }) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-center gap-1 text-[11px] text-asphalt/60">
        {swatch && <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: swatch }} />}
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums">
        {value}
        {unit && <span className="ml-0.5 text-[11px] font-normal text-asphalt/60">{unit}</span>}
      </div>
    </div>
  );
}

/** A row of figures, in the same shape as the live readouts so the panel doesn't jump. */
export function StatGrid({ cells }: { cells: { label: string; value: string; unit?: string; swatch?: string }[] }) {
  return (
    <div
      className="grid border-y border-asphalt/15 text-center"
      style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
    >
      {cells.map((c) => (
        <Cell key={c.label} {...c} />
      ))}
    </div>
  );
}

const rateLabel = (r: number) => `${r}×`;

/** Replay of a recorded trip: live figures, speed and altitude graph (drag to move), play controls. */
export function ReplayControls({ timeline, replay, summary, showClock = false, media = [], popupBottom = 0 }: ReplayControlsProps) {
  const { state, started, playing, ms, rate } = replay;
  const atEnd = ms >= timeline.durationMs && started;

  // Photos: pop the one whose moment the replay just passed.
  const [popped, setPopped] = useState<ReplayMedia | null>(null);
  const prevMs = useRef(ms);
  useEffect(() => {
    const from = prevMs.current;
    prevMs.current = ms;
    if (!playing || ms <= from) return;
    const hit = media.find((m) => m.ms > from && m.ms <= ms);
    if (hit) setPopped(hit);
  }, [ms, playing, media]);
  useEffect(() => {
    if (!popped) return;
    const t = setTimeout(() => setPopped(null), POP_MS);
    return () => clearTimeout(t);
  }, [popped]);

  const nextRate = () => {
    const i = RATES.indexOf(rate as (typeof RATES)[number]);
    replay.setRate(RATES[(i + 1) % RATES.length]);
  };

  return (
    <div className="relative">
      {popped &&
        createPortal(
          // Outside the panel (which may scroll and would clip it), just above it.
          <button
            type="button"
            onClick={popped.onOpen}
            aria-label="Open the photo taken here"
            style={{ bottom: popupBottom + 12 }}
            className="fixed right-3 z-[1050] h-24 w-24 overflow-hidden rounded-xl border-[3px] border-white bg-asphalt/10 shadow-lg"
          >
            {popped.thumb}
          </button>,
          document.body,
        )}

      {started && state ? (
        <StatGrid
          cells={[
            {
              label: "Speed",
              value: formatSpeedKmh(state.speedMs),
              unit: "km/h",
              swatch: speedColor(state.speedMs * MS_TO_KMH),
            },
            { label: "Distance", value: formatKm(state.distanceM), unit: "km" },
            { label: "Time", value: formatClock(state.ms / 1000) },
            ...(timeline.hasAlt ? [{ label: "Altitude", value: state.altM != null ? String(Math.round(state.altM)) : "–", unit: "m" }] : []),
          ]}
        />
      ) : (
        summary
      )}

      <ReplayChart timeline={timeline} replay={replay} />

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={playing ? replay.pause : replay.play}
          aria-label={playing ? "Pause replay" : atEnd ? "Replay again" : "Replay trip"}
          className="flex h-12 items-center gap-2 rounded-full bg-asphalt pl-4 pr-5 font-bold text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt"
        >
          {playing ? <Pause aria-hidden className="h-5 w-5" /> : atEnd ? <RotateCcw aria-hidden className="h-5 w-5" /> : <Play aria-hidden className="h-5 w-5" />}
          {playing ? "Pause" : atEnd ? "Again" : started ? "Play" : "Replay"}
        </button>
        <button
          type="button"
          onClick={nextRate}
          aria-label={`Replay speed: ${rate} times real time. Change`}
          className="h-12 min-w-[3.5rem] rounded-full border-2 border-asphalt/25 px-3 text-sm font-bold tabular-nums"
        >
          {rateLabel(rate)}
        </button>
        <div className="min-w-0 flex-1 text-right text-xs tabular-nums text-asphalt/65">
          {started && state && showClock && (
            <div className="font-bold text-asphalt">
              {new Date(state.clock).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
            </div>
          )}
          <div>
            {formatClock(ms / 1000)} / {formatClock(timeline.durationMs / 1000)}
          </div>
        </div>
        {started && !replay.follow && (
          <button
            type="button"
            onClick={() => replay.setFollow(true)}
            aria-label="Follow the replay on the map"
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-asphalt/25"
          >
            <LocateFixed aria-hidden className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

const W = 1000;
const H = 64;

/**
 * Speed (filled) and altitude (line) across the whole trip. The part already
 * played is darker. It is also the slider: tap or drag to move the replay.
 */
function ReplayChart({ timeline, replay }: { timeline: Timeline; replay: Replay }) {
  const samples = useMemo(() => chartSamples(timeline), [timeline]);
  const dragging = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  const shape = useMemo(() => {
    if (!samples.length) return null;
    const topKmh = Math.max(...samples.map((s) => s.kmh));
    const maxKmh = Math.max(10, topKmh);
    const alts = samples.map((s) => s.altM).filter((a): a is number => a != null);
    const minAlt = alts.length ? Math.min(...alts) : 0;
    const maxAlt = alts.length ? Math.max(...alts) : 0;
    const altSpan = Math.max(20, maxAlt - minAlt); // flat trips stay flat, not noise blown up
    const x = (ms: number) => (ms / timeline.durationMs) * W;
    const speedPts = samples.map((s) => `${x(s.ms).toFixed(1)},${(H - (s.kmh / maxKmh) * (H - 4)).toFixed(1)}`);
    const area = `M0,${H} L${speedPts.join(" L")} L${W},${H} Z`;
    const alt = alts.length
      ? samples
          .map((s, i) =>
            s.altM == null ? null : `${i === 0 ? "M" : "L"}${x(s.ms).toFixed(1)},${(H - 4 - ((s.altM - minAlt) / altSpan) * (H - 12)).toFixed(1)}`,
          )
          .filter(Boolean)
          .join(" ")
          .replace(/^L/, "M")
      : null;
    return { area, alt, topKmh, minAlt, maxAlt };
  }, [samples, timeline.durationMs]);

  if (!shape) return null;

  const frac = timeline.durationMs > 0 ? replay.ms / timeline.durationMs : 0;
  const seekTo = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return;
    replay.seek(((clientX - r.left) / r.width) * timeline.durationMs);
  };
  const step = timeline.durationMs / 100;

  return (
    <div className="mt-2">
      <div
        ref={box}
        role="slider"
        tabIndex={0}
        aria-label="Replay position"
        aria-valuemin={0}
        aria-valuemax={Math.round(timeline.durationMs / 1000)}
        aria-valuenow={Math.round(replay.ms / 1000)}
        aria-valuetext={formatClock(replay.ms / 1000)}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          seekTo(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && seekTo(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={(e) => {
          const to =
            e.key === "ArrowRight" ? replay.ms + step : e.key === "ArrowLeft" ? replay.ms - step : e.key === "Home" ? 0 : e.key === "End" ? timeline.durationMs : null;
          if (to == null) return;
          e.preventDefault();
          replay.seek(to);
        }}
        className="relative h-16 w-full cursor-pointer touch-none select-none rounded-lg bg-asphalt/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-asphalt"
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <clipPath id="replay-played">
              <rect x="0" y="0" width={frac * W} height={H} />
            </clipPath>
          </defs>
          <path d={shape.area} fill="#2E75CC" opacity="0.18" />
          <path d={shape.area} fill="#2E75CC" opacity="0.55" clipPath="url(#replay-played)" />
          {shape.alt && <path d={shape.alt} fill="none" stroke="#9a6700" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
          <line x1={frac * W} x2={frac * W} y1="0" y2={H} stroke="#D7263D" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-asphalt/60">
        <span>
          <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#2E75CC]/60" />
          Speed, up to {Math.round(shape.topKmh)} km/h
        </span>
        {shape.alt && (
          <span>
            <span aria-hidden className="mr-1 inline-block h-0.5 w-3 bg-[#9a6700] align-middle" />
            Altitude {Math.round(shape.minAlt)}–{Math.round(shape.maxAlt)} m
          </span>
        )}
      </div>
    </div>
  );
}
