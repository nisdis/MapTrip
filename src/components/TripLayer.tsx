import { useEffect } from "react";
import { Polyline, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import type { Trip, TrackPoint } from "../types/trip";

interface TripLayerProps {
  /** Track currently being recorded (drawn live). */
  liveTrack?: TrackPoint[];
  /** Saved recorded trip chosen from the list. */
  viewTrip?: Trip | null;
}

const toLatLng = (p: TrackPoint): L.LatLngTuple => [p.lat, p.lng];

export function TripLayer({ liveTrack = [], viewTrip }: TripLayerProps) {
  const map = useMap();
  const saved = viewTrip?.track ?? [];

  // Fit the map to a trip when the user picks one.
  useEffect(() => {
    if (saved.length > 1) {
      map.fitBounds(L.latLngBounds(saved.map(toLatLng)), { padding: [40, 40] });
    }
  }, [map, viewTrip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {liveTrack.length > 1 && (
        <Polyline
          positions={liveTrack.map(toLatLng)}
          pathOptions={{ color: "#ef4444", weight: 5, opacity: 0.9 }}
        />
      )}
      {saved.length > 1 && (
        <>
          <Polyline
            positions={saved.map(toLatLng)}
            pathOptions={{ color: "#7c3aed", weight: 5, opacity: 0.9 }}
          />
          <Marker position={toLatLng(saved[0])} />
          <Marker position={toLatLng(saved[saved.length - 1])} />
        </>
      )}
    </>
  );
}
