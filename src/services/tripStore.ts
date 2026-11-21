import localforage from "localforage";
import type { Trip } from "../types/trip";

// Local trip storage: free, open, no login. Lives in the browser's IndexedDB.
const store = localforage.createInstance({
  name: "record-my-trip",
  storeName: "trips",
});

export function newTripId(): string {
  return crypto.randomUUID();
}

export async function saveTripLocally(trip: Trip): Promise<void> {
  await store.setItem(trip.id, trip);
}

export async function listLocalTrips(): Promise<Trip[]> {
  const trips: Trip[] = [];
  await store.iterate<Trip, void>((value) => {
    trips.push(value);
  });
  return trips.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteLocalTrip(id: string): Promise<void> {
  await store.removeItem(id);
}
