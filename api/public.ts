import { getAuth } from "./_lib/auth.js";
import { getPool } from "./_lib/db.js";
import { EVENTS, recordEvent, usageStats } from "./_lib/usage.js";
import { rejectForeignOrigin } from "./_lib/origin.js";
import { refreshShareGeometry } from "./_lib/shareGeometry.js";
import { haversineM } from "./_lib/live.js";
import {
  HIDE_AFTER_REPORTS,
  REPORT_REASONS,
  VISIBILITIES,
  cleanDisplayName,
  cleanSettings,
  isAdmin,
  pointsOf,
  simplify,
  statsOf,
  trimEnds,
  viewerKey,
  type ShareSettings,
  type Visibility,
} from "./_lib/publicTrip.js";

// Shared trips.
//   GET  ?trip=<id>                 public view of an unlisted/public trip (no sign-in)
//   GET  ?explore=1&s=&w=&n=&e=     public trips in a map area, most viewed (recently) first
//   GET  ?me=1                      my public name, and whether I'm an admin
//   GET  ?settings=<id>             my sharing settings for one of my trips
//   GET  ?reports=1                 reported trips (admins)
//   POST {action: view|settings|profile|report|moderate, ...}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_POINTS = 2000;
const EXPLORE_POINTS = 150;
const EXPLORE_LIMIT = 30;

const json = (body: unknown, status = 200, cache = "no-store") =>
  Response.json(body, { status, headers: { "Cache-Control": cache } });

interface TripRow {
  id: string;
  user_id: string;
  data: Record<string, unknown>;
  visibility: Visibility;
  share: Partial<ShareSettings>;
  views: number;
  hidden_at: Date | null;
  display_name: string | null;
}

async function session(request: Request) {
  return getAuth().api.getSession({ headers: request.headers });
}

function photoIdsOf(data: Record<string, unknown>): string[] {
  const photos = Array.isArray(data.photos) ? data.photos : [];
  return photos
    .filter((p): p is { id: string; cloudPath: string } => !!p && typeof p.id === "string" && typeof p.cloudPath === "string")
    .map((p) => p.id);
}

/** Score for Explore: unique views, worth less as the trip gets older. */
const SCORE_SQL = `views / power(greatest(extract(epoch from now() - coalesce(published_at, now())) / 86400, 0) + 2, 1.5)`;

// ---------------------------------------------------------------- reading

async function publicTrip(id: string): Promise<Response> {
  const { rows } = await getPool().query<TripRow>(
    `select t.id, t.user_id, t.data, t.visibility, t.share, t.views, t.hidden_at, p.display_name
     from trips t left join profiles p on p.user_id = t.user_id
     where t.id = $1 and t.visibility in ('unlisted', 'public')`,
    [id],
  );
  const row = rows[0];
  if (!row) return json({ message: "This trip isn't shared" }, 404, "public, max-age=30, s-maxage=60");
  const hideM = row.share?.hideM ?? 500;
  const all = pointsOf(row.data);
  const visible = simplify(trimEnds(all, hideM), MAX_POINTS);
  const allowed = photoIdsOf(row.data);
  return json(
    {
      id: row.id,
      title: typeof row.data.name === "string" ? row.data.name.slice(0, 120) : "Trip",
      author: row.display_name,
      authorId: row.display_name ? row.user_id : null,
      visibility: row.visibility,
      imported: row.data.imported === true,
      hideM,
      stats: statsOf(row.data, all),
      points: visible.map((p) => [p.lat, p.lng, p.t, p.speed, p.gap ? 1 : 0]),
      photos: (row.share?.photos ?? []).filter((p) => allowed.includes(p)),
      views: row.views,
    },
    200,
    "public, max-age=30, s-maxage=60",
  );
}

async function explore(url: URL): Promise<Response> {
  const [s, w, n, e] = ["s", "w", "n", "e"].map((k) => Number(url.searchParams.get(k)));
  if (![s, w, n, e].every(Number.isFinite) || s > n || Math.abs(s) > 90 || Math.abs(n) > 90) {
    return json({ message: "Invalid area" }, 400);
  }
  const { rows } = await getPool().query<TripRow>(
    `select t.id, t.user_id, t.data, t.visibility, t.share, t.views, t.hidden_at, p.display_name
     from trips t left join profiles p on p.user_id = t.user_id
     where t.visibility = 'public' and t.hidden_at is null and t.min_lat is not null
       and t.max_lat >= $1 and t.min_lat <= $3 and t.max_lng >= $2 and t.min_lng <= $4
     order by ${SCORE_SQL} desc, t.published_at desc
     limit ${EXPLORE_LIMIT}`,
    [s, w, n, e],
  );
  // Nothing in view: the nearest public trips instead, so Explore never looks empty.
  let nearest: { id: string; title: string; author: string | null; distanceKm: number; center: [number, number]; bbox: [number, number, number, number] }[] = [];
  if (!rows.length) {
    const lat = (s + n) / 2;
    const lng = (w + e) / 2;
    const near = await getPool().query<{ id: string; name: string | null; display_name: string | null; clat: number; clng: number; min_lat: number; max_lat: number; min_lng: number; max_lng: number }>(
      `select t.id, t.data->>'name' as name, p.display_name,
              (t.min_lat + t.max_lat) / 2 as clat, (t.min_lng + t.max_lng) / 2 as clng,
              t.min_lat, t.max_lat, t.min_lng, t.max_lng
       from trips t left join profiles p on p.user_id = t.user_id
       where t.visibility = 'public' and t.hidden_at is null and t.min_lat is not null
       order by power((t.min_lat + t.max_lat) / 2 - $1, 2)
              + power(((t.min_lng + t.max_lng) / 2 - $2) * cos(radians($1)), 2)
       limit 5`,
      [lat, lng],
    );
    nearest = near.rows.map((r) => ({
      id: r.id,
      title: (r.name ?? "Trip").slice(0, 120),
      author: r.display_name,
      distanceKm: Math.round(haversineM([lat, lng], [r.clat, r.clng]) / 1000),
      center: [r.clat, r.clng],
      bbox: [r.min_lat, r.min_lng, r.max_lat, r.max_lng],
    }));
  }
  return json(
    {
      nearest,
      trips: rows.map((r) => {
        const all = pointsOf(r.data);
        const line = simplify(trimEnds(all, r.share?.hideM ?? 500), EXPLORE_POINTS);
        return {
          id: r.id,
          title: typeof r.data.name === "string" ? r.data.name.slice(0, 120) : "Trip",
          author: r.display_name,
          authorId: r.display_name ? r.user_id : null,
          stats: statsOf(r.data, all),
          views: r.views,
          imported: r.data.imported === true,
          line: line.map((p) => [p.lat, p.lng, p.gap ? 1 : 0]),
        };
      }),
    },
    200,
    "public, max-age=30, s-maxage=60",
  );
}

async function me(request: Request): Promise<Response> {
  const s = await session(request);
  if (!s) return json({ message: "Please sign in" }, 401);
  const { rows } = await getPool().query("select display_name from profiles where user_id = $1", [s.user.id]);
  return json({ displayName: rows[0]?.display_name ?? null, isAdmin: isAdmin(s.user.email) });
}

async function mySettings(request: Request, id: string): Promise<Response> {
  const s = await session(request);
  if (!s) return json({ message: "Please sign in" }, 401);
  const { rows } = await getPool().query<{ visibility: Visibility; share: Partial<ShareSettings>; hidden_at: Date | null; views: number }>(
    "select visibility, share, hidden_at, views from trips where id = $1 and user_id = $2",
    [id, s.user.id],
  );
  if (!rows[0]) return json({ message: "Save this trip to the cloud first" }, 404);
  return json({
    visibility: rows[0].visibility,
    hideM: rows[0].share?.hideM ?? 500,
    photos: rows[0].share?.photos ?? [],
    hiddenFromExplore: !!rows[0].hidden_at && rows[0].visibility === "public",
    views: rows[0].views,
  });
}

async function reports(request: Request): Promise<Response> {
  const s = await session(request);
  if (!s || !isAdmin(s.user.email)) return json({ message: "Not found" }, 404);
  const { rows } = await getPool().query(
    `select t.id, t.data->>'name' as title, t.visibility, t.hidden_at, p.display_name,
            count(r.*)::int as count,
            array_agg(r.reason order by r.created_at) as reasons,
            array_agg(coalesce(r.details, '') order by r.created_at) as details,
            max(r.created_at) as last_at
     from trip_reports r join trips t on t.id = r.trip_id left join profiles p on p.user_id = t.user_id
     where r.resolved_at is null
     group by t.id, p.display_name
     order by max(r.created_at) desc`,
  );
  return json({ reports: rows });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  try {
    const trip = url.searchParams.get("trip");
    if (trip != null) return UUID.test(trip) ? await publicTrip(trip) : json({ message: "Not found" }, 404);
    if (url.searchParams.has("explore")) return await explore(url);
    if (url.searchParams.has("me")) return await me(request);
    const settings = url.searchParams.get("settings");
    if (settings != null) return UUID.test(settings) ? await mySettings(request, settings) : json({ message: "Not found" }, 404);
    if (url.searchParams.has("reports")) return await reports(request);
    if (url.searchParams.has("stats")) {
      const s = await session(request);
      if (!s || !isAdmin(s.user.email)) return json({ message: "Not found" }, 404);
      return json(await usageStats(getPool()));
    }
    return json({ message: "Not found" }, 404);
  } catch (error) {
    console.error("Public trips error:", error);
    return json({ message: "Shared trips are not available right now." }, 503);
  }
}

// ---------------------------------------------------------------- writing

/** A unique view (per person per day). The owner looking at their own trip doesn't count. */
async function view(request: Request, id: string): Promise<Response> {
  const pool = getPool();
  const { rows } = await pool.query<{ user_id: string }>(
    "select user_id from trips where id = $1 and visibility in ('unlisted', 'public')",
    [id],
  );
  if (!rows[0]) return json({ ok: false }, 404);
  if (request.headers.get("cookie")) {
    const s = await session(request);
    if (s?.user.id === rows[0].user_id) return json({ ok: true, counted: false });
  }
  const ip = (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "").split(",")[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  const key = viewerKey(ip, request.headers.get("user-agent") ?? "", day);
  const inserted = await pool.query(
    "insert into trip_views (trip_id, viewer, day) values ($1, $2, $3) on conflict do nothing",
    [id, key, day],
  );
  if (inserted.rowCount) await pool.query("update trips set views = views + 1 where id = $1", [id]);
  // Keep only the last two days of view keys.
  if (Math.random() < 0.05) await pool.query("delete from trip_views where day < current_date - 1");
  return json({ ok: true, counted: !!inserted.rowCount });
}

async function settings(userId: string, body: Record<string, unknown>): Promise<Response> {
  const id = typeof body.trip === "string" && UUID.test(body.trip) ? body.trip : null;
  if (!id) return json({ message: "Invalid trip" }, 400);
  const visibility = VISIBILITIES.includes(body.visibility as Visibility) ? (body.visibility as Visibility) : null;
  if (!visibility) return json({ message: "Invalid visibility" }, 400);

  const pool = getPool();
  const { rows } = await pool.query<{ data: Record<string, unknown>; visibility: Visibility }>(
    "select data, visibility from trips where id = $1 and user_id = $2",
    [id, userId],
  );
  const trip = rows[0];
  if (!trip) return json({ message: "Save this trip to the cloud first" }, 404);
  if (visibility !== "private") {
    if (trip.data.kind !== "recorded") return json({ message: "Only recorded trips can be shared" }, 400);
    const named = await pool.query("select 1 from profiles where user_id = $1", [userId]);
    if (!named.rowCount) return json({ message: "Choose a public name first", needsName: true }, 409);
  }
  const share = cleanSettings(body, photoIdsOf(trip.data));
  await pool.query(
    `update trips set visibility = $3, share = $4::jsonb,
       published_at = case when $3 = 'private' then null else coalesce(published_at, now()) end
     where id = $1 and user_id = $2`,
    [id, userId, visibility, JSON.stringify(share)],
  );
  const visiblePoints = await refreshShareGeometry(pool, id);
  return json({ visibility, ...share, visiblePoints });
}

async function profile(userId: string, body: Record<string, unknown>): Promise<Response> {
  const name = cleanDisplayName(body.displayName);
  if (!name) return json({ message: "Use 2–40 characters, without links or email addresses" }, 400);
  await getPool().query(
    `insert into profiles (user_id, display_name) values ($1, $2)
     on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now()`,
    [userId, name],
  );
  return json({ displayName: name });
}

async function report(userId: string, body: Record<string, unknown>): Promise<Response> {
  const id = typeof body.trip === "string" && UUID.test(body.trip) ? body.trip : null;
  const reason = REPORT_REASONS.includes(body.reason as (typeof REPORT_REASONS)[number]) ? (body.reason as string) : null;
  if (!id || !reason) return json({ message: "Choose a reason" }, 400);
  const details = typeof body.details === "string" ? body.details.slice(0, 500) : null;
  const pool = getPool();
  const { rows } = await pool.query<{ user_id: string }>(
    "select user_id from trips where id = $1 and visibility in ('unlisted', 'public')",
    [id],
  );
  if (!rows[0]) return json({ message: "Not found" }, 404);
  if (rows[0].user_id === userId) return json({ message: "That's your own trip" }, 400);
  // One report per person per trip (a second one updates the first).
  await pool.query(
    `insert into trip_reports (trip_id, reporter_id, reason, details) values ($1, $2, $3, $4)
     on conflict (trip_id, reporter_id) do update set reason = excluded.reason, details = excluded.details,
       created_at = now(), resolved_at = null`,
    [id, userId, reason, details],
  );
  // Enough different people: out of Explore until an admin has looked.
  await pool.query(
    `update trips set hidden_at = now()
     where id = $1 and hidden_at is null
       and (select count(*) from trip_reports where trip_id = $1 and resolved_at is null) >= $2`,
    [id, HIDE_AFTER_REPORTS],
  );
  return json({ ok: true });
}

async function moderate(email: string, body: Record<string, unknown>): Promise<Response> {
  if (!isAdmin(email)) return json({ message: "Not found" }, 404);
  const id = typeof body.trip === "string" && UUID.test(body.trip) ? body.trip : null;
  if (!id || (body.decision !== "restore" && body.decision !== "remove")) return json({ message: "Invalid request" }, 400);
  const pool = getPool();
  if (body.decision === "restore") {
    await pool.query("update trips set hidden_at = null where id = $1", [id]);
  } else {
    // Taken down: back to private. The owner can see it, nobody else can.
    await pool.query("update trips set visibility = 'private', hidden_at = now(), published_at = null where id = $1", [id]);
  }
  await pool.query("update trip_reports set resolved_at = now() where trip_id = $1 and resolved_at is null", [id]);
  return json({ ok: true });
}

export async function POST(request: Request): Promise<Response> {
  const foreign = rejectForeignOrigin(request);
  if (foreign) return foreign;
  try {
    const raw = await request.text();
    if (raw.length > 20_000) return json({ message: "Too much data" }, 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ message: "Invalid JSON" }, 400);
    }
    if (!body || typeof body !== "object") return json({ message: "Invalid request" }, 400);
    // Anonymous usage counts: the account if signed in, else this device's random id.
    if (body.action === "event") {
      const name = EVENTS.find((e) => e === body.name);
      const device = typeof body.device === "string" && /^[0-9a-f-]{36}$/i.test(body.device) ? body.device : null;
      if (!name || !device) return json({ ok: false }, 400);
      const s = request.headers.get("cookie") ? await session(request) : null;
      await recordEvent(getPool(), name, s ? `u:${s.user.id}` : `d:${device}`);
      return json({ ok: true });
    }
    if (body.action === "view") {
      return typeof body.trip === "string" && UUID.test(body.trip) ? await view(request, body.trip) : json({ ok: false }, 400);
    }
    const s = await session(request);
    if (!s) return json({ message: "Please sign in" }, 401);
    if (body.action === "settings") return await settings(s.user.id, body);
    if (body.action === "profile") return await profile(s.user.id, body);
    if (body.action === "report") return await report(s.user.id, body);
    if (body.action === "moderate") return await moderate(s.user.email, body);
    return json({ message: "Unknown action" }, 400);
  } catch (error) {
    console.error("Public trips error:", error);
    return json({ message: "Shared trips are not available right now." }, 503);
  }
}
