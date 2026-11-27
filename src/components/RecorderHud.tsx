import { useEffect, useRef, useState } from "react";
import { Moon, Pause, Play, Radio, Square, Camera } from "lucide-react";
import { usesRoad, type TrackGap } from "../types/trip";
import { useReportHeight } from "../hooks/useReportHeight";
import { isInApp } from "../services/appBridge";
import {
  SPEED_BANDS,
  SPEED_SCALE_MAX_KMH,
  MS_TO_KMH,
  formatClock,
  formatKm,
  formatSpeedKmh,
} from "../utils/tripStats";

interface RecorderHudProps {
  status: "recording" | "paused";
  speedMs: number;
  maxSpeedMs: number;
  distanceM: number;
  activeSeconds: number;
  altitudeM: number | null;
  accuracyM: number | null;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onHeight: (px: number) => void;
  /** distance across tracking gaps (screen off), estimated */
  estimatedM: number;
  lastGap: TrackGap | null;
  onPocket: () => void;
  /** a live link is active */
  sharing: boolean;
  onShare: () => void;
  /** In the app, while Android may still stop it in the background */
  onBatteryHelp?: () => void;
  /** photos and videos added to this trip so far */
  mediaCount: number;
  onAddMedia: (files: File[]) => void;
}

const HOLD_MS = 900;

/** Finishing needs a deliberate hold, so a bump or a stray tap can't end the trip. */
function HoldToFinish({ onFinish }: { onFinish: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  useEffect(() => cancel, []);

  return (
    <button
      type="button"
      aria-label="Finish trip (press and hold)"
      onPointerDown={() => {
        setHolding(true);
        timer.current = setTimeout(() => {
          cancel();
          onFinish();
        }, HOLD_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      // Keyboard and assistive tech activate with a normal press.
      onClick={(e) => e.detail === 0 && onFinish()}
      className="relative h-14 flex-[1.5] overflow-hidden whitespace-nowrap rounded-xl bg-signal text-white font-bold select-none touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-asphalt/45"
        style={{
          width: holding ? "100%" : "0%",
          transition: holding
            ? `width ${HOLD_MS}ms linear`
            : "width 150ms ease-out",
        }}
      />
      <span className="relative flex items-center justify-center gap-2">
        <Square className="w-4 h-4 fill-white" />
        {holding ? "Keep holding…" : "Hold to finish"}
      </span>
    </button>
  );
}

function SpeedRibbon({ kmh, maxKmh }: { kmh: number; maxKmh: number }) {
  const pct = (v: number) =>
    `${(Math.min(v, SPEED_SCALE_MAX_KMH) / SPEED_SCALE_MAX_KMH) * 100}%`;
  let from = 0;
  return (
    <div className="relative mt-3 pt-3" aria-hidden>
      <div className="flex h-2 overflow-hidden rounded-full">
        {SPEED_BANDS.map((band) => {
          const width = ((band.upToKmh - from) / SPEED_SCALE_MAX_KMH) * 100;
          from = band.upToKmh;
          return (
            <div
              key={band.upToKmh}
              style={{ width: `${width}%`, background: band.color }}
            />
          );
        })}
      </div>
      {maxKmh > 0 && (
        <div
          className="absolute top-2.5 h-3.5 w-0.5 bg-asphalt/70"
          style={{ left: pct(maxKmh) }}
        />
      )}
      <div
        className="absolute top-0 -ml-[7px] h-0 w-0 border-x-[7px] border-t-[9px] border-x-transparent border-t-asphalt transition-[left] duration-700 ease-out"
        style={{ left: pct(kmh) }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
}) {
  return (
    <div className="px-4 py-2.5">
      <div className="text-xs text-asphalt/60">
        {label}
        {note && <span className="ml-1 text-[#9a6700]">{note}</span>}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        {unit && <span className="text-sm text-asphalt/60">{unit}</span>}
      </div>
    </div>
  );
}

/** Says plainly that locking the phone pauses tracking, and what happened after a gap. */
function TrackingNote({
  lastGap,
  onBatteryHelp,
}: {
  lastGap: TrackGap | null;
  onBatteryHelp?: () => void;
}) {
  const recent = lastGap && Date.now() - lastGap.endedAt < 30000;
  if (recent) {
    const min = Math.max(
      1,
      Math.round((lastGap.endedAt - lastGap.startedAt) / 60000),
    );
    return (
      <p role="status" className="mt-1 text-xs font-bold text-[#9a6700]">
        Tracking paused for {min} min while the screen was off.{" "}
        {usesRoad(lastGap)
          ? "Filled with an estimated road route."
          : lastGap.reason === "rail"
            ? "Looks like a train: shown as a straight dashed line."
            : "Shown as a dashed line."}
      </p>
    );
  }
  if (isInApp()) {
    return (
      <p className="mt-1 text-xs text-asphalt/55">
        Keeps recording with the screen off.
        {onBatteryHelp && (
          <>
            {" "}
            <button
              type="button"
              onClick={onBatteryHelp}
              className="font-bold text-[#9a6700] underline"
            >
              Check battery settings
            </button>
          </>
        )}
      </p>
    );
  }
  return (
    <p className="mt-1 text-xs text-asphalt/55">
      Keep the screen on. Locking the phone pauses tracking.
    </p>
  );
}

function gpsLabel(accuracyM: number | null): string {
  if (accuracyM == null) return "Finding GPS…";
  if (accuracyM <= 15) return `GPS strong, ±${Math.round(accuracyM)} m`;
  if (accuracyM <= 50) return `GPS fair, ±${Math.round(accuracyM)} m`;
  return `GPS weak, ±${Math.round(accuracyM)} m`;
}

export function RecorderHud(props: RecorderHudProps) {
  const {
    status,
    speedMs,
    maxSpeedMs,
    distanceM,
    activeSeconds,
    altitudeM,
    accuracyM,
  } = props;
  const recording = status === "recording";
  const kmh = speedMs * MS_TO_KMH;
  const ref = useReportHeight(props.onHeight);

  return (
    <section
      ref={ref}
      aria-label="Trip recorder"
      className="fixed bottom-0 inset-x-0 z-30 rounded-t-[22px] bg-paper text-asphalt font-hud shadow-[0_-10px_36px_rgba(31,42,48,0.22)] pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 font-bold" role="status">
            <span
              aria-hidden
              className={`h-2.5 w-2.5 rounded-full ${
                recording
                  ? "bg-signal motion-safe:animate-pulse"
                  : "bg-asphalt/40"
              }`}
            />
            {recording ? "Recording" : "Paused"}
            {props.sharing && (
              <span className="ml-1 rounded-full bg-signal px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                Live
              </span>
            )}
          </div>
          <span className="text-asphalt/60">{gpsLabel(accuracyM)}</span>
        </div>

        <TrackingNote
          lastGap={props.lastGap}
          onBatteryHelp={props.onBatteryHelp}
        />

        <div className="mt-2 flex items-baseline">
          <span className="inline-block min-w-[2ch] text-[76px] leading-none font-bold tabular-nums">
            {formatSpeedKmh(speedMs)}
          </span>
          <span className="ml-2 text-lg text-asphalt/70">km/h</span>
        </div>
        <SpeedRibbon kmh={kmh} maxKmh={maxSpeedMs * MS_TO_KMH} />
      </div>

      <div className="mt-2 grid grid-cols-2 border-t border-asphalt/15 [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-asphalt/15 [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-asphalt/15">
        <Stat
          label="Distance"
          value={formatKm(distanceM + props.estimatedM)}
          unit="km"
          note={
            props.estimatedM > 0
              ? `incl. ${formatKm(props.estimatedM)} est.`
              : undefined
          }
        />
        <Stat label="Time" value={formatClock(activeSeconds)} />
        <Stat
          label="Max speed"
          value={formatSpeedKmh(maxSpeedMs)}
          unit="km/h"
        />
        <Stat
          label="Altitude"
          value={altitudeM == null ? "–" : String(Math.round(altitudeM))}
          unit={altitudeM == null ? undefined : "m"}
        />
      </div>

      <div className="flex gap-2 px-4 pt-2.5">
        {recording ? (
          <button
            type="button"
            onClick={props.onPause}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-asphalt font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt"
          >
            <Pause className="w-5 h-5" /> Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={props.onResume}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-highway text-white font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt"
          >
            <Play className="w-5 h-5 fill-white" /> Resume
          </button>
        )}
        <HoldToFinish onFinish={props.onFinish} />
      </div>
      <div className="flex gap-2 px-4 pt-2">
        <label
          aria-label={`Add photo or video${props.mediaCount ? ` (${props.mediaCount} added)` : ""}`}
          title="Add photo or video"
          className="relative flex h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 text-sm font-semibold border-asphalt/30 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-asphalt"
        >
          <Camera aria-hidden className="h-4 w-4" />
          <span aria-hidden className="whitespace-nowrap">Photo/video</span>
          {props.mediaCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-highway px-1 text-center text-[11px] font-bold leading-5 text-white">
              {props.mediaCount}
            </span>
          )}
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) props.onAddMedia(files);
            }}
          />
        </label>
        <button
          type="button"
          onClick={props.onPocket}
          aria-label="Dim screen (pocket mode). Recording continues."
          title="Pocket mode"
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 text-sm font-semibold border-asphalt/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt"
        >
          <Moon aria-hidden className="h-4 w-4" />
          <span aria-hidden>Pocket</span>
        </button>
        <button
          type="button"
          onClick={props.onShare}
          aria-label={
            props.sharing
              ? "Live sharing on. Manage live link"
              : "Share live location"
          }
          title="Share live"
          className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt ${
            props.sharing
              ? "border-signal text-signal bg-signal/10"
              : "border-asphalt/30"
          }`}
        >
          <Radio aria-hidden className="h-4 w-4" />
          <span aria-hidden>Share live</span>
        </button>
      </div>
    </section>
  );
}
