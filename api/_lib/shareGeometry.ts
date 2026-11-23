import type { Pool, PoolClient } from "pg";
import { bboxOf, pointsOf, trimEnds, type ShareSettings } from "./publicTrip.js";

/**
 * Explore finds trips by the area their *visible* (trimmed) route covers.
 * Recomputed when sharing settings change or the trip is saved again.
 */
export async function refreshShareGeometry(db: Pool | PoolClient, tripId: string): Promise<number> {
  const { rows } = await db.query<{ data: unknown; share: Partial<ShareSettings> }>(
    "select data, share from trips where id = $1",
    [tripId],
  );
  if (!rows[0]) return 0;
  const visible = trimEnds(pointsOf(rows[0].data), rows[0].share?.hideM ?? 500);
  const box = visible.length >= 2 ? bboxOf(visible) : null;
  await db.query(
    "update trips set min_lat = $2, max_lat = $3, min_lng = $4, max_lng = $5 where id = $1",
    [tripId, box?.minLat ?? null, box?.maxLat ?? null, box?.minLng ?? null, box?.maxLng ?? null],
  );
  return visible.length;
}
