import { getAuth } from "./_lib/auth.js";
import { del } from "@vercel/blob";
import { getPool } from "./_lib/db.js";
import { rejectForeignOrigin } from "./_lib/origin.js";
import { refreshShareGeometry } from "./_lib/shareGeometry.js";
import { toStored } from "./_lib/storedTrip.js";
import { routeFromPlanned } from "./_lib/plannedRoute.js";
import { cleanTripName } from "./_lib/tripName.js";
import { gunzipSync } from "node:zlib";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4_000_000;
// The app sends trips gzipped (a long trip is several MB of JSON, more than a
// request may carry); this is the most it may unpack to.
const MAX_TRIP_BYTES = 60_000_000;

/** The request body as text, unpacking it if the app sent it gzipped. */
async function readBody(request: Request): Promise<string | null> {
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length > MAX_BODY_BYTES) return null;
  if (request.headers.get("content-type")?.startsWith("application/gzip")) {
    return gunzipSync(bytes, { maxOutputLength: MAX_TRIP_BYTES }).toString("utf8");
  }
  return bytes.toString("utf8");
}

async function requireUserId(request: Request): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

async function handle(request: Request): Promise<Response> {
  const foreign = rejectForeignOrigin(request);
  if (foreign) return foreign;
  try {
    const userId = await requireUserId(request);
    if (!userId) return json({ message: "Please sign in" }, 401);
    const pool = getPool();

    if (request.method === "GET") {
      // The Explored map: every square any of the account's trips passed through.
      if (new URL(request.url).searchParams.has("explored")) {
        const { rows } = await pool.query<{ cell: string }>(
          `select distinct jsonb_array_elements_text(cells) as cell from trips where user_id = $1 and cells is not null`,
          [userId],
        );
        return json({ cells: rows.map((r) => r.cell) });
      }
      // One trip, in full (opened on another device).
      const id = new URL(request.url).searchParams.get("id");
      if (id != null) {
        if (!UUID.test(id)) return json({ message: "Invalid trip id" }, 400);
        const { rows } = await pool.query("select data from trips where id = $1 and user_id = $2", [id, userId]);
        if (!rows[0]) return json({ message: "Not found" }, 404);
        return json({ trip: rows[0].data });
      }
      // All of them, without their tracks: enough to list them and draw their
      // shape (the full route, as encoded polylines; the owner may see it).
      const { rows } = await pool.query<{ data: Record<string, unknown>; polyline: string[] | null }>(
        `select data - 'track' as data, polyline from trips
         where user_id = $1 and data->>'kind' = 'recorded'
         order by created_at desc limit 2000`,
        [userId],
      );
      return json({ trips: rows.map((r) => ({ ...r.data, line: r.polyline ?? [] })) });
    }

    if (request.method === "POST") {
      let trip: { id?: unknown; createdAt?: unknown; kind?: unknown };
      try {
        const raw = await readBody(request);
        if (raw == null) return json({ message: "Trip too large" }, 413);
        trip = JSON.parse(raw);
      } catch (e) {
        if ((e as { code?: string })?.code === "ERR_BUFFER_TOO_LARGE") return json({ message: "Trip too large" }, 413);
        return json({ message: "Invalid trip data" }, 400);
      }
      if (!trip || typeof trip !== "object") return json({ message: "Invalid trip data" }, 400);
      if (typeof trip.id !== "string" || !UUID.test(trip.id))
        return json({ message: "Invalid trip id" }, 400);
      if (trip.kind !== "recorded" && trip.kind !== "planned")
        return json({ message: "Invalid trip kind" }, 400);
      const createdAt = Number(trip.createdAt);
      if (!Number.isFinite(createdAt)) return json({ message: "Invalid createdAt" }, 400);

      // Older app versions still save Directions routes as "planned trips":
      // they're routes, so they go to Saved instead (synced like Favourites).
      if (trip.kind === "planned") {
        const entry = routeFromPlanned(trip as Record<string, unknown>);
        if (!entry) return json({ message: "Invalid route" }, 400);
        await pool.query(
          `insert into saved_places (user_id, key, data, updated_at) values ($1, $2, $3::jsonb, $4)
           on conflict (user_id, key) do nothing`,
          [userId, entry.key, JSON.stringify(entry), entry.updatedAt],
        );
        return json({ syncedAt: Date.now() });
      }

      // Only keep photo/video references that point at this user's own files,
      // with their time and place on the route (checked, numbers only).
      const VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/webm"];
      const n = (v: unknown, min: number, max: number) =>
        typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : undefined;
      const photos = Array.isArray((trip as { photos?: unknown }).photos)
        ? ((trip as { photos: unknown[] }).photos.slice(0, 100) as Record<string, unknown>[])
            .filter(
              (p) =>
                typeof p?.id === "string" &&
                UUID.test(p.id) &&
                typeof p.cloudPath === "string" &&
                new RegExp(`^trips/${userId.replace(/[^a-zA-Z0-9_-]/g, "")}/${p.id}\\.(jpg|mp4|mov|webm)$`).test(p.cloudPath),
            )
            .map((p) => {
              const video = p.kind === "video" && typeof p.mime === "string" && VIDEO_MIMES.includes(p.mime);
              const lat = n(p.lat, -90, 90);
              const lng = n(p.lng, -180, 180);
              return {
                id: p.id as string,
                addedAt: Number(p.addedAt) || 0,
                cloudPath: p.cloudPath as string,
                kind: video ? ("video" as const) : ("photo" as const),
                ...(video ? { mime: p.mime as string, durationS: n(p.durationS, 0, 61) } : {}),
                takenAt: n(p.takenAt, 0, 1e14) ?? null,
                ...(lat != null && lng != null ? { lat, lng } : {}),
              };
            })
        : [];

      const syncedAt = Date.now();
      // The WHERE clause stops one user overwriting another user's trip id.
      // The track is stored as a table of points, with the route as polylines.
      const stored = toStored({ ...trip, photos, cloudSyncedAt: syncedAt });
      const result = await pool.query(
        `insert into trips (id, user_id, data, polyline, cells, created_at)
         values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, to_timestamp($6 / 1000.0))
         on conflict (id) do update set data = excluded.data, polyline = excluded.polyline, cells = excluded.cells
         where trips.user_id = excluded.user_id`,
        [
          trip.id,
          userId,
          JSON.stringify(stored.data),
          stored.polyline ? JSON.stringify(stored.polyline) : null,
          stored.cells ? JSON.stringify(stored.cells) : null,
          createdAt,
        ],
      );
      if (result.rowCount === 0) return json({ message: "Trip id already in use" }, 409);
      // A shared trip saved again (e.g. after adding photos): Explore's area follows.
      await refreshShareGeometry(pool, trip.id);
      return json({ syncedAt });
    }

    if (request.method === "PATCH") {
      // Rename: only the name changes (works for trips this device has only as a summary).
      const id = new URL(request.url).searchParams.get("id") ?? "";
      if (!UUID.test(id)) return json({ message: "Invalid trip id" }, 400);
      let body: { name?: unknown };
      try {
        body = await request.json();
      } catch {
        return json({ message: "Invalid request" }, 400);
      }
      const name = cleanTripName(body?.name);
      if (!name) return json({ message: "Give the trip a name" }, 400);
      const syncedAt = Date.now();
      const { rowCount } = await pool.query(
        `update trips set data = data || jsonb_build_object('name', $3::text, 'cloudSyncedAt', $4::bigint)
         where id = $1 and user_id = $2`,
        [id, userId, name, syncedAt],
      );
      if (!rowCount) return json({ message: "Not found" }, 404);
      return json({ name, syncedAt });
    }

    if (request.method === "DELETE") {
      const id = new URL(request.url).searchParams.get("id") ?? "";
      if (!UUID.test(id)) return json({ message: "Invalid trip id" }, 400);
      const { rows } = await pool.query(
        "delete from trips where id = $1 and user_id = $2 returning data",
        [id, userId],
      );
      // Remove the trip's photos from the object store too (no orphaned files).
      const paths: string[] = (rows[0]?.data?.photos ?? [])
        .map((p: { cloudPath?: string }) => p.cloudPath)
        .filter((p: unknown): p is string => typeof p === "string" && p.startsWith(`trips/${userId}/`));
      if (paths.length) await del(paths).catch((e) => console.error("Photo cleanup failed:", e));
      return json({ ok: true });
    }

    return json({ message: "Method not allowed" }, 405);
  } catch (error) {
    console.error("Trips API error:", error);
    return json({ message: "Cloud save is not available right now." }, 503);
  }
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
