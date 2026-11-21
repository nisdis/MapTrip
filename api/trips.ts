import { getAuth } from "./_lib/auth.js";
import { getPool } from "./_lib/db.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4_000_000;

async function requireUserId(request: Request): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

async function handle(request: Request): Promise<Response> {
  try {
    const userId = await requireUserId(request);
    if (!userId) return json({ message: "Please sign in" }, 401);
    const pool = getPool();

    if (request.method === "GET") {
      const { rows } = await pool.query(
        "select data from trips where user_id = $1 order by created_at desc limit 200",
        [userId],
      );
      return json({ trips: rows.map((r) => r.data) });
    }

    if (request.method === "POST") {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return json({ message: "Trip too large" }, 413);
      let trip: { id?: unknown; createdAt?: unknown; kind?: unknown };
      try {
        trip = JSON.parse(raw);
      } catch {
        return json({ message: "Invalid JSON" }, 400);
      }
      if (typeof trip.id !== "string" || !UUID.test(trip.id))
        return json({ message: "Invalid trip id" }, 400);
      if (trip.kind !== "recorded" && trip.kind !== "planned")
        return json({ message: "Invalid trip kind" }, 400);
      const createdAt = Number(trip.createdAt);
      if (!Number.isFinite(createdAt)) return json({ message: "Invalid createdAt" }, 400);

      const syncedAt = Date.now();
      // The WHERE clause stops one user overwriting another user's trip id.
      const result = await pool.query(
        `insert into trips (id, user_id, data, created_at)
         values ($1, $2, $3::jsonb, to_timestamp($4 / 1000.0))
         on conflict (id) do update set data = excluded.data
         where trips.user_id = excluded.user_id`,
        [trip.id, userId, JSON.stringify({ ...trip, cloudSyncedAt: syncedAt }), createdAt],
      );
      if (result.rowCount === 0) return json({ message: "Trip id already in use" }, 409);
      return json({ syncedAt });
    }

    if (request.method === "DELETE") {
      const id = new URL(request.url).searchParams.get("id") ?? "";
      if (!UUID.test(id)) return json({ message: "Invalid trip id" }, 400);
      await pool.query("delete from trips where id = $1 and user_id = $2", [id, userId]);
      return json({ ok: true });
    }

    return json({ message: "Method not allowed" }, 405);
  } catch (error) {
    console.error("Trips API error:", error);
    return json({ message: "Cloud save is not available right now." }, 503);
  }
}

export { handle as GET, handle as POST, handle as DELETE };
