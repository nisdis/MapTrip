import type { Trip } from "../types/trip";

/** Saves a trip for the signed-in user. Returns the sync timestamp. */
export async function saveTripToCloud(trip: Trip): Promise<number> {
  let response: Response;
  try {
    response = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trip),
    });
  } catch {
    throw new Error("You appear to be offline. Try again when connected.");
  }
  if (response.status === 401) throw new Error("Please sign in to save to the cloud");
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Failed to save to cloud");
  return body.syncedAt as number;
}
