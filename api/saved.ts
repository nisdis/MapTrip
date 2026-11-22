import { getAuth } from "./_lib/auth.js";
import { getPool } from "./_lib/db.js";

// Sync for Favourites / Home / Work. The client sends all its records; the
// server keeps whichever copy of each was edited last, then returns them all.

const MAX_ENTRIES = 2000;
const MAX_BODY_BYTES = 2_000_000;
const KEY_RE = /^(fav:(node|way|relation)\/\d{1,15}|fav:pin\/-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?|home|work)$/;
const PLACE_ID_RE = /^((node|way|relation)\/\d{1,15}|pin\/-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?)$/;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Returns a clean record, or null if it isn't valid. Unknown fields are dropped. */
function clean(raw: unknown, now: number) {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const key = typeof e.key === "string" && KEY_RE.test(e.key) ? e.key : null;
  const kind = e.kind === "favourite" || e.kind === "home" || e.kind === "work" ? e.kind : null;
  if (!key || !kind) return null;
  if ((kind === "favourite") !== key.startsWith("fav:") || (kind !== "favourite" && key !== kind)) return null;

  const p = (e.place ?? {}) as Record<string, unknown>;
  const lat = num(p.lat);
  const lng = num(p.lng);
  const id = typeof p.id === "string" && PLACE_ID_RE.test(p.id) ? p.id : null;
  if (!id || lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (kind === "favourite" && key !== `fav:${id}`) return null;

  const updatedAt = num(e.updatedAt);
  const createdAt = num(e.createdAt);
  if (updatedAt == null || createdAt == null) return null;

  return {
    key,
    kind,
    list: kind === "favourite" ? "favourites" : null,
    place: {
      id,
      name: str(p.name, 300),
      category: str(p.category, 120),
      address: str(p.address, 400),
      lat,
      lng,
      countryCode: str(p.countryCode, 5),
    },
    note: str(e.note, 500),
    createdAt,
    // A device with a wrong clock can't make its edits "win" forever.
    updatedAt: Math.min(updatedAt, now + 5 * 60 * 1000),
    deleted: e.deleted === true,
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return json({ message: "Please sign in" }, 401);
    const userId = session.user.id;

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ message: "Too much data" }, 413);
    let body: { entries?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ message: "Invalid JSON" }, 400);
    }
    if (!Array.isArray(body.entries) || body.entries.length > MAX_ENTRIES) {
      return json({ message: "Invalid entries" }, 400);
    }

    const now = Date.now();
    const entries = body.entries.map((e) => clean(e, now)).filter((e): e is NonNullable<typeof e> => !!e);
    const pool = getPool();

    if (entries.length) {
      // Last edit wins: only overwrite a stored record with a newer one.
      await pool.query(
        `insert into saved_places (user_id, key, data, updated_at)
         select $1, e->>'key', e, (e->>'updatedAt')::bigint
         from jsonb_array_elements($2::jsonb) as e
         on conflict (user_id, key) do update
           set data = excluded.data, updated_at = excluded.updated_at
           where saved_places.updated_at < excluded.updated_at`,
        [userId, JSON.stringify(entries)],
      );
    }

    const { rows } = await pool.query("select data from saved_places where user_id = $1", [userId]);
    return json({ entries: rows.map((r) => r.data), rejected: body.entries.length - entries.length });
  } catch (error) {
    console.error("Saved sync error:", error);
    return json({ message: "Sync is not available right now." }, 503);
  }
}
