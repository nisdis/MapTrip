import { useEffect, useMemo } from "react";
import { Polyline, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import type { TrackPoint } from "../types/trip";
import { buildTrailRuns } from "../utils/tripStats";

interface TripLayerProps {
  track: TrackPoint[];
  /** When this changes, the map zooms to fit the whole trail. */
  fitKey?: string | null;
  showEnds?: boolean;
  /** Height in px of a panel covering the bottom of the map. */
  bottomInset?: number;
}

/**
 * The trail, coloured by speed. A pale casing under the colour keeps it
 * readable on top of every kind of road and land-use shading.
 */
export function TripLayer({ track, fitKey, showEnds = false, bottomInset = 0 }: TripLayerProps) {
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
      {showEnds && (
        <>
          <Marker position={all[0]} />
          <Marker position={all[all.length - 1]} />
        </>
      )}
    </>
  );
}
