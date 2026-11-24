import { beforeAll, describe, expect, it } from "vitest";
import { hasDb, resetDb, call, signUp } from "./helpers";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.BETTER_AUTH_URL ??= "http://localhost:5173";

describe.skipIf(!hasDb)("auth and trips API", async () => {
  const auth = await import("../../api/auth");
  const trips = await import("../../api/trips");
  const authHandler = auth.POST as (r: Request) => Promise<Response>;
  let alice = "";
  let bob = "";
  const tripId = "0b6f2e0e-7c1d-4a55-9b1a-5d7e3c1f2a10";
  const trip = { id: tripId, name: "T", kind: "recorded", createdAt: 1700000000000, distanceM: 10, durationS: 5 };

  beforeAll(async () => {
    await resetDb();
    alice = await signUp(authHandler, "alice@test.com");
    bob = await signUp(authHandler, "bob@test.com");
  });

  it("handles two-level auth paths like /api/auth/sign-up/email (the production routing bug)", () => {
    expect(alice).toContain("better-auth.session_token");
  });

  it("Better Auth rejects cookie-carrying account changes from foreign origins", async () => {
    const res = await authHandler(
      new Request("http://localhost:5173/api/auth/update-user", {
        method: "POST",
        headers: { Origin: "https://evil.example", "Content-Type": "application/json", Cookie: alice },
        body: JSON.stringify({ name: "hacked" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("our trips endpoint rejects foreign origins even with a valid session", async () => {
    const res = await trips.POST(
      new Request("http://localhost:5173/api/trips", {
        method: "POST",
        headers: { Origin: "https://evil.example", "Content-Type": "application/json", Cookie: alice },
        body: JSON.stringify(trip),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("needs a session to save trips", async () => {
    expect((await call(trips.POST, "POST", "/api/trips", trip)).status).toBe(401);
  });

  it("saves, lists and isolates trips per user", async () => {
    expect((await call(trips.POST, "POST", "/api/trips", trip, alice)).status).toBe(200);
    const mine = await (await call(trips.GET, "GET", "/api/trips", undefined, alice)).json();
    expect(mine.trips).toHaveLength(1);
    const theirs = await (await call(trips.GET, "GET", "/api/trips", undefined, bob)).json();
    expect(theirs.trips).toHaveLength(0);
    // Bob can't overwrite Alice's trip id
    expect((await call(trips.POST, "POST", "/api/trips", trip, bob)).status).toBe(409);
  });

  it("validates trip input", async () => {
    expect((await call(trips.POST, "POST", "/api/trips", { ...trip, id: "x" }, alice)).status).toBe(400);
    expect((await call(trips.POST, "POST", "/api/trips", { ...trip, kind: "hacked" }, alice)).status).toBe(400);
  });
});

describe.skipIf(!hasDb)("trip track storage", async () => {
  const auth = await import("../../api/auth");
  const trips = await import("../../api/trips");
  const { convertStoredTracks } = await import("../../api/_lib/storedTrip");
  const { decodePolyline, TRACK_FIELDS } = await import("../../api/_lib/trackFormat");
  const { gzipSync } = await import("node:zlib");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let carol = "";
  const id = "6a0f2e0e-7c1d-4a55-9b1a-5d7e3c1f2a11";
  const track = Array.from({ length: 50 }, (_, i) => ({
    lat: 12.9 + i * 0.001, lng: 77.6, t: 1700000000000 + i * 1000, speed: 10, ...(i % 2 ? { alt: 900 } : {}),
  }));
  const trip = { id, name: "Long", kind: "recorded", createdAt: 1700000000000, distanceM: 5000, durationS: 50, track };

  beforeAll(async () => {
    await resetDb();
    carol = await signUp(auth.POST as (r: Request) => Promise<Response>, "carol@test.com");
  });

  const row = async () =>
    (await pool.query("select data, polyline from trips where id = $1", [id])).rows[0];

  it("stores the track as a table with a fixed column list, plus the route as a polyline", async () => {
    expect((await call(trips.POST, "POST", "/api/trips", trip, carol)).status).toBe(200);
    const { data, polyline } = await row();
    expect(data.track.fields).toEqual([...TRACK_FIELDS]);
    expect(data.track.rows).toHaveLength(50);
    expect(data.track.rows[0]).toEqual([1700000000000, 12.9, 77.6, null, 10, null, null, null, null, null, null, 0]);
    expect(data.track.rows[1][3]).toBe(900);
    expect(polyline).toHaveLength(1);
    expect(decodePolyline(polyline[0])).toEqual([[12.9, 77.6], [12.949, 77.6]]);
  });

  it("accepts a gzipped body", async () => {
    const res = await trips.POST(
      new Request("http://localhost:5173/api/trips", {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/gzip", Cookie: carol },
        body: gzipSync(JSON.stringify({ ...trip, name: "Zipped" })),
      }),
    );
    expect(res.status).toBe(200);
    expect((await row()).data.name).toBe("Zipped");
  });

  it("rejects a body that isn't valid gzip", async () => {
    const res = await trips.POST(
      new Request("http://localhost:5173/api/trips", {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/gzip", Cookie: carol },
        body: "not gzip",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("converts trips saved in the old format", async () => {
    await pool.query("update trips set data = jsonb_set(data, '{track}', $2::jsonb), polyline = null where id = $1", [
      id,
      JSON.stringify(track),
    ]);
    expect(await convertStoredTracks(pool)).toBe(1);
    const { data, polyline } = await row();
    expect(data.track.fields).toEqual([...TRACK_FIELDS]);
    expect(data.track.rows).toHaveLength(50);
    expect(polyline).toHaveLength(1);
    // Nothing left to do the second time.
    expect(await convertStoredTracks(pool)).toBe(0);
    await pool.end();
  });
});
