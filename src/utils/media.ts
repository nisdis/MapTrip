import type { TrackPoint, TripPhoto } from "../types/trip";

// Photos and videos on a trip: when they were taken, and where on the route.

export const MAX_VIDEO_S = 30;
/** 30 s of phone video is well under this; it guards against odd files. */
export const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const videoExt = (mime: string) => (mime === "video/quicktime" ? "mov" : mime === "video/webm" ? "webm" : "mp4");

/**
 * When a JPEG was taken, from its EXIF DateTimeOriginal (camera's local time,
 * read in this device's time zone). null if it has none.
 */
export function exifTakenAt(buf: ArrayBuffer): number | null {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 4 < v.byteLength) {
    const marker = v.getUint16(off);
    const len = v.getUint16(off + 2);
    if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return readExif(v, off + 10);
    if ((marker & 0xff00) !== 0xff00) return null;
    off += 2 + len;
  }
  return null;
}

function readExif(v: DataView, tiff: number): number | null {
  const little = v.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => v.getUint16(o, little);
  const u32 = (o: number) => v.getUint32(o, little);
  const tag = (ifd: number, want: number): number | null => {
    if (ifd + 2 > v.byteLength) return null;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > v.byteLength) return null;
      if (u16(e) === want) return e;
    }
    return null;
  };
  try {
    const ifd0 = tiff + u32(tiff + 4);
    const exifPtr = tag(ifd0, 0x8769);
    const ifds = exifPtr != null ? [tiff + u32(exifPtr + 8), ifd0] : [ifd0];
    for (const ifd of ifds) {
      for (const want of [0x9003, 0x0132]) {
        const e = tag(ifd, want);
        if (e == null) continue;
        const at = tiff + u32(e + 8);
        let s = "";
        for (let i = 0; i < 19 && at + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(at + i));
        const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
      }
    }
  } catch {
    /* damaged EXIF: no date */
  }
  return null;
}

/** How far outside the trip's time something can be and still count (a photo at the start or end). */
const SLACK_MS = 2 * 60 * 1000;

/** Where the route was at time t (between the two points around it), or null if t is outside the trip. */
export function placeOnTrack(track: TrackPoint[], t: number | null | undefined): { lat: number; lng: number } | null {
  if (t == null || !track.length) return null;
  const first = track[0];
  const last = track[track.length - 1];
  if (t < first.t - SLACK_MS || t > last.t + SLACK_MS) return null;
  if (t <= first.t) return { lat: first.lat, lng: first.lng };
  if (t >= last.t) return { lat: last.lat, lng: last.lng };
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  // Across a pause in tracking, don't invent a position in between: take the nearer end.
  if (b.gap) return t - a.t < b.t - t ? { lat: a.lat, lng: a.lng } : { lat: b.lat, lng: b.lng };
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  const r6 = (x: number) => Math.round(x * 1e6) / 1e6; // like the track's own points (~0.1 m)
  return { lat: r6(a.lat + (b.lat - a.lat) * f), lng: r6(a.lng + (b.lng - a.lng) * f) };
}

/** Gives media without a position one from the track, by when it was taken. */
export function placeMedia(media: TripPhoto[], track: TrackPoint[]): TripPhoto[] {
  return media.map((m) => {
    if (m.lat != null && m.lng != null) return m;
    const at = placeOnTrack(track, m.takenAt);
    return at ? { ...m, ...at } : m;
  });
}

/** A video's length in seconds (the browser reads it from the file). */
export function videoDuration(file: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(v.duration);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that video"));
    };
    v.src = url;
  });
}
