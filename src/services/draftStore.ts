import localforage from "localforage";
import type { TrackGap, TrackPoint } from "../types/trip";
import { decodeTrack, encodeTrack, type TrackTable } from "../../api/_lib/trackFormat";

// An in-progress trip is saved here so it survives a closed tab or a dead phone.
const store = localforage.createInstance({
  name: "record-my-trip",
  storeName: "draft",
});

export interface TripDraft {
  startedAt: number;
  track: TrackPoint[];
  gaps?: TrackGap[];
  distanceM: number;
  maxSpeedMs: number;
  activeSeconds: number;
  savedAt: number;
}

const KEY = "current";

// Stored with the track as a table of points, like saved trips (trackFormat.ts).
type StoredDraft = Omit<TripDraft, "track"> & { track: TrackTable | TrackPoint[] };

export const saveDraft = (draft: TripDraft) =>
  store.setItem<StoredDraft>(KEY, { ...draft, track: encodeTrack(draft.track) });

export async function loadDraft(): Promise<TripDraft | null> {
  const stored = await store.getItem<StoredDraft>(KEY);
  return stored ? { ...stored, track: decodeTrack(stored.track) } : null;
}
export const clearDraft = () => store.removeItem(KEY);
