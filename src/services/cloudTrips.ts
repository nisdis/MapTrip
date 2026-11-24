import { upload } from "@vercel/blob/client";
import type { Trip, TripPhoto } from "../types/trip";
import { getPhotoBlob } from "./photoStore";
import { toStoredTrip } from "./tripStore";

/**
 * The trip as the request body: gzipped where the browser can (a long trip is
 * several MB of JSON, more than a request may carry; gzip makes it ~5x smaller).
 */
async function tripBody(trip: Trip): Promise<{ body: BodyInit; type: string }> {
  const json = JSON.stringify(toStoredTrip(trip));
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
