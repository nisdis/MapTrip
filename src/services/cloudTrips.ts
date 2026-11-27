import { upload } from "@vercel/blob/client";
import type { Trip, TripPhoto } from "../types/trip";
import { getPhotoBlob } from "./photoStore";
import { fromStoredTrip, toStoredTrip, type StoredTrip } from "./tripStore";

/**
 * The trip as the request body: gzipped where the browser can (a long trip is
 * several MB of JSON, more than a request may carry; gzip makes it ~5x smaller).
 */
async function tripBody(trip: Trip): Promise<{ body: BodyInit; type: string }> {
  // This device's bookkeeping stays on this device.
  const rest: Trip = { ...trip };
  delete rest.ownerId;
  delete rest.summaryOnly;
  delete rest.line;
  const json = JSON.stringify(toStoredTrip(rest));
  if (typeof CompressionStream === "undefined") return { body: json, type: "application/json" };
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  return { body: await new Response(stream).blob(), type: "application/gzip" };
}

export const cloudPhotoPath = (userId: string, photoId: string) =>
  `trips/${userId}/${photoId}.jpg`;

/** True if the trip has photos that aren't in the cloud yet. */
export function hasUnsyncedPhotos(trip: Trip): boolean {
  return (trip.photos ?? []).some((p) => !p.cloudPath);
}

async function uploadPhotos(userId: string, photos: TripPhoto[]): Promise<TripPhoto[]> {
  const result: TripPhoto[] = [];
  for (const photo of photos) {
    if (photo.cloudPath) {
      result.push(photo);
      continue;
    }
    const blob = await getPhotoBlob(photo.id);
    if (!blob) continue; // photo no longer on this device; skip it
    const path = cloudPhotoPath(userId, photo.id);
    await upload(path, blob, {
      access: "private",
      contentType: "image/jpeg",
      handleUploadUrl: "/api/photos/upload",
    });
    result.push({ ...photo, cloudPath: path });
  }
  return result;
}

/**
 * Uploads any pending photos, then saves the trip for the signed-in user.
 * Returns the trip as it should now be stored locally.
 */
export async function saveTripToCloud(trip: Trip, userId: string): Promise<Trip> {
  let photos = trip.photos;
  try {
    if (photos?.length) photos = await uploadPhotos(userId, photos);
  } catch (e) {
    throw new Error(
      e instanceof Error && e.message ? `Photo upload failed: ${e.message}` : "Photo upload failed",
    );
  }
  const toSave: Trip = { ...trip, photos };

  let response: Response;
  try {
    const { body, type } = await tripBody(toSave);
    response = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": type },
      body,
    });
  } catch {
    throw new Error("You appear to be offline. Try again when connected.");
  }
  if (response.status === 401) throw new Error("Please sign in to save to the cloud");
  if (response.status === 413) throw new Error("This trip is too large to save to the cloud");
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Failed to save to cloud");
  return { ...toSave, cloudSyncedAt: body.syncedAt as number };
}

/** Every trip in the account, without tracks (to list them on any device). */
export async function listCloudTrips(): Promise<Trip[]> {
  const res = await fetch("/api/trips");
  if (!res.ok) throw new Error("Couldn't load your trips");
  const body = (await res.json()) as { trips: Trip[] };
  return body.trips.map((t) => ({ ...t, summaryOnly: true }));
}

/** One trip in full, to open it on this device. */
export async function fetchCloudTrip(id: string): Promise<Trip> {
  let res: Response;
  try {
    res = await fetch(`/api/trips?id=${encodeURIComponent(id)}`);
  } catch {
    throw new Error("Connect to the internet to open this trip the first time.");
  }
  if (res.status === 404) throw new Error("This trip is no longer in your account.");
  if (!res.ok) throw new Error("Couldn't download the trip");
  const { trip } = (await res.json()) as { trip: StoredTrip };
  const full = fromStoredTrip(trip);
  delete full.summaryOnly;
  delete full.line;
  return full;
}

/** Removes a trip from the account (and so from its share link, Explore and other devices). */
export async function deleteCloudTrip(id: string): Promise<void> {
  const res = await fetch(`/api/trips?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  // Already gone counts as done.
  if (!res.ok && res.status !== 404) throw new Error("Couldn't delete the trip from your account");
}

// Deletions made offline, sent when the connection is back (so the trip
// doesn't stay in the account, on its share link, or come back on sync).
const DELETES_KEY = "pendingTripDeletes";

export function pendingDeletes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DELETES_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function setPendingDeletes(ids: string[]) {
  try {
    localStorage.setItem(DELETES_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable: the delete is retried from the trip's next sync */
  }
}

export const queueDelete = (id: string) => setPendingDeletes([...new Set([...pendingDeletes(), id])]);
export const unqueueDelete = (id: string) => setPendingDeletes(pendingDeletes().filter((x) => x !== id));
