import localforage from "localforage";
import type { Trip } from "../types/trip";
import { decodeTrack, encodeTrack, isTrackTable, type TrackTable } from "../../api/_lib/trackFormat";

// Local trip storage: free, open, no login. Lives in the browser's IndexedDB.
// The track is kept as a table of points (see api/_lib/trackFormat.ts), the
// same format as in the cloud; the app works with a list of point objects.
const store = localforage.createInstance({
  name: "record-my-trip",
  storeName: "trips",
});

/** A trip as stored: the same, except for the track's format. */
export type StoredTrip = Omit<Trip, "track"> & { track?: TrackTable };

export function newTripId(): string {
  return crypto.randomUUID();
}

export function toStoredTrip(trip: Trip): StoredTrip {
  const { track, ...rest } = trip;
  return track ? { ...rest, track: encodeTrack(track) } : rest;
}

export function fromStoredTrip(stored: StoredTrip | Trip): Trip {
  const { track, ...rest } = stored;
  return track ? { ...rest, track: decodeTrack(track) } : rest;
}

export async function saveTripLocally(trip: Trip): Promise<void> {
  await store.setItem(trip.id, toStoredTrip(trip));
}

export async function listLocalTrips(): Promise<Trip[]> {
  const trips: Trip[] = [];
  const old: Trip[] = [];
  await store.iterate<StoredTrip | Trip, void>((value) => {
    const trip = fromStoredTrip(value);
    trips.push(trip);
    if (Array.isArray(value.track) && !isTrackTable(value.track)) old.push(trip);
  });
  // Trips saved before the table format: store them again in it.
  for (const trip of old) await saveTripLocally(trip).catch(() => undefined);
  return trips.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteLocalTrip(id: string): Promise<void> {
  await store.removeItem(id);
}
