import type { TrackPoint } from "../types/trip";

// Client for /api/live. The wire format for a point is a compact tuple:
// [lat, lng, epoch ms, speed m/s | null, gap 0/1]
export type LivePoint = [number, number, number, number | null, 0 | 1];
export type ShareDuration = "1h" | "8h" | "trip";

export interface LiveStats {
  distanceM: number;
  estimatedM: number;
  maxSpeedMs: number;
  speedMs: number;
  altitudeM: number | null;
  activeSeconds: number;
}

/** What a viewer gets for a live link (see api/live.ts). */
export type LiveView =
  | { state: "missing" | "ended" | "expired" }
  | {
      state: "live";
      status: "recording" | "paused";
      startedAt: number;
      updatedAt: number;
      expiresAt: number;
      stats: LiveStats;
      rev: number;
      from: number;
      total: number;
      points: LivePoint[];
      current: { lat: number; lng: number; t: number } | null;
      nearStart: boolean;
    };

export class LiveShareError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const toLivePoint = (p: TrackPoint): LivePoint => [p.lat, p.lng, p.t, p.speed, p.gap ? 1 : 0];

export const liveUrl = (token: string) => `${window.location.origin}/live/${token}`;

/** Max points per upload; a longer backlog (after a dead zone) goes in several requests. */
export const MAX_POINTS_PER_UPDATE = 2000;

async function post<T>(body: unknown, keepalive = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive,
    });
  } catch {
    throw new LiveShareError("You're offline. Live updates will catch up when you're back online.", 0);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new LiveShareError(typeof data.message === "string" ? data.message : "Live sharing failed", res.status, data);
  }
  return data as T;
}

export const startLiveShare = (duration: ShareDuration, tripStartedAt: number) =>
  post<{ token: string; expiresAt: number }>({ action: "start", duration, tripStartedAt });

export const sendLiveUpdate = (
  token: string,
  from: number,
  points: LivePoint[],
  status: "recording" | "paused",
  stats: LiveStats,
) => post<{ count: number; expiresAt: number }>({ action: "update", token, from, points, status, stats });

export const extendLiveShare = (token: string) =>
  post<{ expiresAt: number; atLimit: boolean }>({ action: "extend", token });

/** keepalive: still sent if the page is closing. */
export const stopLiveShare = (token: string) => post<{ ok: true }>({ action: "stop", token }, true);

export async function fetchLiveView(token: string, since = 0, rev = 0, signal?: AbortSignal): Promise<LiveView> {
  const q = since > 0 ? `&since=${since}&rev=${rev}` : "";
  const res = await fetch(`/api/live?token=${encodeURIComponent(token)}${q}`, { signal });
  if (res.status === 404) return { state: "missing" };
  if (!res.ok) throw new Error("Couldn't load the live trip");
  return (await res.json()) as LiveView;
}
