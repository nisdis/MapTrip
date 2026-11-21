import type { SearchResult } from "../services/searchService";

export interface TrackPoint {
  lat: number;
  lng: number;
  /** epoch ms */
  t: number;
  /** m/s, if the device reported it */
  speed: number | null;
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
  /** set once the trip has been saved to the cloud */
  cloudSyncedAt?: number;
}
