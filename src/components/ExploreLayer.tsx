import { Fragment, useMemo } from "react";
import { Polyline } from "react-leaflet";
import type { ExploreTrip } from "../services/publicTrips";

/** Explore's trips on the map (tap one to select it). Lines break where something is hidden. */
export function ExploreLayer({
  trips,
  selectedId,
  onSelect,
}: {
  trips: ExploreTrip[];
  selectedId: string | null;
  onSelect: (t: ExploreTrip) => void;
}) {
  const runs = useMemo(
    () =>
      trips.map((t) => {
        const out: [number, number][][] = [];
        for (const [lat, lng, gap] of t.line) {
          if (gap || !out.length) out.push([]);
          out[out.length - 1].push([lat, lng]);
        }
        return { trip: t, runs: out.filter((r) => r.length > 1) };
      }),
    [trips],
  );
  // Selected trip drawn last, on top.
  const ordered = [...runs].sort((a, b) => Number(a.trip.id === selectedId) - Number(b.trip.id === selectedId));
  return (
    <>
      {ordered.map(({ trip, runs: rs }) => {
        const selected = trip.id === selectedId;
        return (
          <Fragment key={trip.id}>
            {rs.map((r, i) => (
              <Polyline
                key={i}
                positions={r}
                pathOptions={{
                  color: selected ? "#0E6B4F" : "#2E75CC",
                  weight: selected ? 6 : 4,
                  opacity: selected ? 1 : 0.6,
                  lineCap: "round",
                  lineJoin: "round",
                }}
                eventHandlers={{ click: () => onSelect(trip) }}
              />
            ))}
          </Fragment>
        );
      })}
    </>
  );
}
