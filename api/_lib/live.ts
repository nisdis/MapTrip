// Pure helpers for live trip sharing (no database, no request handling), so the
// rules are easy to test: what a share may contain, the privacy trim at the
// start, how long a link lasts, and how a long trail is kept small.

/** One trail point as sent and stored: [lat, lng, epoch ms, speed m/s | null, gap 0/1] */
export type LivePoint = [number, number, number, number | null, 0 | 1];

export interface LiveStats {
  distanceM: number;
  estimatedM: number;
  maxSpeedMs: number;
  speedMs: number;
  altitudeM: number | null;
  activeSeconds: number;
}

export type ShareDuration = "1h" | "8h" | "trip";

const HOUR = 3600_000;
/** Every link stops working within a day, whatever was chosen. */
export const MAX_LIFETIME_MS = 24 * HOUR;
export const EXTEND_MS = HOUR;
/** Points within this distance of the start are never shown (it's usually home). */
export const START_PRIVACY_M = 300;
/** Above this, the stored trail is thinned (every other point dropped). */
export const MAX_STORED_POINTS = 20_000;
export const MAX_POINTS_PER_UPDATE = 2_000;
const MAX_SPEED_MS = 340; // ~1,220 km/h (a plane with a tailwind): anything faster is bad data

export const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

export function durationMs(d: unknown): number | null {
  if (d === "1h") return HOUR;
  if (d === "8h") return 8 * HOUR;
  if (d === "trip") return MAX_LIFETIME_MS;
  return null;
}

/** New expiry after "+1 h": from now if already past, never beyond 24 h after creation. */
export function extendedExpiry(createdAt: number, expiresAt: number, now: number): number {
  return Math.min(Math.max(expiresAt, now) + EXTEND_MS, createdAt + MAX_LIFETIME_MS);
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A valid point, or null. Timestamps must be plausible (not years off, not far in the future). */
export function cleanPoint(raw: unknown, now: number): LivePoint | null {
  if (!Array.isArray(raw)) return null;
  const [lat, lng, t, speed, gap] = raw;
  if (!finite(lat) || !finite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (!finite(t) || t < now - 2 * MAX_LIFETIME_MS || t > now + 10 * 60_000) return null;
  const s = finite(speed) && speed >= 0 && speed <= MAX_SPEED_MS ? Math.round(speed * 10) / 10 : null;
  return [Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6, Math.round(t), s, gap === 1 ? 1 : 0];
}

export function cleanStats(raw: unknown): LiveStats {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nonNeg = (v: unknown, max: number) => (finite(v) ? Math.min(Math.max(v, 0), max) : 0);
  return {
    distanceM: nonNeg(r.distanceM, 5_000_000),
    estimatedM: nonNeg(r.estimatedM, 5_000_000),
    maxSpeedMs: nonNeg(r.maxSpeedMs, MAX_SPEED_MS),
    speedMs: nonNeg(r.speedMs, MAX_SPEED_MS),
    altitudeM: finite(r.altitudeM) && Math.abs(r.altitudeM) < 12_000 ? Math.round(r.altitudeM) : null,
    activeSeconds: Math.round(nonNeg(r.activeSeconds, 2 * 86_400)),
  };
}

export function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * What viewers may see: every point within START_PRIVACY_M of the trip's first
 * point is removed (also when the trip comes back past the start). The result
 * only ever grows as points are added, so viewers can fetch just the new part.
 */
export function visibleTrail(points: LivePoint[]): LivePoint[] {
  if (!points.length) return [];
  const start: [number, number] = [points[0][0], points[0][1]];
  const out: LivePoint[] = [];
  let hidden = false;
  for (const p of points) {
    if (haversineM(start, [p[0], p[1]]) < START_PRIVACY_M) {
      hidden = true;
      continue;
    }
    // Don't join the line across a stretch that was hidden.
    out.push(hidden && out.length ? [p[0], p[1], p[2], p[3], 1] : p);
    hidden = false;
  }
  return out;
}

/**
 * Halve a long trail: keep every other point, plus the last one. A dropped
 * point's gap flag moves to the next kept point so breaks stay breaks.
 */
export function thin(points: LivePoint[]): LivePoint[] {
  const out: LivePoint[] = [];
  let carryGap = false;
  points.forEach((p, i) => {
    const keep = i % 2 === 0 || i === points.length - 1;
    if (!keep) {
      if (p[4] === 1) carryGap = true;
      return;
    }
    out.push(carryGap ? [p[0], p[1], p[2], p[3], 1] : p);
    carryGap = false;
  });
  return out;
}
