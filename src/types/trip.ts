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
  // What the device reported for this fix; null when it didn't give it.
  /** m, horizontal */
  accuracy?: number | null;
  /** m */
  altAccuracy?: number | null;
  /** degrees from north */
  heading?: number | null;
  headingAccuracy?: number | null;
  /** m/s as reported (`speed` above is smoothed) */
  deviceSpeed?: number | null;
  speedAccuracy?: number | null;
}

/** A photo or video on a trip (older trips: photos only, without the extra fields). */
export interface TripPhoto {
  id: string;
  addedAt: number;
  /** Set once uploaded to the private cloud store. */
  cloudPath?: string;
  /** missing on older trips: a photo */
  kind?: "photo" | "video";
  /** videos: their type (video/mp4, video/quicktime, video/webm) */
  mime?: string;
  /** when it was taken (epoch ms): the photo's own date, else the file's */
  takenAt?: number | null;
  /** where on the route it was taken; missing when it's from outside the trip's time */
  lat?: number;
  lng?: number;
  /** videos: length in seconds */
  durationS?: number;
}

export const isVideo = (m: TripPhoto) => m.kind === "video";

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
  /**
   * How the gap is drawn and counted. "straight" when the road route looked
   * wrong (see `reason`) or the person chose it. Missing on older trips: road.
   */
  fill?: "road" | "straight";
  /** why "straight" was chosen automatically */
  reason?: GapReason;
}

/** rail: both ends by a railway line; too-fast: the road route needs an impossible speed; detour: far longer than straight */
export type GapReason = "rail" | "too-fast" | "detour";

/** True when the gap is counted (and, with a path, drawn) along the road route. */
export const usesRoad = (g: TrackGap) => g.fill !== "straight" && g.routeM != null;

/** Distance across gaps: the road estimate where that's the fill, else the straight line. */
export const gapDistance = (gaps: TrackGap[] = []) =>
  gaps.reduce((sum, g) => sum + (usesRoad(g) ? g.routeM! : g.straightM), 0);

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
  /** came from a GPX file rather than being recorded in the app */
  imported?: boolean;
  /**
   * The account this trip belongs to: set when it's recorded while signed in,
   * uploaded, or downloaded. Missing: recorded while signed out (it joins the
   * next account that signs in on this device).
   */
  ownerId?: string;
  /**
   * In the account but not downloaded to this device yet (from another device):
   * everything except the track, which is fetched when the trip is opened.
   */
  summaryOnly?: boolean;
  /** renamed on this device and the account doesn't have the new name yet */
  renamed?: boolean;
  /** summaryOnly trips: the route's shape, as encoded polylines */
  line?: string[];
}
