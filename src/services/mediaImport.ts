import type { TrackPoint, TripPhoto } from "../types/trip";
import { MAX_VIDEO_INPUT_BYTES, VIDEO_TYPES, exifTakenAt, imageFormat, placeOnTrack, tooLongToFit, videoDuration, videoSizeProblem } from "../utils/media";
import { readAndShrink } from "./videoShrink";
import { prepareImage, savePhotoBlob } from "./photoStore";

/** Video types by file name, for phones that don't say what a file is. */
const byName = (name: string) =>
  /\.mp4$/i.test(name) ? "video/mp4" : /\.mov$/i.test(name) ? "video/quicktime" : /\.webm$/i.test(name) ? "video/webm" : "";

/**
 * Keeps a photo or video for a trip on this device, with when it was taken
 * and, if that's during the trip, where on the route. Photos are resized
 * (and lose their metadata); videos, up to 100 MB once shrunk, are shrunk to 720p
 * on the phone (the original stays in the phone's gallery).
 */
export async function importMedia(file: File, track: TrackPoint[]): Promise<TripPhoto> {
  const id = crypto.randomUUID();
  const addedAt = Date.now();
  const type = file.type || byName(file.name);

  if (type.startsWith("video/")) {
    if (!VIDEO_TYPES.includes(type)) throw new Error("That video format isn't supported (MP4, MOV or WebM).");
    if (file.size > MAX_VIDEO_INPUT_BYTES) throw new Error("That video is too large. Try a shorter clip.");
    const takenAt = file.lastModified || addedAt;
    const { seconds: read, shrunk } = await readAndShrink(file, tooLongToFit);
    const seconds = Number.isFinite(read) ? read : await videoDuration(file);
    const blob: Blob = shrunk?.blob ?? file;
    const mime = shrunk?.mime ?? type;
    const problem = videoSizeProblem(blob.size);
    if (problem) throw new Error(problem);
    await savePhotoBlob(id, blob);
    return { id, addedAt, kind: "video", mime, durationS: Math.round(seconds), takenAt, ...placeOnTrack(track, takenAt) };
  }

  // Some phones don't say what an iPhone (HEIC) photo is: look at the file itself.
  if (!type.startsWith("image/") && imageFormat(await file.slice(0, 32).arrayBuffer()) !== "heic")
    throw new Error("Choose a photo or a video.");
  // The date it was taken is in the photo itself (gone once it's resized).
  const takenAt = exifTakenAt(await file.arrayBuffer()) ?? (file.lastModified || addedAt);
  const blob = await prepareImage(file);
  await savePhotoBlob(id, blob);
  return { id, addedAt, kind: "photo", takenAt, ...placeOnTrack(track, takenAt) };
}

/** Several at once; the ones that fail are reported, the rest kept. */
export async function importAll(files: File[], track: TrackPoint[]): Promise<{ added: TripPhoto[]; errors: string[] }> {
  const added: TripPhoto[] = [];
  const errors: string[] = [];
  for (const f of files) {
    try {
      added.push(await importMedia(f, track));
    } catch (e) {
      errors.push(`${f.name}: ${e instanceof Error ? e.message : "couldn't add it"}`);
    }
  }
  return { added, errors };
}
