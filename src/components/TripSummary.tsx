import { useState } from "react";
import { useReportHeight } from "../hooks/useReportHeight";
import type { TripStats } from "../utils/tripStats";
import { formatClock, formatKm, formatSpeedKmh } from "../utils/tripStats";

interface TripSummaryProps {
  defaultName: string;
  activeSeconds: number;
  stats: TripStats;
  onSave: (name: string) => void;
  onDiscard: () => void;
  onHeight: (px: number) => void;
  estimatedM: number;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <dt className="text-sm text-asphalt/60">{label}</dt>
      <dd className="text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}

export function TripSummary({ defaultName, activeSeconds, stats, onSave, onDiscard, onHeight, estimatedM }: TripSummaryProps) {
  const [name, setName] = useState(defaultName);
  const ref = useReportHeight(onHeight);
  const hasAlt = stats.maxAltM != null;

  return (
    <section
      ref={ref}
      aria-label="Trip summary"
      className="fixed bottom-0 inset-x-0 z-30 rounded-t-[22px] bg-paper text-asphalt font-hud shadow-[0_-10px_36px_rgba(31,42,48,0.22)] px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="text-sm font-bold">Trip finished</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-5xl font-bold tabular-nums">{formatKm(stats.distanceM + estimatedM)}</span>
        <span className="text-lg text-asphalt/70">km in {formatClock(activeSeconds)}</span>
      </div>

      {estimatedM > 0 && (
        <p className="mt-1 text-sm text-[#9a6700]">
          Includes {formatKm(estimatedM)} km estimated while the screen was off.
        </p>
      )}

      <dl className="mt-3 divide-y divide-asphalt/15 border-y border-asphalt/15">
        <Row
          label="Average speed"
          value={`${formatSpeedKmh(activeSeconds > 0 ? (stats.distanceM + estimatedM) / activeSeconds : 0)} km/h`}
        />
        <Row label="Max speed" value={`${formatSpeedKmh(stats.maxSpeedMs)} km/h`} />
        {hasAlt && <Row label="Highest point" value={`${Math.round(stats.maxAltM!)} m`} />}
        {hasAlt && <Row label="Climbed" value={`${Math.round(stats.ascentM)} m`} />}
      </dl>

      <label className="mt-3 block text-sm text-asphalt/60" htmlFor="trip-name">
        Trip name
      </label>
      <input
        id="trip-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        className="mt-1 w-full rounded-xl bg-white px-4 py-3 text-base border border-asphalt/20 focus:outline-none focus:ring-2 focus:ring-asphalt"
      />

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Discard this trip? It can't be recovered.")) onDiscard();
          }}
          className="h-14 px-5 rounded-xl border-2 border-asphalt/30 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={() => onSave(name.trim() || defaultName)}
          className="h-14 flex-1 rounded-xl bg-milestone font-bold text-asphalt focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt"
        >
          Save trip
        </button>
      </div>
      <p className="mt-2 text-xs text-asphalt/60">
        Saved on this device. You can add photos or save it to the cloud from Trips.
      </p>
    </section>
  );
}

