import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { hasDb, resetDb, call, signUp } from "./helpers";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.BETTER_AUTH_URL ??= "http://localhost:5173";

const track = Array.from({ length: 31 }, (_, i) => ({ lat: 34.985 + i * 0.001, lng: 135.758, t: 1_800_000_000_000 + i * 10_000, speed: 8 }));
const trip = () => ({ id: randomUUID(), name: "Ride", kind: "recorded", createdAt: 1_800_000_000_000, track, distanceM: 3300, durationS: 300, photos: [] });

describe.skipIf(!hasDb)("deleting an account", async () => {
  const auth = await import("../../api/auth");
  const account = await import("../../api/account");
  const trips = await import("../../api/trips");
  const pub = await import("../../api/public");
  const live = await import("../../api/live");
  const saved = await import("../../api/saved");
  let alice = "";
  let bob = "";
  const del = (body: unknown, cookie?: string) => call(account.POST, "POST", "/api/account", body, cookie);
  const count = async (sql: string, args: unknown[]) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const { rows } = await pool.query(sql, args);
    await pool.end();
    return Number(rows[0].n);
  };

  beforeAll(async () => {
    await resetDb();
    alice = await signUp(auth.POST as (r: Request) => Promise<Response>, "alice@test.com");
    bob = await signUp(auth.POST as (r: Request) => Promise<Response>, "bob@test.com");
  });

  it("needs a session, the right password, and this site", async () => {
    expect((await del({ action: "delete", password: "password123" })).status).toBe(401);
    expect((await del({ action: "delete" }, alice)).status).toBe(400); // even with a fresh session
    expect((await del({ action: "delete", password: "wrong-password" }, alice)).status).toBe(403);
    const foreign = await account.POST(
      new Request("http://localhost:5173/api/account", {
        method: "POST",
        headers: { Origin: "https://evil.example", Cookie: alice, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", password: "password123" }),
      }),
    );
    expect(foreign.status).toBe(403);
  });

  it("removes the account and everything in it, and nobody else's", async () => {
    // Alice: a public trip with a public name, a live share, a saved place, a report on Bob's trip.
    const mine = trip();
    await call(trips.POST as never, "POST", "/api/trips", mine, alice);
    await call(pub.POST, "POST", "/api/public", { action: "profile", displayName: "Alice R" }, alice);
    await call(pub.POST, "POST", "/api/public", { action: "settings", trip: mine.id, visibility: "public" }, alice);
    await call(live.POST, "POST", "/api/live", { action: "start", duration: "1h", tripStartedAt: Date.now() }, alice);
    await call(saved.POST, "POST", "/api/saved", {
      entries: [{ key: "home", kind: "home", place: { id: "pin/34.98,135.75", lat: 34.98, lng: 135.75 }, createdAt: 1, updatedAt: 1 }],
    }, alice);
    const bobs = trip();
    await call(trips.POST as never, "POST", "/api/trips", bobs, bob);
    await call(pub.POST, "POST", "/api/public", { action: "profile", displayName: "Bob" }, bob);
    await call(pub.POST, "POST", "/api/public", { action: "settings", trip: bobs.id, visibility: "public" }, bob);
    await call(pub.POST, "POST", "/api/public", { action: "report", trip: bobs.id, reason: "spam" }, alice);

    const res = await del({ action: "delete", password: "password123" }, alice);
    expect(res.status).toBe(200);

    const uid = "(select id from \"user\" where email = 'alice@test.com')";
    expect(await count(`select count(*) n from "user" where email = $1`, ["alice@test.com"])).toBe(0);
    for (const table of ["trips", "saved_places", "live_shares", "profiles", "trip_reports"]) {
      const col = table === "trip_reports" ? "reporter_id" : "user_id";
      expect(await count(`select count(*) n from ${table} where ${col} in ${uid}`, [])).toBe(0);
    }
    expect(await count("select count(*) n from trips where id = $1", [mine.id])).toBe(0);
    expect(await count("select count(*) n from session s left join \"user\" u on u.id = s.\"userId\" where u.id is null", [])).toBe(0);
    // The old session no longer works; the public trip is gone.
    expect((await call(trips.GET as never, "GET", "/api/trips", undefined, alice)).status).toBe(401);
    expect((await call(pub.GET, "GET", `/api/public?trip=${mine.id}`)).status).toBe(404);
    // Bob is untouched.
    expect(await count("select count(*) n from trips where id = $1", [bobs.id])).toBe(1);
    expect((await call(pub.GET, "GET", `/api/public?trip=${bobs.id}`)).status).toBe(200);
  });
});
