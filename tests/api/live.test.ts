import { beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { hasDb, resetDb, call, signUp } from "./helpers";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.BETTER_AUTH_URL ??= "http://localhost:5173";

// A trail heading north from (12.97, 77.60): one point every ~111 m.
const now = Date.now();
const pt = (i: number, gap = 0) => [12.97 + i * 0.001, 77.6, now - 60_000 + i * 1000, 10, gap];
const trail = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => pt(i + offset));
const stats = { distanceM: 1234, estimatedM: 0, maxSpeedMs: 20, speedMs: 12, altitudeM: 905.4, activeSeconds: 600 };

describe.skipIf(!hasDb)("live share API", async () => {
  const auth = await import("../../api/auth");
  const live = await import("../../api/live");
  let alice = "";
  let bob = "";
  const post = (body: unknown, cookie?: string) => call(live.POST, "POST", "/api/live", body, cookie);
  const view = (token: string, q = "") => call(live.GET, "GET", `/api/live?token=${token}${q}`);
  const startShare = async (cookie: string, duration = "1h") => {
    const res = await post({ action: "start", duration, tripStartedAt: now - 60_000 }, cookie);
    expect(res.status).toBe(200);
    return (await res.json()) as { token: string; expiresAt: number };
  };

  beforeAll(async () => {
    await resetDb();
    alice = await signUp(auth.POST as (r: Request) => Promise<Response>, "alice@test.com");
    bob = await signUp(auth.POST as (r: Request) => Promise<Response>, "bob@test.com");
  });

  it("needs a session to start or update", async () => {
    expect((await post({ action: "start", duration: "1h", tripStartedAt: now })).status).toBe(401);
  });

  it("rejects requests from other sites", async () => {
    const res = await live.POST(
      new Request("http://localhost:5173/api/live", {
        method: "POST",
        headers: { Origin: "https://evil.example", Cookie: alice, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", duration: "1h", tripStartedAt: now }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("only offers 1 h, 8 h or until the trip ends (24 h at most)", async () => {
    expect((await post({ action: "start", duration: "72h", tripStartedAt: now }, alice)).status).toBe(400);
    const { expiresAt } = await startShare(alice, "trip");
    expect(expiresAt - Date.now()).toBeGreaterThan(23.9 * 3600_000);
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(24 * 3600_000 + 5000);
  });

  it("shows viewers the trail and stats, but never the first 300 m", async () => {
    const { token } = await startShare(alice);
    const res = await post({ action: "update", token, from: 0, points: trail(10), status: "recording", stats }, alice);
    expect(await res.json()).toMatchObject({ count: 10 });

    const body = await (await view(token)).json();
    expect(body).toMatchObject({ state: "live", status: "recording", nearStart: false, total: 7 });
    // Points 0–2 are within 300 m of the start (0, 111, 222 m); 3 (333 m) is the first shown.
    expect(body.points[0][0]).toBeCloseTo(12.973, 6);
    expect(body.current).toMatchObject({ lat: 12.979, lng: 77.6 });
    expect(body.stats).toMatchObject({ distanceM: 1234, maxSpeedMs: 20, altitudeM: 905 });
  });

  it("hides where they are while near the start", async () => {
    const { token } = await startShare(alice);
    await post({ action: "update", token, from: 0, points: trail(2), status: "recording", stats }, alice);
    const body = await (await view(token)).json();
    expect(body).toMatchObject({ state: "live", nearStart: true, current: null, total: 0, points: [] });
  });

  it("never adds a point twice when an upload is retried", async () => {
    const { token } = await startShare(alice);
    await post({ action: "update", token, from: 0, points: trail(6), stats }, alice);
    // The answer to that was lost; the client resends from 0 with more points.
    const res = await post({ action: "update", token, from: 0, points: trail(8), stats }, alice);
    expect(await res.json()).toMatchObject({ count: 8 });
    // A gap in what was sent is refused, with what the server has.
    const gap = await post({ action: "update", token, from: 20, points: trail(2, 20), stats }, alice);
    expect(gap.status).toBe(409);
    expect(await gap.json()).toMatchObject({ count: 8 });
    expect((await (await view(token)).json()).total).toBe(5);
  });

  it("lets viewers fetch only what's new", async () => {
    const { token } = await startShare(alice);
    await post({ action: "update", token, from: 0, points: trail(8), stats }, alice);
    const first = await (await view(token)).json();
    await post({ action: "update", token, from: 8, points: trail(2, 8), stats }, alice);
    const next = await (await view(token, `&since=${first.total}&rev=${first.rev}`)).json();
    expect(next).toMatchObject({ from: first.total, total: first.total + 2 });
    expect(next.points).toHaveLength(2);
    // An out-of-date copy gets the whole trail again.
    const stale = await (await view(token, `&since=${first.total}&rev=99`)).json();
    expect(stale.from).toBe(0);
  });

  it("drops bad points and clamps silly stats", async () => {
    const { token } = await startShare(alice);
    const bad = [[999, 77.6, now, 10, 0], [12.99, 77.6, now + 86400_000, 10, 0], "x", pt(5)];
    await post(
      { action: "update", token, from: 0, points: [pt(0), ...bad], stats: { maxSpeedMs: 9999, distanceM: -5 } },
      alice,
    );
    const body = await (await view(token)).json();
    expect(body.total).toBe(1);
    expect(body.stats).toMatchObject({ maxSpeedMs: 150, distanceM: 0 });
  });

  it("only the owner can update, extend or stop a share", async () => {
    const { token } = await startShare(alice);
    expect((await post({ action: "update", token, from: 0, points: trail(5), stats }, bob)).status).toBe(410);
    expect((await post({ action: "extend", token }, bob)).status).toBe(410);
    await post({ action: "stop", token }, bob);
    expect((await (await view(token)).json()).state).toBe("live");
  });

  it("+1 h extends, but never past 24 h", async () => {
    const { token, expiresAt } = await startShare(alice, "8h");
    const res = await (await post({ action: "extend", token }, alice)).json();
    expect(res.expiresAt - expiresAt).toBeGreaterThan(3599_000);
    for (let i = 0; i < 20; i++) await post({ action: "extend", token }, alice);
    const last = await (await post({ action: "extend", token }, alice)).json();
    expect(last.atLimit).toBe(true);
    expect(last.expiresAt - Date.now()).toBeLessThanOrEqual(24 * 3600_000 + 5000);
  });

  it("stopping ends the link and deletes the location data", async () => {
    const { token } = await startShare(alice);
    await post({ action: "update", token, from: 0, points: trail(10), stats }, alice);
    expect((await post({ action: "stop", token }, alice)).status).toBe(200);
    const res = await view(token);
    expect(await res.json()).toEqual({ state: "ended" });
    expect((await post({ action: "update", token, from: 10, points: [], stats }, alice)).status).toBe(410);

    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const { rows } = await pool.query("select points, stats from live_shares where token = $1", [token]);
    await pool.end();
    expect(rows[0]).toEqual({ points: [], stats: {} });
  });

  it("starting a new share ends the previous one", async () => {
    const a = await startShare(bob);
    const b = await startShare(bob);
    expect((await (await view(a.token)).json()).state).toBe("ended");
    expect((await (await view(b.token)).json()).state).toBe("live");
  });

  it("expired links show nothing", async () => {
    const { token } = await startShare(bob);
    await post({ action: "update", token, from: 0, points: trail(10), stats }, bob);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    await pool.query("update live_shares set expires_at = now() - interval '1 second' where token = $1", [token]);
    await pool.end();
    expect(await (await view(token)).json()).toEqual({ state: "expired" });
    expect((await post({ action: "update", token, from: 10, points: [], stats }, bob)).status).toBe(410);
  });

  it("unknown or malformed links are 404, and viewer answers are cacheable", async () => {
    expect((await view("x".repeat(22))).status).toBe(404);
    expect((await view("../etc")).status).toBe(404);
    const { token } = await startShare(alice);
    const res = await view(token);
    expect(res.headers.get("cache-control")).toContain("s-maxage=");
  });
});
