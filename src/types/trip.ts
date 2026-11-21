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
  photos?: TripPhoto[];
  /** set once the trip has been saved to the cloud */
  cloudSyncedAt?: number;
}
