// Replaying a recorded trip: where it was, how fast and how high, at any
// moment. Pure functions, so the app and the shared-trip page agree and the
// maths can be tested without a map.
//
// "Trip time" is the time the replay runs on. It follows the recorded clock,
// except across a pause in tracking (a point marked `gap`): there the dot
// jumps to the next point at once, so a 40-minute stretch with the screen off
// doesn't mean 40 minutes of nothing in the replay.

import { haversine } from "./geo";

export interface ReplayPoint {
  lat: number;
  lng: number;
  /** epoch ms */
  t: number;
  speed: number | null;
  alt?: number | null;
  gap?: boolean;
}

export interface Timeline {
  points: ReplayPoint[];
  /** trip time (ms from the start) at each point */
  at: number[];
  /** metres covered by each point (gaps count their estimate) */
  dist: number[];
  durationMs: number;
  totalM: number;
  hasAlt: boolean;
}

export interface ReplayState {
  lat: number;
  lng: number;
  /** trip time, ms from the start */
  ms: number;
  distanceM: number;
  /** m/s */
  speedMs: number;
  altM: number | null;
  /** the recorded clock time (epoch ms) */
  clock: number;
  /** index of the point at or before this moment */
  index: number;
}

/** When a track has no usable times (some imported files): play it as if at this speed. */
const FALLBACK_SPEED_MS = 50 / 3.6;

/**
 * @param gapM metres to count across each pause, by the index of the point
 *   after it (the road or straight-line estimate). Without it, nothing is
 *   counted across a pause, like the trip stats.
 */
export function buildTimeline(points: ReplayPoint[], gapM: Map<number, number> = new Map()): Timeline {
  const at: number[] = [];
  const dist: number[] = [];
  let ms = 0;
  let m = 0;
  points.forEach((p, i) => {
    if (i > 0) {
      const prev = points[i - 1];
      if (p.gap) m += gapM.get(i) ?? 0;
      else {
        m += haversine(prev, p);
        ms += Math.max(0, p.t - prev.t);
      }
    }
    at.push(ms);
    dist.push(m);
  });
  if (ms === 0 && m > 0) {
    // No times: space the points by distance instead.
    for (let i = 0; i < at.length; i++) at[i] = (dist[i] / FALLBACK_SPEED_MS) * 1000;
    ms = at[at.length - 1];
  }
  return {
    points,
    at,
    dist,
    durationMs: ms,
    totalM: m,
    hasAlt: points.some((p) => p.alt != null),
  };
}

/** Index of the last point at or before trip time `ms` (binary search). */
function indexAt(tl: Timeline, ms: number): number {
  let lo = 0;
  let hi = tl.at.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tl.at[mid] <= ms) lo = mid;
    else hi = mid - 1;
  }
  // Several points at the same moment (a pause): take the last, so the dot is past the jump.
  return lo;
}

/** Nearest known altitude around index i (some fixes have none). */
function altNear(points: ReplayPoint[], i: number): number | null {
  for (let d = 0; d < 20; d++) {
    const a = points[i - d]?.alt;
    if (a != null) return a;
    const b = points[i + d]?.alt;
    if (b != null) return b;
  }
  return null;
}

export function stateAt(tl: Timeline, msIn: number): ReplayState {
  const { points, at, dist } = tl;
  const ms = Math.max(0, Math.min(tl.durationMs, msIn));
  const i = indexAt(tl, ms);
  const a = points[i];
  const b = points[i + 1];
  if (!b || b.gap || at[i + 1] === at[i]) {
    return {
      lat: a.lat,
      lng: a.lng,
      ms,
      distanceM: dist[i],
      speedMs: a.speed ?? 0,
      altM: a.alt ?? altNear(points, i),
      clock: a.t,
      index: i,
    };
  }
  const f = (ms - at[i]) / (at[i + 1] - at[i]);
  const lerp = (x: number, y: number) => x + (y - x) * f;
  // Speed: the recorded (smoothed) speed where there is one, else distance over time.
  const segSpeed = (dist[i + 1] - dist[i]) / ((at[i + 1] - at[i]) / 1000);
  const sa = a.speed ?? segSpeed;
  const sb = b.speed ?? segSpeed;
  const aa = a.alt ?? altNear(points, i);
  const ab = b.alt ?? aa;
  return {
    lat: lerp(a.lat, b.lat),
    lng: lerp(a.lng, b.lng),
    ms,
    distanceM: lerp(dist[i], dist[i + 1]),
    speedMs: lerp(sa, sb),
    altM: aa != null && ab != null ? lerp(aa, ab) : aa,
    clock: lerp(a.t, b.t),
    index: i,
  };
}

/**
 * Trip time at a recorded clock time (for a photo taken then), or null if
 * it's outside the trip. Inside a pause: the moment the replay jumps over it.
 */
export function msAtClock(tl: Timeline, clock: number): number | null {
  const { points, at } = tl;
  if (!points.length || clock < points[0].t || clock > points[points.length - 1].t) return null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (clock > b.t) continue;
    if (b.gap || b.t === a.t) return at[i];
    return at[i - 1] + ((clock - a.t) / (b.t - a.t)) * (at[i] - at[i - 1]);
  }
  return tl.durationMs;
}

/** How many times faster than real life the replay can run. */
export const RATES = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 3600] as const;

/** The slowest rate that plays the whole trip in about a minute and a half or less. */
export function defaultRate(durationMs: number): number {
  for (const r of RATES) if (durationMs / r <= 90_000) return r;
  return RATES[RATES.length - 1];
}

export interface ChartSample {
  ms: number;
  /** km/h */
  kmh: number;
  altM: number | null;
}

/** `n` evenly spaced samples across the trip, for the speed and altitude graph. */
export function chartSamples(tl: Timeline, n = 160): ChartSample[] {
  if (tl.points.length < 2 || tl.durationMs <= 0) return [];
  const out: ChartSample[] = [];
  for (let k = 0; k < n; k++) {
    const ms = (tl.durationMs * k) / (n - 1);
    const s = stateAt(tl, ms);
    out.push({ ms, kmh: Math.max(0, s.speedMs * 3.6), altM: s.altM });
  }
  return out;
}
