import type { SearchResult } from "./searchService";
import type { SavedPlaceSnapshot, SavedRoute } from "../types/saved";
import type { TravelMode } from "./travelMode";
import { decodePolyline, routePolylines } from "../../api/_lib/trackFormat";

// Saved routes: what Directions worked out, kept in Saved (not Trips).

/** A Directions end point as a saved place (a pin at its position, with its name). */
export function endSnapshot(r: SearchResult): SavedPlaceSnapshot {
  const [lat, lng] = r.location;
  return {
    id: `pin/${lat.toFixed(6)},${lng.toFixed(6)}`,
    name: r.name,
    category: null,
    address: r.displayName && r.displayName !== r.name ? r.displayName : null,
    lat,
    lng,
    countryCode: null,
  };
}

/** Back to a Directions end point. */
export function endResult(p: SavedPlaceSnapshot): SearchResult {
  return {
    id: -1,
    name: p.name ?? "Dropped pin",
    displayName: p.address ?? p.name ?? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
    location: [p.lat, p.lng],
    type: "saved",
    importance: 1,
  };
}

/** How far the stored path may stray from the drawn route (it's for showing, not navigating). */
const PATH_TOLERANCE_M = 10;

export interface FoundRoute {
  coordinates: [number, number][];
  distanceM: number;
  durationS: number;
}

export function savedRouteFrom(
  origin: SearchResult,
  destination: SearchResult,
  mode: TravelMode,
  found: FoundRoute | null,
): SavedRoute {
  const path = found
    ? routePolylines(found.coordinates.map(([lat, lng]) => ({ lat, lng, t: 0, speed: null })), PATH_TOLERANCE_M)[0] ?? null
    : null;
  return {
    name: `${origin.name} → ${destination.name}`,
    from: endSnapshot(origin),
    to: endSnapshot(destination),
    mode,
    path,
    distanceM: found ? Math.round(found.distanceM) : null,
    durationS: found ? Math.round(found.durationS) : null,
  };
}

export const pathCoords = (path: string | null): [number, number][] => (path ? decodePolyline(path) : []);
