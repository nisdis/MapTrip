// Shrinks a phone video before it is kept with a trip, without visible loss
// on a phone: 720p at a generous 5 Mbit/s, the original frame rate (60 fps
// stays smooth) and the original sound, untouched. A minute of 4K (~400 MB)
// becomes ~37 MB, so it fits on the phone, uploads quickly and is cheap to keep.
//
// Runs on the phone (WebCodecs, through Mediabunny, loaded only when a video
// is added). Where the browser can't do it, the original is kept if it is
// small enough.

import { useSyncExternalStore } from "react";

export const TARGET_SHORT_SIDE = 720;
const TARGET_BITRATE = 5_000_000;
/** Below this bitrate and size, a video is already small: kept as it is. */
const SMALL_BITRATE = 6_000_000;

export interface ShrunkVideo {
  blob: Blob;
  mime: string;
  seconds: number;
}

/** Size after shrinking, keeping the shape; even numbers (encoders need them). */
export function targetSize(width: number, height: number): { width: number; height: number } | null {
  const short = Math.min(width, height);
  if (short <= TARGET_SHORT_SIDE) return null;
  const k = TARGET_SHORT_SIDE / short;
  const even = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/** Whether a video is worth shrinking: bigger than 720p, too high a bitrate, or MOV (plays badly on the web). */
export function needsShrink(v: { width: number; height: number; bytes: number; seconds: number; mime: string }): boolean {
  if (v.mime === "video/quicktime") return true;
  if (Math.min(v.width, v.height) > TARGET_SHORT_SIDE) return true;
  return v.seconds > 0 && (v.bytes * 8) / v.seconds > SMALL_BITRATE;
}

// ------------------------------------------------------------------ progress

type Progress = { name: string; fraction: number } | null;
let progress: Progress = null;
const subs = new Set<() => void>();
function setProgress(p: Progress) {
  progress = p;
  subs.forEach((f) => f());
}
/** The video being shrunk right now, if any (for a progress note on screen). */
export function useVideoProgress(): Progress {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => progress,
  );
}

// ------------------------------------------------------------------ shrink

/**
 * The video, its length, and a smaller copy where that helps. Throws only if
 * the file can't be read at all; null means "couldn't shrink here, use the original".
 */
export async function readAndShrink(
  file: File,
  /** Too long to fit even once shrunk: don't spend minutes on it. */
  tooLong: (seconds: number, fileBytes: number) => boolean,
): Promise<{ seconds: number; shrunk: ShrunkVideo | null }> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("That file has no video in it.");
    const seconds = await input.computeDuration();
    if (tooLong(seconds, file.size)) return { seconds, shrunk: null };
    const mime = file.type || "video/mp4";
    const big = needsShrink({ width: video.displayWidth, height: video.displayHeight, bytes: file.size, seconds, mime });
    if (!big || typeof VideoEncoder === "undefined") return { seconds, shrunk: null };

    // H.264 in MP4 plays everywhere; VP9 in WebM where H.264 can't be encoded.
    const avc = await mb.canEncodeVideo("avc", { width: 1280, height: 720, bitrate: TARGET_BITRATE });
    const vp9 = !avc && (await mb.canEncodeVideo("vp9", { width: 1280, height: 720, bitrate: TARGET_BITRATE }));
    if (!avc && !vp9) return { seconds, shrunk: null };

    const target = new mb.BufferTarget();
    const output = new mb.Output({
      format: avc ? new mb.Mp4OutputFormat({ fastStart: "in-memory" }) : new mb.WebMOutputFormat(),
      target,
    });
    const size = targetSize(video.displayWidth, video.displayHeight);
    const conversion = await mb.Conversion.init({
      input,
      output,
      tracks: "primary",
      showWarnings: false,
      video: {
        ...(size ?? {}),
        fit: "contain",
        codec: avc ? "avc" : "vp9",
        bitrate: TARGET_BITRATE,
        forceTranscode: true,
      },
      // Sound is copied as it is (no loss); re-encoded only if MP4/WebM can't hold it.
    });
    if (!conversion.isValid) return { seconds, shrunk: null };
    setProgress({ name: file.name, fraction: 0 });
    conversion.onProgress = (fraction) => setProgress({ name: file.name, fraction });
    await conversion.execute();
    const buffer = target.buffer;
    if (!buffer || buffer.byteLength >= file.size) return { seconds, shrunk: null }; // no smaller: keep the original
    const outMime = avc ? "video/mp4" : "video/webm";
    return { seconds, shrunk: { blob: new Blob([buffer], { type: outMime }), mime: outMime, seconds } };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("That file")) throw e;
    console.warn("Video shrink failed; keeping the original:", e);
    return { seconds: NaN, shrunk: null };
  } finally {
    setProgress(null);
    input.dispose();
  }
}
