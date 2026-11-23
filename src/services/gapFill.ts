import { haversine } from "../utils/geo";
import { routePath } from "./routeService";
import type { GapReason, TrackGap } from "../types/trip";

// Filling a stretch with no GPS (screen off in the browser). A road route is
// only a guess, and a bad one on a train or a ferry, so it is checked:
//  - both ends next to a railway line: probably a train -> straight line
//  - the road route would need an impossible average speed -> straight line
//  - the road route is a huge detour (water, no road) -> straight line
// The person can switch any gap between road and straight on the summary.

const RAIL_RADIUS_M = 60;
const MAX_ROAD_KMH = 140;
const MAX_DETOUR = 2.5;

type P = { lat: number; lng: number };

/** True if both points are within RAIL_RADIUS_M of a railway line (OpenStreetMap, via Overpass). */
export async function nearRailway(a: P, b: P, signal?: AbortSignal): Promise<boolean> {
  const rail = '[railway~"^(rail|subway|light_rail|narrow_gauge|monorail)$"]';
  const q =
    `[out:json][timeout:8];` +
    `way(around:${RAIL_RADIUS_M},${a.lat},${a.lng})${rail}->.a;` +
    `way(around:${RAIL_RADIUS_M},${b.lat},${b.lng})${rail}->.b;` +
    `.a out count;.b out count;`;
  try {
    const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, {
      signal: signal ?? AbortSignal.timeout(10000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { elements?: { tags?: { ways?: string } }[] };
    const counts = (body.elements ?? []).map((e) => Number(e.tags?.ways ?? 0));
    return counts.length === 2 && counts[0] > 0 && counts[1] > 0;
  } catch {
    return false;
  }
}

/** Why a road route can't be right for this gap, or null if it's plausible. */
export function judgeRoad(opts: {
  straightM: number;
  routeM: number | null;
  durationMs: number;
  nearRail: boolean;
}): GapReason | null {
  if (opts.nearRail) return "rail";
  if (opts.routeM == null) return null;
  const hours = opts.durationMs / 3_600_000;
  if (hours > 0 && opts.routeM / 1000 / hours > MAX_ROAD_KMH) return "too-fast";
  if (opts.straightM > 1000 && opts.routeM > MAX_DETOUR * opts.straightM) return "detour";
  return null;
}

/** Road route and the automatic choice of fill for a new gap. */
export async function fillGap(from: P, to: P, durationMs: number): Promise<Pick<TrackGap, "routeM" | "path" | "fill" | "reason">> {
  const [route, rail] = await Promise.all([routePath(from, to), nearRailway(from, to)]);
  const reason = judgeRoad({
    straightM: haversine(from, to),
    routeM: route?.distanceM ?? null,
    durationMs,
    nearRail: rail,
  });
  return {
    routeM: route?.distanceM ?? null,
    path: route?.path ?? null,
    fill: reason ? "straight" : "road",
    reason: reason ?? undefined,
  };
}
