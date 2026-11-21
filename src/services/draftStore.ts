import localforage from "localforage";
import type { TrackPoint } from "../types/trip";

// An in-progress trip is saved here so it survives a closed tab or a dead phone.
const store = localforage.createInstance({
  name: "record-my-trip",
  storeName: "draft",
});

export interface TripDraft {
  startedAt: number;
  track: TrackPoint[];
  distanceM: number;
  maxSpeedMs: number;
  activeSeconds: number;
  savedAt: number;
}

const KEY = "current";

export const saveDraft = (draft: TripDraft) => store.setItem(KEY, draft);
export const loadDraft = () => store.getItem<TripDraft>(KEY);
export const clearDraft = () => store.removeItem(KEY);
