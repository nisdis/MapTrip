import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { hasDb, resetDb, call, signUp } from "./helpers";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.BETTER_AUTH_URL ??= "http://localhost:5173";

const track = Array.from({ length: 30 }, (_, i) => ({ lat: 34.98 + i * 0.001, lng: 135.76, t: 1_800_000_000_000 + i * 10_000, speed: 8 }));
const recorded = (over: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  name: "Ride",
  kind: "recorded",
  createdAt: 1_800_000_000_000,
  track,
  distanceM: 3300,
  durationS: 300,
  photos: [],
  ...over,
});
const end = (name: string, lat: number) => ({ id: 7, name, displayName: `${name}, Kyoto`, location: [lat, 135.76], type: "x", importance: 1 });

describe.skipIf(!hasDb)("trips on every device, deleting, saved routes", async () => {
  const auth = await import("../../api/auth");
  const trips = await import("../../api/trips");
  const pub = await import("../../api/public");
  const saved = await import("../../api/saved");
  const { convertPlannedTrips } = await import("../../api/_lib/storedTrip");
  let ann = "";
  let bo = "";
  const save = (t: unknown, who: string) => call(trips.POST as never, "POST", "/api/trips", t, who);
  const list = async (who: string) => (await (await call(trips.GET as never, "GET", "/api/trips", undefined, who)).json()).trips;

  beforeAll(async () => {
    await resetDb();
    ann = await signUp(auth.POST as never, "ann@test.com");
    bo = await signUp(auth.POST as never, "bo@test.com");
  });

  it("lists the account's recorded trips without tracks, with their shape; one trip in full on request", async () => {
    const t = recorded({ name: "Morning" });
    expect((await save(t, ann)).status).toBe(200);
    const all = await list(ann);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: t.id, name: "Morning", distanceM: 3300 });
    expect(all[0].track).toBeUndefined();
    expect(all[0].line.length).toBeGreaterThan(0);
    expect(await list(bo)).toHaveLength(0);

    const one = await (await call(trips.GET as never, "GET", `/api/trips?id=${t.id}`, undefined, ann)).json();
    expect(one.trip.track.rows).toHaveLength(30);
    // Someone else's trip: as if it didn't exist.
    expect((await call(trips.GET as never, "GET", `/api/trips?id=${t.id}`, undefined, bo)).status).toBe(404);
  });

  it("deleting a shared trip removes it from its link and Explore too", async () => {
    const t = recorded({ name: "Shared then deleted" });
    await save(t, ann);
    await call(pub.POST, "POST", "/api/public", { action: "profile", displayName: "Ann" }, ann);
    await call(pub.POST, "POST", "/api/public", { action: "settings", trip: t.id, visibility: "public" }, ann);
    expect((await call(pub.GET, "GET", `/api/public?trip=${t.id}`)).status).toBe(200);
    expect((await call(trips.DELETE as never, "DELETE", `/api/trips?id=${t.id}`, undefined, ann)).status).toBe(200);
    expect((await call(pub.GET, "GET", `/api/public?trip=${t.id}`)).status).toBe(404);
    const ex = await (await call(pub.GET, "GET", "/api/public?explore=1&s=34.9&w=135.7&n=35.1&e=135.8")).json();
    expect(ex.trips.map((x: { id: string }) => x.id)).not.toContain(t.id);
  });

  it("a planned trip from an older app becomes a saved route, not a trip", async () => {
    const id = randomUUID();
    const planned = { id, name: "Station → Gion", kind: "planned", createdAt: 1_800_000_000_000, origin: end("Station", 34.98), destination: end("Gion", 35.0), distanceM: 0, durationS: 0 };
    expect((await save(planned, ann)).status).toBe(200);
    expect((await list(ann)).map((t: { id: string }) => t.id)).not.toContain(id);
    const s = await (await call(saved.POST, "POST", "/api/saved", { entries: [] }, ann)).json();
    expect(s.entries.find((e: { key: string }) => e.key === `route:${id}`)).toMatchObject({
      kind: "route",
      list: "routes",
      route: { name: "Station → Gion", mode: "car", from: { name: "Station", lat: 34.98 }, to: { name: "Gion", lat: 35 } },
    });
  });

  it("the migration moves planned trips already in the database", async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const { rows } = await pool.query(`select id from "user" where email = 'bo@test.com'`);
    const id = randomUUID();
    const data = { id, name: "Old plan", kind: "planned", createdAt: 1_800_000_000_000, origin: end("A", 34.9), destination: end("B", 34.95) };
    await pool.query("insert into trips (id, user_id, data) values ($1, $2, $3)", [id, rows[0].id, JSON.stringify(data)]);
    expect(await convertPlannedTrips(pool)).toBe(1);
    expect((await pool.query("select 1 from trips where id = $1", [id])).rowCount).toBe(0);
    expect((await pool.query("select data from saved_places where key = $1", [`route:${id}`])).rows[0].data.route.name).toBe("Old plan");
    expect(await convertPlannedTrips(pool)).toBe(0);
    await pool.end();
  });

  it("saved routes sync with their path; bad ones are refused", async () => {
    const place = (name: string, lat: number) => ({ id: `pin/${lat.toFixed(6)},135.760000`, name, category: null, address: null, lat, lng: 135.76, countryCode: null });
    const route = (over: Record<string, unknown> = {}) => ({
      key: `route:${randomUUID()}`,
      kind: "route",
      list: "routes",
      place: place("Gion", 35),
      route: { name: "Walk to Gion", from: place("Station", 34.98), to: place("Gion", 35), mode: "foot", path: "_mntEoexaY_sB_sB", distanceM: 3000, durationS: 2400, ...over },
      note: null,
      createdAt: 1,
      updatedAt: 1,
      deleted: false,
    });
    const good = route();
    const badMode = route({ mode: "plane" });
    const badPath = route({ path: "not a polyline!" });
    const res = await (await call(saved.POST, "POST", "/api/saved", { entries: [good, badMode, badPath] }, bo)).json();
    expect(res.rejected).toBe(1); // bad mode; a bad path is dropped, the route kept
    const keys = res.entries.map((e: { key: string }) => e.key);
    expect(keys).toContain(good.key);
    expect(res.entries.find((e: { key: string }) => e.key === good.key).route).toMatchObject({ mode: "foot", path: "_mntEoexaY_sB_sB" });
    expect(res.entries.find((e: { key: string }) => e.key === badPath.key).route.path).toBeNull();
    // Removing it on one device: a tombstone, synced like any deletion.
    const gone = await (await call(saved.POST, "POST", "/api/saved", { entries: [{ ...good, deleted: true, updatedAt: 2 }] }, bo)).json();
    expect(gone.entries.find((e: { key: string }) => e.key === good.key).deleted).toBe(true);
  });
});
