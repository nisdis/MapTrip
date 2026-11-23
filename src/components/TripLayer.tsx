import { Fragment, useEffect, useMemo } from "react";
import { Polyline, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { usesRoad, type TrackGap, type TrackPoint } from "../types/trip";
import { buildTrailRuns } from "../utils/tripStats";

interface TripLayerProps {
  track: TrackPoint[];
  /** When this changes, the map zooms to fit the whole trail. */
  fitKey?: string | null;
  showEnds?: boolean;
  /** Height in px of a panel covering the bottom of the map. */
  bottomInset?: number;
  /** Stretches with no GPS: drawn dashed (estimated road route, or a straight line). */
  gaps?: TrackGap[];
  /** Makes gaps tappable (summary screen); the selected one is highlighted. */
  onGapTap?: (index: number) => void;
  selectedGap?: number | null;
}

/**
 * The trail, coloured by speed. A pale casing under the colour keeps it
 * readable on top of every kind of road and land-use shading.
 */
export function TripLayer({
  track,
  fitKey,
  showEnds = false,
  bottomInset = 0,
  gaps = [],
  onGapTap,
  selectedGap = null,
}: TripLayerProps) {
  const map = useMap();
  const runs = useMemo(() => buildTrailRuns(track), [track]);
  const all = useMemo<L.LatLngTuple[]>(
    () => track.map((p) => [p.lat, p.lng]),
    [track],
  );

  useEffect(() => {
    if (fitKey && all.length > 1) {
      map.fitBounds(L.latLngBounds(all), {
        paddingTopLeft: [48, 48],
        paddingBottomRight: [48, 48 + bottomInset],
        maxZoom: 17,
      });
    }
    // Refit when the chosen trail (or the panel covering the map) changes, not as points arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey, bottomInset]);

  if (all.length < 2) return null;

  return (
    <>
      {/* Casing per run (never one line through all runs): paused stretches stay unjoined. */}
      {runs.map((run, i) => (
        <Polyline
          key={`casing-${i}`}
          positions={run.positions}
          pathOptions={{ color: "#FFFFFF", weight: 10, opacity: 0.9, lineCap: "round", lineJoin: "round" }}
          interactive={false}
        />
      ))}
      {runs.map((run, i) => (
        <Polyline
          key={`run-${i}`}
          positions={run.positions}
          pathOptions={{ color: run.color, weight: 6, opacity: 1, lineCap: "round", lineJoin: "round" }}
          interactive={false}
        />
      ))}
      {gaps.map((g) => {
        const a = track[g.index - 1];
        const b = track[g.index];
        if (!a || !b) return null;
        const positions = usesRoad(g) && g.path ? g.path : [[a.lat, a.lng] as [number, number], [b.lat, b.lng] as [number, number]];
        const selected = selectedGap === g.index;
        return (
          <Fragment key={`gap-${g.index}`}>
            <Polyline
              positions={positions}
              pathOptions={{
                color: selected ? "#D7263D" : "#5B6670",
                weight: selected ? 5 : 4,
                opacity: 0.9,
                dashArray: "2 10",
                lineCap: "round",
              }}
              interactive={false}
            />
            {onGapTap && (
              // Wide invisible line: easy to hit with a finger.
              <Polyline
                positions={positions}
                pathOptions={{ color: "#000", weight: 28, opacity: 0 }}
                eventHandlers={{ click: () => onGapTap(g.index) }}
              />
            )}
          </Fragment>
        );
      })}
      {showEnds && (
        <>
          <Marker position={all[0]} />
          <Marker position={all[all.length - 1]} />
        </>
      )}
    </>
  );
}
