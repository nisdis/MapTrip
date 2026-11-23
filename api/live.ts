import { randomBytes } from "node:crypto";
import { getAuth } from "./_lib/auth.js";
import { getPool } from "./_lib/db.js";
import { rejectForeignOrigin } from "./_lib/origin.js";
import {
  MAX_LIFETIME_MS,
  MAX_POINTS_PER_UPDATE,
  MAX_STORED_POINTS,
  START_PRIVACY_M,
  TOKEN_RE,
  cleanPoint,
  cleanStats,
  durationMs,
  extendedExpiry,
  haversineM,
  thin,
  visibleTrail,
  type LivePoint,
  type LiveStats,
} from "./_lib/live.js";

// Live trip sharing.
//   POST /api/live  (signed in, same site): start | update | extend | stop
//   GET  /api/live?token=…&since=…&rev=…  (public): what viewers of the link see
// Viewers never get the first 300 m of the trip, and nothing at all once the
// share has ended: the location data is deleted when it stops.

const MAX_BODY_BYTES = 300_000;

const json = (body: unknown, status = 200, cache = "no-store") =>
  Response.json(body, { status, headers: { "Cache-Control": cache } });

interface Row {
  token: string;
  created_at: Date;
  expires_at: Date;
  ended_at: Date | null;
  trip_started_at: string;
  status: string;
  stats: LiveStats;
  points: LivePoint[];
  point_count: number;
  trail_rev: number;
  updated_at: Date;
}

// ---------------------------------------------------------------- viewers

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (!TOKEN_RE.test(token)) return json({ state: "missing" }, 404, "public, max-age=60, s-maxage=3600");

  try {
    const { rows } = await getPool().query<Row>("select * from live_shares where token = $1", [token]);
    const row = rows[0];
    if (!row) return json({ state: "missing" }, 404, "public, max-age=30, s-maxage=60");
    if (row.ended_at) return json({ state: "ended" }, 200, "public, max-age=30, s-maxage=60");
    if (row.expires_at.getTime() <= Date.now()) return json({ state: "expired" }, 200, "public, max-age=30, s-maxage=60");

    const trail = visibleTrail(row.points);
    const since = Number(url.searchParams.get("since"));
    const rev = Number(url.searchParams.get("rev"));
    // Only the new part if the viewer's copy is still valid, else everything.
    const from =
      rev === row.trail_rev && Number.isInteger(since) && since > 0 && since <= trail.length ? since : 0;
    const first = row.points[0];
    const last = row.points[row.points.length - 1];
    const lastShown = trail[trail.length - 1];
    // Still (or back) close to where the trip began: don't show where they are.
    const nearStart = !!last && haversineM([first[0], first[1]], [last[0], last[1]]) < START_PRIVACY_M;

    return json(
      {
        state: "live",
        status: row.status === "paused" ? "paused" : "recording",
        startedAt: Number(row.trip_started_at),
        updatedAt: row.updated_at.getTime(),
        expiresAt: row.expires_at.getTime(),
        stats: row.stats,
        rev: row.trail_rev,
        from,
        total: trail.length,
        points: trail.slice(from),
        // Where they are now, unless that's still near the start.
        current: nearStart || !lastShown ? null : { lat: lastShown[0], lng: lastShown[1], t: lastShown[2] },
        nearStart,
      },
      200,
      // One cached answer serves every viewer for a few seconds.
      "public, max-age=5, s-maxage=10",
    );
  } catch (error) {
    console.error("Live share read error:", error);
    return json({ message: "Live sharing is not available right now." }, 503);
  }
}

// ---------------------------------------------------------------- the sharer

async function start(userId: string, body: Record<string, unknown>): Promise<Response> {
  const ms = durationMs(body.duration);
  const tripStartedAt = body.tripStartedAt;
  if (ms == null) return json({ message: "Choose how long to share for" }, 400);
  if (typeof tripStartedAt !== "number" || !Number.isFinite(tripStartedAt)) {
    return json({ message: "Missing trip start" }, 400);
  }
  const pool = getPool();
  // Housekeeping: shares that ended or expired over a day ago are deleted.
  await pool.query(
    "delete from live_shares where coalesce(ended_at, expires_at) < now() - interval '1 day'",
  );
  // One live share per person: starting a new one ends the others.
  await pool.query(
    `update live_shares set ended_at = now(), points = '[]'::jsonb, stats = '{}'::jsonb
     where user_id = $1 and ended_at is null`,
    [userId],
  );
  const token = randomBytes(16).toString("base64url");
  const { rows } = await pool.query<{ expires_at: Date }>(
    `insert into live_shares (token, user_id, expires_at, trip_started_at)
     values ($1, $2, now() + make_interval(secs => $3), $4)
     returning expires_at`,
    [token, userId, ms / 1000, Math.round(tripStartedAt)],
  );
  return json({ token, expiresAt: rows[0].expires_at.getTime(), maxExpiresAt: Date.now() + MAX_LIFETIME_MS });
}

async function update(userId: string, token: string, body: Record<string, unknown>): Promise<Response> {
  const from = body.from;
  if (!Number.isInteger(from) || (from as number) < 0) return json({ message: "Invalid position" }, 400);
  if (!Array.isArray(body.points) || body.points.length > MAX_POINTS_PER_UPDATE) {
    return json({ message: "Invalid points" }, 400);
  }
  const status = body.status === "paused" ? "paused" : "recording";
  const stats = cleanStats(body.stats);

  const client = await getPool().connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<Row>(
      `select * from live_shares
       where token = $1 and user_id = $2 and ended_at is null and expires_at > now()
       for update`,
      [token, userId],
    );
    const row = rows[0];
    if (!row) {
      await client.query("rollback");
      return json({ message: "This live share has ended" }, 410);
    }
    // The client sends everything from `from` on. Points we already have are
    // skipped, so a retried request never adds anything twice.
    if ((from as number) > row.point_count) {
      await client.query("rollback");
      return json({ message: "Points missing", count: row.point_count }, 409);
    }
    const now = Date.now();
    const fresh = (body.points as unknown[]).slice(row.point_count - (from as number));
    const added = fresh.map((p) => cleanPoint(p, now)).filter((p): p is LivePoint => p !== null);
    let points = row.points.concat(added);
    let rev = row.trail_rev;
    while (points.length > MAX_STORED_POINTS) {
      points = thin(points);
      rev += 1;
    }
    const count = row.point_count + fresh.length;
    await client.query(
      `update live_shares
       set points = $3::jsonb, point_count = $4, trail_rev = $5, status = $6, stats = $7::jsonb, updated_at = now()
       where token = $1 and user_id = $2`,
      [token, userId, JSON.stringify(points), count, rev, status, JSON.stringify(stats)],
    );
    await client.query("commit");
    return json({ count, expiresAt: row.expires_at.getTime() });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function extend(userId: string, token: string): Promise<Response> {
  const pool = getPool();
  const { rows } = await pool.query<Row>(
    "select * from live_shares where token = $1 and user_id = $2 and ended_at is null and expires_at > now()",
    [token, userId],
  );
  const row = rows[0];
  if (!row) return json({ message: "This live share has ended" }, 410);
  const created = row.created_at.getTime();
  const next = extendedExpiry(created, row.expires_at.getTime(), Date.now());
  await pool.query("update live_shares set expires_at = to_timestamp($3 / 1000.0) where token = $1 and user_id = $2", [
    token,
    userId,
    next,
  ]);
  return json({ expiresAt: next, atLimit: next >= created + MAX_LIFETIME_MS });
}

async function stop(userId: string, token: string): Promise<Response> {
  // Ending deletes the location data; the row only remains so viewers see "ended".
  await getPool().query(
    `update live_shares set ended_at = coalesce(ended_at, now()), points = '[]'::jsonb, stats = '{}'::jsonb
     where token = $1 and user_id = $2`,
    [token, userId],
  );
  return json({ ok: true });
}

export async function POST(request: Request): Promise<Response> {
  const foreign = rejectForeignOrigin(request);
  if (foreign) return foreign;
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return json({ message: "Please sign in to share live" }, 401);
    const userId = session.user.id;

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ message: "Too much data" }, 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ message: "Invalid JSON" }, 400);
    }
    if (!body || typeof body !== "object") return json({ message: "Invalid request" }, 400);
    if (body.action === "start") return await start(userId, body);

    const token = typeof body.token === "string" && TOKEN_RE.test(body.token) ? body.token : null;
    if (!token) return json({ message: "Invalid share" }, 400);
    if (body.action === "update") return await update(userId, token, body);
    if (body.action === "extend") return await extend(userId, token);
    if (body.action === "stop") return await stop(userId, token);
    return json({ message: "Unknown action" }, 400);
  } catch (error) {
    console.error("Live share error:", error);
    return json({ message: "Live sharing is not available right now." }, 503);
  }
}
