import type { SearchResult } from "../services/searchService";

export interface TrackPoint {
  lat: number;
  lng: number;
  /** epoch ms */
  t: number;
  /** m/s: reported by the device, or derived from distance over time */
  speed: number | null;
  /** metres above sea level, if the device reported it */
  alt?: number | null;
  /** true when recording was paused before this point: don't join it to the previous one */
  gap?: boolean;
}

export interface TripPhoto {
  id: string;
  addedAt: number;
  /** Set once uploaded to the private cloud store. */
  cloudPath?: string;
}

/**
 * A stretch with no GPS (usually the screen was off and the browser paused
 * tracking). Drawn dashed; its distance is an estimate, kept separate.
 */
export interface TrackGap {
  /** index in `track` of the first point after the gap */
  index: number;
  startedAt: number;
  endedAt: number;
  /** straight-line distance across the gap */
  straightM: number;
  /** road-route distance, if the routing server could estimate one */
  routeM: number | null;
  /** road-route geometry [lat, lng][], if available */
  path: [number, number][] | null;
}

/** Distance across gaps: the road estimate where we have one, else the straight line. */
export const gapDistance = (gaps: TrackGap[] = []) =>
  gaps.reduce((sum, g) => sum + (g.routeM ?? g.straightM), 0);

export interface Trip {
  id: string;
  name: string;
  kind: "recorded" | "planned";
  createdAt: number;
  /** recorded trips */
  track?: TrackPoint[];
  /** planned trips */
  origin?: SearchResult;
  destination?: SearchResult;
  distanceM: number;
  durationS: number;
  /** recorded trips: stretches where tracking paused (screen off) */
  gaps?: TrackGap[];
  photos?: TripPhoto[];
  /** set once the trip has been saved to the cloud */
  cloudSyncedAt?: number;
}
