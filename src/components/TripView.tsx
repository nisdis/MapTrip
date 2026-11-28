import { useMemo, useState } from "react";
import { Pencil, Play, X } from "lucide-react";
import { useReportHeight } from "../hooks/useReportHeight";
import type { Replay } from "../hooks/useReplay";
import { usePhotoUrl } from "../services/photoStore";
import { isVideo, type Trip, type TripPhoto } from "../types/trip";
import { msAtClock, type Timeline } from "../utils/replay";
import { computeStats, formatClock, formatKm, formatSpeedKmh } from "../utils/tripStats";
import { ReplayControls, StatGrid, type ReplayMedia } from "./ReplayControls";
import { TripNameEditor } from "./TripNameEditor";

interface TripViewProps {
  trip: Trip;
  timeline: Timeline;
  replay: Replay;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
  onOpenMedia: (items: TripPhoto[], start: number) => void;
  onHeight: (px: number) => void;
}

function Thumb({ photo }: { photo: TripPhoto }) {
  const url = usePhotoUrl(photo);
  if (!url) return null;
  return (
    <>
      {isVideo(photo) ? (
        <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
      ) : (
        <img src={url} alt="" className="h-full w-full object-cover" />
      )}
      {isVideo(photo) && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Play aria-hidden className="h-6 w-6 fill-white text-white drop-shadow" />
        </span>
      )}
    </>
  );
}

/** One of my recorded trips, opened on the map: its totals, and the replay. */
export function TripView({ trip, timeline, replay, onClose, onRename, onOpenMedia, onHeight }: TripViewProps) {
  const [editing, setEditing] = useState(false);
  const [panelHeight, setPanelHeight] = useState(0);
  const ref = useReportHeight((px) => {
    setPanelHeight(px);
    onHeight(px);
  });
  const stats = useMemo(() => computeStats(trip.track ?? [], trip.durationS), [trip]);
  const avg = trip.durationS > 0 ? trip.distanceM / trip.durationS : 0;
  // An average above the top speed means the times don't add up: don't show nonsense.
  const avgOk = avg > 0 && (stats.maxSpeedMs === 0 || avg <= stats.maxSpeedMs * 1.05);

  const media = useMemo<ReplayMedia[]>(() => {
    const items = trip.photos ?? [];
    return items.flatMap((m, i) => {
      const ms = m.takenAt != null ? msAtClock(timeline, m.takenAt) : null;
      return ms == null ? [] : [{ id: m.id, ms, thumb: <Thumb photo={m} />, onOpen: () => onOpenMedia(items, i) }];
    });
  }, [trip.photos, timeline, onOpenMedia]);

  const when = new Date(trip.createdAt).toLocaleString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <section
      ref={ref}
      aria-label="Trip"
      className="fixed bottom-0 inset-x-0 z-30 rounded-t-[22px] bg-paper text-asphalt font-hud shadow-[0_-10px_36px_rgba(31,42,48,0.22)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <TripNameEditor name={trip.name} onSave={onRename} onDone={() => setEditing(false)} />
          ) : (
            <div className="flex min-w-0 items-center gap-1">
              <h2 className="truncate text-lg font-bold">{trip.name}</h2>
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="Rename trip"
                className="flex-shrink-0 rounded-full p-1.5 text-asphalt/60 hover:bg-asphalt/10"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}
          <p className="text-xs text-asphalt/65">{when}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close trip" className="rounded-full p-2 hover:bg-asphalt/10">
          <X className="h-5 w-5" />
        </button>
      </div>
      <ReplayControls
        timeline={timeline}
        replay={replay}
        showClock
        media={media}
        popupBottom={panelHeight}
        summary={
          <StatGrid
            cells={[
              { label: "Distance", value: formatKm(trip.distanceM), unit: "km" },
              { label: "Time", value: formatClock(trip.durationS) },
              { label: "Average", value: avgOk ? formatSpeedKmh(avg) : "–", unit: avgOk ? "km/h" : undefined },
              { label: "Max", value: formatSpeedKmh(stats.maxSpeedMs), unit: "km/h" },
              ...(stats.maxAltM != null ? [{ label: "Climbed", value: String(Math.round(stats.ascentM)), unit: "m" }] : []),
            ]}
          />
        }
      />
    </section>
  );
}
