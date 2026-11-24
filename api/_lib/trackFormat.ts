// How a recorded track is stored (on the device, and in the cloud).
//
// Every GPS point is a row in a fixed, predefined order of columns. The
// columns are the union of what any device can report; a device that doesn't
// give a value (no altitude, no heading, ...) gets null in that column. The
// column names are stored with the track, so a reader never guesses, and new
// columns can be added at the end later without breaking old tracks.
//
// Also here: the encoded polyline saved once a trip is finished (a small,
// simplified copy of the route for drawing it without the full track).
//
// No imports: used by both the web app and the server.

/** The columns of a stored point, in order. Append new ones at the end only. */
export const TRACK_FIELDS = [
  "t", // epoch ms
  "lat", // degrees, 6 decimals (~0.1 m)
  "lng",
  "alt", // metres above sea level
  "speed", // m/s, smoothed: the speed the app shows and uses
  "accuracy", // m, horizontal
  "altAccuracy", // m
  "heading", // degrees from north
  "headingAccuracy", // degrees
  "deviceSpeed", // m/s, as reported by the device (before smoothing)
  "speedAccuracy", // m/s
  "gap", // 1: tracking paused before this point (don't join it to the previous one)
] as const;

export type TrackField = (typeof TRACK_FIELDS)[number];
export type TrackRow = (number | null)[];

/** A track as stored. */
export interface TrackTable {
  fields: string[];
  rows: TrackRow[];
}

/** A point as the app uses it. Only lat, lng and t are always there. */
export interface StoredPoint {
  lat: number;
  lng: number;
  t: number;
  speed: number | null;
  alt?: number | null;
  accuracy?: number | null;
  altAccuracy?: number | null;
  heading?: number | null;
  headingAccuracy?: number | null;
  deviceSpeed?: number | null;
  speedAccuracy?: number | null;
  gap?: boolean;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function isTrackTable(v: unknown): v is TrackTable {
  return (
    !!v &&
    typeof v === "object" &&
    Array.isArray((v as TrackTable).fields) &&
    Array.isArray((v as TrackTable).rows)
  );
}

/** Points → stored table (every column, null where the device gave nothing). */
export function encodeTrack(points: StoredPoint[]): TrackTable {
  return {
    fields: [...TRACK_FIELDS],
    rows: points.map((p) => [
      p.t,
      p.lat,
      p.lng,
      num(p.alt),
      num(p.speed),
      num(p.accuracy),
      num(p.altAccuracy),
      num(p.heading),
      num(p.headingAccuracy),
      num(p.deviceSpeed),
      num(p.speedAccuracy),
      p.gap ? 1 : 0,
    ]),
  };
}

/**
 * Stored track → points. Reads the table format and the older list of point
 * objects. Points without a valid position or time are skipped.
 */
export function decodeTrack(stored: unknown): StoredPoint[] {
  if (Array.isArray(stored)) return decodeLegacy(stored);
  if (!isTrackTable(stored)) return [];
  const col = (name: TrackField) => stored.fields.indexOf(name);
  const at = Object.fromEntries(TRACK_FIELDS.map((f) => [f, col(f)])) as Record<TrackField, number>;
  const get = (row: TrackRow, f: TrackField) => (at[f] >= 0 ? num(row[at[f]]) : null);
  const out: StoredPoint[] = [];
  for (const row of stored.rows) {
    if (!Array.isArray(row)) continue;
    const lat = get(row, "lat");
    const lng = get(row, "lng");
    const t = get(row, "t");
    if (lat == null || lng == null || t == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const p: StoredPoint = {
      lat,
      lng,
      t,
      speed: get(row, "speed"),
      alt: get(row, "alt"),
      accuracy: get(row, "accuracy"),
      altAccuracy: get(row, "altAccuracy"),
      heading: get(row, "heading"),
      headingAccuracy: get(row, "headingAccuracy"),
      deviceSpeed: get(row, "deviceSpeed"),
      speedAccuracy: get(row, "speedAccuracy"),
    };
    if (get(row, "gap") === 1) p.gap = true;
    out.push(p);
  }
  return out;
}

function decodeLegacy(list: unknown[]): StoredPoint[] {
  const out: StoredPoint[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const lat = num(r.lat);
    const lng = num(r.lng);
    const t = num(r.t);
    if (lat == null || lng == null || t == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const p: StoredPoint = {
      lat,
      lng,
      t,
      speed: num(r.speed),
      alt: num(r.alt),
      accuracy: num(r.accuracy),
      altAccuracy: num(r.altAccuracy),
      heading: num(r.heading),
      headingAccuracy: num(r.headingAccuracy),
      deviceSpeed: num(r.deviceSpeed),
      speedAccuracy: num(r.speedAccuracy),
    };
    if (r.gap === true) p.gap = true;
    out.push(p);
  }
  return out;
}

// ------------------------------------------------------------------ polyline

/** How far (metres) the simplified line may stray from the recorded one. */
export const POLYLINE_TOLERANCE_M = 5;

/**
 * The finished route as encoded polylines (Google's format, 5 decimals),
 * simplified to within `toleranceM`. One string per stretch: a pause in
 * tracking starts a new one, so no straight line is drawn across it.
 */
export function routePolylines(points: StoredPoint[], toleranceM = POLYLINE_TOLERANCE_M): string[] {
  const segments: StoredPoint[][] = [];
  for (const p of points) {
    if (!segments.length || p.gap) segments.push([]);
    segments[segments.length - 1].push(p);
  }
  return segments
    .filter((s) => s.length >= 2)
    .map((s) => encodePolyline(simplify(s.map((p) => [p.lat, p.lng] as [number, number]), toleranceM)));
}

/** Google encoded polyline algorithm format. */
export function encodePolyline(coords: [number, number][], precision = 5): string {
  const factor = 10 ** precision;
  let out = "";
  let lastLat = 0;
  let lastLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lat, lng] of coords) {
    const la = Math.round(lat * factor);
    const ln = Math.round(lng * factor);
    out += enc(la - lastLat) + enc(ln - lastLng);
    lastLat = la;
    lastLng = ln;
  }
  return out;
}

export function decodePolyline(str: string, precision = 5): [number, number][] {
  const factor = 10 ** precision;
  const out: [number, number][] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += next();
    lng += next();
    out.push([lat / factor, lng / factor]);
  }
  return out;
}

/** Douglas–Peucker, iterative (long tracks would overflow a recursive one). */
function simplify(coords: [number, number][], toleranceM: number): [number, number][] {
  if (coords.length <= 2) return coords;
  // Flat projection around the middle of the line: fine at this scale.
  const midLat = (coords[Math.floor(coords.length / 2)][0] * Math.PI) / 180;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos(midLat);
  const xy = coords.map(([la, ln]) => [ln * mPerDegLng, la * mPerDegLat]);
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let worstD = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      let d: number;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + u * dx), py - (ay + u * dy));
      }
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0 && worstD > toleranceM) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}
