import type { TrackPoint, TripPhoto } from "../types/trip";

// Photos and videos on a trip: when they were taken, and where on the route.

/**
 * The most a video may be as kept and uploaded (any length). Videos are shrunk
 * to 720p on the phone first, ~40 MB a minute, so that's about 2½ minutes.
 */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
/** The most a chosen video may be before shrinking (2½ minutes of 4K is ~1 GB). */
export const MAX_VIDEO_INPUT_BYTES = 2 * 1024 * 1024 * 1024;
/** Bytes a second of video takes once shrunk (5 Mbit/s picture + the sound). */
const SHRUNK_BYTES_PER_S = 5_300_000 / 8;

/** About how long a video can be, for messages ("about 2½ minutes"). */
export function maxVideoLength(): string {
  const min = MAX_VIDEO_BYTES / SHRUNK_BYTES_PER_S / 60;
  const halves = Math.floor(min * 2) / 2;
  return `about ${Math.floor(halves)}${halves % 1 ? "½" : ""} minutes`;
}

/** Whether a video of this length can't fit even once shrunk (so don't spend minutes shrinking it). */
export const tooLongToFit = (seconds: number, fileBytes: number) =>
  fileBytes > MAX_VIDEO_BYTES && seconds * SHRUNK_BYTES_PER_S > MAX_VIDEO_BYTES;

/** Why a video can't be kept, or null if it can: only its size counts, not its length. */
export function videoSizeProblem(keptBytes: number): string | null {
  if (keptBytes <= MAX_VIDEO_BYTES) return null;
  return `That video is too large: it's ${Math.round(keptBytes / 1024 / 1024)} MB after shrinking, and videos can be up to ${MAX_VIDEO_BYTES / 1024 / 1024} MB (${maxVideoLength()}). Try a shorter clip.`;
}
/** What a photo file really is, from its first bytes (the name and type can be wrong). */
export function imageFormat(buf: ArrayBuffer): "jpeg" | "png" | "gif" | "webp" | "heic" | "avif" | "empty" | "unknown" {
  const b = new Uint8Array(buf, 0, Math.min(buf.byteLength, 32));
  if (b.length === 0) return "empty";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b[0] === 0xff && b[1] === 0xd8) return "jpeg";
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "png";
  if (ascii(0, 3) === "GIF") return "gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (brand.startsWith("avi")) return "avif";
    if (/^(hei|hev|mif1|msf1)/.test(brand)) return "heic";
  }
  return "unknown";
}

/** Why a photo couldn't be opened, in plain words. */
export function unreadablePhotoMessage(format: ReturnType<typeof imageFormat>): string {
  if (format === "heic")
    return "Couldn't open this iPhone (HEIC) photo. It may be damaged, or too large for this phone. On the iPhone, sharing it as JPEG works too.";
  if (format === "empty") return "Couldn't read this photo. If it's stored online (e.g. Google Photos), download it to the phone first.";
  if (format === "unknown") return "This file isn't a photo the app can open, or it's damaged.";
  return "Couldn't open this photo. It may be damaged, or too large for this phone.";
}

export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const videoExt = (mime: string) => (mime === "video/quicktime" ? "mov" : mime === "video/webm" ? "webm" : "mp4");

/** Where a photo's EXIF block starts (JPEG or iPhone HEIC), or null. */
function exifStart(v: DataView): number | null {
  if (imageFormat(v.buffer as ArrayBuffer) === "heic") {
    // HEIC keeps the same EXIF block, after "Exif\0\0", somewhere in the file.
    const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    for (let i = 0; i + 10 < b.length; i++) {
      if (b[i] !== 0x45 || b[i + 1] !== 0x78 || b[i + 2] !== 0x69 || b[i + 3] !== 0x66 || b[i + 4] || b[i + 5]) continue;
      const order = v.getUint16(i + 6);
      if (order === 0x4d4d || order === 0x4949) return i + 6;
    }
    return null;
  }
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 4 < v.byteLength) {
    const marker = v.getUint16(off);
    const len = v.getUint16(off + 2);
    if (marker === 0xffe1 && off + 8 < v.byteLength && v.getUint32(off + 4) === 0x45786966) return off + 10;
    if ((marker & 0xff00) !== 0xff00) return null;
    off += 2 + len;
  }
  return null;
}

/** Reads entries from a photo's EXIF block. */
function exifReader(v: DataView, tiff: number) {
  const little = v.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => v.getUint16(o, little);
  const u32 = (o: number) => v.getUint32(o, little);
  /** The entry for a tag in a directory, or null. */
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
  const ifd0 = tiff + u32(tiff + 4);
  /** A directory pointed to from the first one (EXIF 0x8769, GPS 0x8825). */
  const sub = (pointer: number) => {
    const e = tag(ifd0, pointer);
    return e == null ? null : tiff + u32(e + 8);
  };
  const text = (e: number, max: number) => {
    const count = u32(e + 4);
    const at = count <= 4 ? e + 8 : tiff + u32(e + 8);
    let s = "";
    for (let i = 0; i < Math.min(count, max) && at + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(at + i));
    return s.replace(/\0.*$/, "");
  };
  /** Three fractions (degrees, minutes, seconds) as degrees. */
  const degrees = (e: number) => {
    const at = tiff + u32(e + 8);
    const r = (i: number) => {
      const d = u32(at + i * 8 + 4);
      return d ? u32(at + i * 8) / d : 0;
    };
    return r(0) + r(1) / 60 + r(2) / 3600;
  };
  return { ifd0, tag, sub, text, degrees };
}

/**
 * When a photo (JPEG or iPhone HEIC) was taken, from its EXIF DateTimeOriginal
 * (camera's local time, read in this device's time zone). null if it has none.
 */
export function exifTakenAt(buf: ArrayBuffer): number | null {
  const v = new DataView(buf);
  try {
    const tiff = exifStart(v);
    if (tiff == null) return null;
    const x = exifReader(v, tiff);
    const exif = x.sub(0x8769);
    for (const ifd of exif != null ? [exif, x.ifd0] : [x.ifd0]) {
      for (const want of [0x9003, 0x0132]) {
        const e = x.tag(ifd, want);
        if (e == null) continue;
        const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(x.text(e, 19));
        if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
      }
    }
  } catch {
    /* damaged EXIF: no date */
  }
  return null;
}

const r6 = (x: number) => Math.round(x * 1e6) / 1e6; // like the track's own points (~0.1 m)

/** A real place: not missing, not 0,0 (what some phones write when they have no fix). */
const realPlace = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)
    ? { lat: r6(lat), lng: r6(lng) }
    : null;

/** Where a photo (JPEG or iPhone HEIC) was taken, from its EXIF GPS, or null. */
export function exifLocation(buf: ArrayBuffer): { lat: number; lng: number } | null {
  const v = new DataView(buf);
  try {
    const tiff = exifStart(v);
    if (tiff == null) return null;
    const x = exifReader(v, tiff);
    const gps = x.sub(0x8825);
    if (gps == null) return null;
    const [latRef, lat, lngRef, lng] = [1, 2, 3, 4].map((t) => x.tag(gps, t));
    if (lat == null || lng == null) return null;
    const south = latRef != null && x.text(latRef, 2) === "S";
    const west = lngRef != null && x.text(lngRef, 2) === "W";
    return realPlace((south ? -1 : 1) * x.degrees(lat), (west ? -1 : 1) * x.degrees(lng));
  } catch {
    return null; // damaged EXIF: no place
  }
}

/** The "moov" part of an MP4/MOV (where phones write where and when a video was made), or null. */
async function videoMoov(file: Blob): Promise<DataView | null> {
  let off = 0;
  for (let i = 0; i < 64 && off + 8 <= file.size; i++) {
    const head = new DataView(await file.slice(off, off + 16).arrayBuffer());
    let size = head.getUint32(0);
    const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7));
    let header = 8;
    if (size === 1 && head.byteLength >= 16) {
      size = Number(head.getBigUint64(8));
      header = 16;
    } else if (size === 0) size = file.size - off;
    if (size < header) return null;
    if (type === "moov") return size > 64 * 1024 * 1024 ? null : new DataView(await file.slice(off, off + size).arrayBuffer());
    off += size;
  }
  return null;
}

/**
 * Where and when a phone video (MP4/MOV) was made, from its own data: the place
 * Android and iPhone write as "+12.9716+077.5946/", and the time it was recorded.
 */
export async function videoInfo(file: Blob): Promise<{ place: { lat: number; lng: number } | null; takenAt: number | null }> {
  const moov = await videoMoov(file).catch(() => null);
  if (!moov) return { place: null, takenAt: null };
  const bytes = new Uint8Array(moov.buffer, moov.byteOffset, moov.byteLength);
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const m = /([+-]\d{2}(?:\.\d+)?)([+-]\d{3}(?:\.\d+)?)(?:[+-]\d+(?:\.\d+)?)?(?:CRS[^/]*)?\//.exec(text);
  const place = m ? realPlace(+m[1], +m[2]) : null;
  // The recording time: in "mvhd", in seconds since 1904 (UTC).
  let takenAt: number | null = null;
  const at = text.indexOf("mvhd");
  if (at >= 4 && at + 16 < moov.byteLength) {
    const version = moov.getUint8(at + 4);
    const s = version === 1 ? Number(moov.getBigUint64(at + 8)) : moov.getUint32(at + 8);
    const ms = (s - 2082844800) * 1000;
    if (ms > Date.UTC(2005, 0, 1) && ms < Date.now() + 24 * 3600_000) takenAt = ms;
  }
  return { place, takenAt };
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

/**
 * Where to pin media on the map: where it was taken (its own GPS, or the
 * route at the time), else at the start of the trip.
 */
export function pinMedia(media: TripPhoto[], track: TrackPoint[]): TripPhoto[] {
  const start = track[0];
  return placeMedia(media, track).map((m) => ((m.lat != null && m.lng != null) || !start ? m : { ...m, lat: start.lat, lng: start.lng }));
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
