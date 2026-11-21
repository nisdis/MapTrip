import type { TrackPoint } from "../types/trip";
import { haversine } from "./geo";

export const MS_TO_KMH = 3.6;

/** One colour per speed band. Used by the map trail and the HUD ribbon, so they always agree. */
export const SPEED_BANDS = [
  { upToKmh: 10, color: "#3B6FB6" }, // crawling / walking
  { upToKmh: 30, color: "#1E9E8F" },
  { upToKmh: 50, color: "#7FB800" },
  { upToKmh: 70, color: "#F2B705" },
  { upToKmh: 90, color: "#F07F13" },
  { upToKmh: 120, color: "#D7263D" }, // above 90
] as const;

export const SPEED_SCALE_MAX_KMH = 120;

export function speedColor(kmh: number): string {
  for (const band of SPEED_BANDS) if (kmh < band.upToKmh) return band.color;
  return SPEED_BANDS[SPEED_BANDS.length - 1].color;
}

export interface TripStats {
  distanceM: number;
  maxSpeedMs: number;
  avgSpeedMs: number;
  ascentM: number;
  minAltM: number | null;
  maxAltM: number | null;
}

const ASCENT_THRESHOLD_M = 3; // ignore GPS altitude noise

export function computeStats(track: TrackPoint[], activeSeconds: number): TripStats {
  let distanceM = 0;
  let maxSpeedMs = 0;
  let ascentM = 0;
  let minAltM: number | null = null;
  let maxAltM: number | null = null;
  let refAlt: number | null = null;

  track.forEach((p, i) => {
    if (i > 0 && !p.gap) distanceM += haversine(track[i - 1], p);
    if (p.speed != null && p.speed > maxSpeedMs) maxSpeedMs = p.speed;
    if (p.alt != null) {
      minAltM = minAltM == null ? p.alt : Math.min(minAltM, p.alt);
      maxAltM = maxAltM == null ? p.alt : Math.max(maxAltM, p.alt);
      if (refAlt == null) refAlt = p.alt;
      else if (p.alt - refAlt >= ASCENT_THRESHOLD_M) {
        ascentM += p.alt - refAlt;
        refAlt = p.alt;
      } else if (refAlt - p.alt >= ASCENT_THRESHOLD_M) refAlt = p.alt;
    }
  });

  return {
    distanceM,
    maxSpeedMs,
    avgSpeedMs: activeSeconds > 0 ? distanceM / activeSeconds : 0,
    ascentM,
    minAltM,
    maxAltM,
  };
}

export interface TrailRun {
  color: string;
  positions: [number, number][];
}

/** Splits a track into runs of the same speed band, and at pauses. */
export function buildTrailRuns(track: TrackPoint[]): TrailRun[] {
  const runs: TrailRun[] = [];
  let current: TrailRun | null = null;
  for (let i = 1; i < track.length; i++) {
    const prev = track[i - 1];
    const p = track[i];
    if (p.gap) {
      current = null;
      continue;
    }
    const kmh = ((p.speed ?? 0) + (prev.speed ?? 0)) / 2 * MS_TO_KMH;
    const color = speedColor(kmh);
    if (!current || current.color !== color) {
      current = { color, positions: [[prev.lat, prev.lng]] };
      runs.push(current);
    }
    current.positions.push([p.lat, p.lng]);
  }
  return runs;
}

export function formatSpeedKmh(ms: number): string {
  return String(Math.round(ms * MS_TO_KMH));
}

export function formatKm(m: number): string {
  return (m / 1000).toFixed(m < 100000 ? 2 : 1);
}

export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${h}:${mm}:${ss}`;
}
