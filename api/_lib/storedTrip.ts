import type { Pool, PoolClient } from "pg";
import { decodeTrack, encodeTrack, isTrackTable, routePolylines } from "./trackFormat.js";
import { routeFromPlanned } from "./plannedRoute.js";

/**
 * A trip as it goes into the database: the track as a table (see
 * trackFormat.ts) whatever format it arrived in, plus the finished route as
 * encoded polylines (null for planned trips or when there's no route).
 */
export function toStored(trip: Record<string, unknown>): { data: Record<string, unknown>; polyline: string[] | null } {
  if (trip.track == null) return { data: trip, polyline: null };
  const points = decodeTrack(trip.track);
  const lines = routePolylines(points);
  return { data: { ...trip, track: encodeTrack(points) }, polyline: lines.length ? lines : null };
}

/**
 * Converts trips saved before the table format (and fills in missing
 * polylines). Safe to run again: it only touches rows that still need it.
 */
export async function convertStoredTracks(db: Pool | PoolClient, batch = 50): Promise<number> {
  let converted = 0;
  let after = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const { rows } = await db.query<{ id: string; data: Record<string, unknown> }>(
      `select id, data from trips
        where id > $1 and data ? 'track'
          and (jsonb_typeof(data->'track') = 'array' or polyline is null)
        order by id limit $2`,
      [after, batch],
    );
    if (!rows.length) return converted;
    for (const row of rows) {
      after = row.id;
      const { data, polyline } = toStored(row.data);
      // Nothing to do for a trip already in the table format with no route.
      if (isTrackTable(row.data.track) && !polyline) continue;
      await db.query("update trips set data = $2::jsonb, polyline = $3::jsonb where id = $1", [
        row.id,
        JSON.stringify(data),
        polyline ? JSON.stringify(polyline) : null,
      ]);
      converted++;
    }
  }
}

/**
 * Planned trips (from before saved routes) become saved routes. Safe to run
 * again: a route already there is kept, and the trip row goes either way.
 */
export async function convertPlannedTrips(db: Pool | PoolClient): Promise<number> {
  const { rows } = await db.query<{ id: string; user_id: string; data: Record<string, unknown> }>(
    "select id, user_id, data from trips where data->>'kind' = 'planned'",
  );
  for (const r of rows) {
    const entry = routeFromPlanned({ ...r.data, id: r.id });
    if (entry) {
      await db.query(
        `insert into saved_places (user_id, key, data, updated_at) values ($1, $2, $3::jsonb, $4)
         on conflict (user_id, key) do nothing`,
        [r.user_id, entry.key, JSON.stringify(entry), entry.updatedAt],
      );
    }
    await db.query("delete from trips where id = $1", [r.id]);
  }
  return rows.length;
}
