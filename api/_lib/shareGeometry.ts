import type { Pool, PoolClient } from "pg";
import { bboxOf, pointsOf, trimEnds, type ShareSettings } from "./publicTrip.js";
import { routePolylines } from "./trackFormat.js";

/** Card drawings only need the shape: a coarser line is plenty, and smaller. */
const SHARE_LINE_TOLERANCE_M = 15;

/**
 * What others may see of a trip's route, kept ready: the area its *visible*
 * (trimmed) route covers, for Explore, and that route as encoded polylines,
 * for drawing it on trip cards. Never the full route (that's trips.polyline,
 * which can show where someone lives). Recomputed when sharing settings change
 * or the trip is saved again.
 */
export async function refreshShareGeometry(db: Pool | PoolClient, tripId: string): Promise<number> {
  const { rows } = await db.query<{ data: unknown; share: Partial<ShareSettings> }>(
    "select data, share from trips where id = $1",
    [tripId],
  );
  if (!rows[0]) return 0;
  const visible = trimEnds(pointsOf(rows[0].data), rows[0].share?.hideM ?? 500);
  const box = visible.length >= 2 ? bboxOf(visible) : null;
  const lines = routePolylines(visible, SHARE_LINE_TOLERANCE_M);
  await db.query(
    `update trips set min_lat = $2, max_lat = $3, min_lng = $4, max_lng = $5, share_polyline = $6::jsonb
     where id = $1`,
    [
      tripId,
      box?.minLat ?? null,
      box?.maxLat ?? null,
      box?.minLng ?? null,
      box?.maxLng ?? null,
      JSON.stringify(lines),
    ],
  );
  return visible.length;
}

/** Fills in share_polyline for trips saved before it existed. Safe to run again. */
export async function backfillShareGeometry(db: Pool | PoolClient): Promise<number> {
  const { rows } = await db.query<{ id: string }>("select id from trips where share_polyline is null");
  for (const r of rows) await refreshShareGeometry(db, r.id);
  return rows.length;
}
