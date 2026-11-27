import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { hasDb, resetDb, call, signUp } from "./helpers";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.BETTER_AUTH_URL ??= "http://localhost:5173";
process.env.ADMIN_EMAILS = "admin@test.com";

// A 3.3 km trip north from Kyoto station (~111 m per point)
const track = Array.from({ length: 31 }, (_, i) => ({ lat: 34.985 + i * 0.001, lng: 135.758, t: 1_800_000_000_000 + i * 10_000, speed: 8 + (i % 5) }));
const trip = (over: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  name: "Morning ride",
  kind: "recorded",
  createdAt: 1_800_000_000_000,
  track,
  distanceM: 3336,
  durationS: 300,
  photos: [],
  ...over,
});

describe.skipIf(!hasDb)("shared trips API", async () => {
  const auth = await import("../../api/auth");
  const trips = await import("../../api/trips");
  const pub = await import("../../api/public");
  const users: Record<string, string> = {};
  const post = (body: unknown, cookie?: string) => call(pub.POST, "POST", "/api/public", body, cookie);
  const get = (q: string, cookie?: string) => call(pub.GET, "GET", `/api/public?${q}`, undefined, cookie);
  const save = async (cookie: string, t = trip()) => {
    expect((await call(trips.POST as never, "POST", "/api/trips", t, cookie)).status).toBe(200);
    return t;
  };
  const area = "s=34.9&w=135.7&n=35.1&e=135.8";

  beforeAll(async () => {
    await resetDb();
    for (const name of ["alice", "bob", "carol", "dave", "admin"]) {
      users[name] = await signUp(auth.POST as (r: Request) => Promise<Response>, `${name}@test.com`);
    }
  });

  it("cloud trips start private: nobody else can see them", async () => {
    const t = await save(users.alice);
    expect((await get(`trip=${t.id}`)).status).toBe(404);
    expect((await (await get(`settings=${t.id}`, users.alice)).json()).visibility).toBe("private");
    expect((await get(`settings=${t.id}`, users.bob)).status).toBe(404); // not bob's
  });

  it("sharing needs a public name first; names are checked", async () => {
    const t = await save(users.alice);
    const res = await post({ action: "settings", trip: t.id, visibility: "unlisted", hideM: 500 }, users.alice);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ needsName: true });
    expect((await post({ action: "profile", displayName: "alice@test.com" }, users.alice)).status).toBe(400);
    expect((await post({ action: "profile", displayName: "Alice R" }, users.alice)).status).toBe(200);
    expect(await (await get("me=1", users.alice)).json()).toEqual({ displayName: "Alice R", isAdmin: false });
  });

  it("unlisted: viewable by link with ends hidden, not in Explore; only the owner can change it", async () => {
    const t = await save(users.alice);
    expect((await post({ action: "settings", trip: t.id, visibility: "public" }, users.bob)).status).toBe(404);
    const res = await (await post({ action: "settings", trip: t.id, visibility: "unlisted", hideM: 500 }, users.alice)).json();
    expect(res).toMatchObject({ visibility: "unlisted", hideM: 500 });
    const view = await (await get(`trip=${t.id}`)).json();
    expect(view).toMatchObject({ title: "Morning ride", author: "Alice R", visibility: "unlisted" });
    // 3.3 km with 500 m hidden at each end: the first point shown is >= 500 m from the start
    expect(view.points[0][0]).toBeGreaterThanOrEqual(34.9895);
    expect(view.points.at(-1)[0]).toBeLessThanOrEqual(35.0105);
    expect(view.stats).toMatchObject({ distanceM: 3336, durationS: 300, date: "2027-01-15" });
    const ex = await (await get(`explore=1&${area}`)).json();
    expect(ex.trips.map((x: { id: string }) => x.id)).not.toContain(t.id);
  });

  it("public: in Explore for the areas it passes through, and only those", async () => {
    const t = await save(users.alice);
    await post({ action: "settings", trip: t.id, visibility: "public", hideM: 300 }, users.alice);
    const here = await (await get(`explore=1&${area}`)).json();
    const item = here.trips.find((x: { id: string }) => x.id === t.id);
    expect(item).toMatchObject({ title: "Morning ride", author: "Alice R" });
    expect(item.line.length).toBeGreaterThan(10);
    const elsewhere = await (await get("explore=1&s=12.9&w=77.5&n=13.1&e=77.7")).json();
    expect(elsewhere.trips).toHaveLength(0);
    // Nothing in view: the nearest public trips are offered instead, with how far they are.
    expect(elsewhere.nearest[0]).toMatchObject({ title: "Morning ride", author: "Alice R" });
    expect(elsewhere.nearest[0].distanceKm).toBeGreaterThan(5000); // Bengaluru to Kyoto
    expect(elsewhere.nearest[0].bbox).toHaveLength(4);
    // Only the hidden start lies in this box: not found there.
    const startOnly = await (await get("explore=1&s=34.984&w=135.75&n=34.986&e=135.76")).json();
    expect(startOnly.trips.map((x: { id: string }) => x.id)).not.toContain(t.id);
  });

  it("views: once per person per day, the owner doesn't count; more views rank higher", async () => {
    const quiet = await save(users.alice, trip({ name: "Quiet" }));
    const busy = await save(users.alice, trip({ name: "Busy" }));
    for (const t of [quiet, busy]) await post({ action: "settings", trip: t.id, visibility: "public" }, users.alice);
    expect(await (await post({ action: "view", trip: busy.id }, users.alice)).json()).toMatchObject({ counted: false });
    const v1 = await (await post({ action: "view", trip: busy.id }, users.bob)).json();
    const v2 = await (await post({ action: "view", trip: busy.id }, users.bob)).json(); // same person again
    expect([v1.counted, v2.counted]).toEqual([true, false]);
    const ex = await (await get(`explore=1&${area}`)).json();
    const ids = ex.trips.map((x: { id: string }) => x.id);
    expect(ids.indexOf(busy.id)).toBeLessThan(ids.indexOf(quiet.id));
    expect((await post({ action: "view", trip: randomUUID() })).status).toBe(404);
  });

  it("only recorded trips can be shared; going private hides it again", async () => {
    // A planned trip (older app versions) is a route: it goes to Saved, there's no trip to share.
    const end = (name: string, lat: number) => ({ id: 1, name, displayName: name, location: [lat, 135.76], type: "x", importance: 1 });
    const planned = await save(
      users.alice,
      trip({ kind: "planned", track: undefined, origin: end("Station", 34.98), destination: end("Gion", 35.0) }),
    );
    expect((await post({ action: "settings", trip: planned.id, visibility: "public" }, users.alice)).status).toBe(404);
    const t = await save(users.alice);
    await post({ action: "settings", trip: t.id, visibility: "public" }, users.alice);
    await post({ action: "settings", trip: t.id, visibility: "private" }, users.alice);
    expect((await get(`trip=${t.id}`)).status).toBe(404);
  });

  it("photos: only ticked ones that belong to the trip are listed", async () => {
    const own = randomUUID();
    const t = await save(
      users.alice,
      trip({ photos: [{ id: own, addedAt: 1, cloudPath: "" }] }), // cloudPath filled below
    );
    // (the trips API only keeps photos under the owner's own path)
    const aliceId = (await (await call(auth.GET as never, "GET", "/api/auth/get-session", undefined, users.alice)).json()).user.id;
    await save(users.alice, { ...t, photos: [{ id: own, addedAt: 1, cloudPath: `trips/${aliceId}/${own}.jpg` }] });
    await post({ action: "settings", trip: t.id, visibility: "unlisted", photos: [own, randomUUID()] }, users.alice);
    expect((await (await get(`trip=${t.id}`)).json()).photos).toEqual([own]);
  });

  it("three reports from different people take it out of Explore until an admin decides", async () => {
    const t = await save(users.alice, trip({ name: "Reported" }));
    await post({ action: "settings", trip: t.id, visibility: "public" }, users.alice);
    const inExplore = async () => (await (await get(`explore=1&${area}`)).json()).trips.some((x: { id: string }) => x.id === t.id);

    expect((await post({ action: "report", trip: t.id, reason: "home" })).status).toBe(401); // sign-in needed
    expect((await post({ action: "report", trip: t.id, reason: "home" }, users.alice)).status).toBe(400); // own trip
    expect((await post({ action: "report", trip: t.id, reason: "nope" }, users.bob)).status).toBe(400);
    await post({ action: "report", trip: t.id, reason: "home" }, users.bob);
    await post({ action: "report", trip: t.id, reason: "spam" }, users.bob); // same person again: still one
    await post({ action: "report", trip: t.id, reason: "person", details: "my house" }, users.carol);
    expect(await inExplore()).toBe(true);
    await post({ action: "report", trip: t.id, reason: "home" }, users.dave);
    expect(await inExplore()).toBe(false);
    expect((await get(`trip=${t.id}`)).status).toBe(200); // still viewable by link
    expect(await (await get(`settings=${t.id}`, users.alice)).json()).toMatchObject({ hiddenFromExplore: true });

    expect((await get("reports=1", users.bob)).status).toBe(404); // not an admin
    const list = await (await get("reports=1", users.admin)).json();
    const r = list.reports.find((x: { id: string }) => x.id === t.id);
    expect(r).toMatchObject({ count: 3, title: "Reported" });
    expect(r.details).toContain("my house");
    expect((await get("me=1", users.admin)).status).toBe(200);
    expect((await (await get("me=1", users.admin)).json()).isAdmin).toBe(true);

    expect((await post({ action: "moderate", trip: t.id, decision: "restore" }, users.bob)).status).toBe(404);
    await post({ action: "moderate", trip: t.id, decision: "restore" }, users.admin);
    expect(await inExplore()).toBe(true);
    expect((await (await get("reports=1", users.admin)).json()).reports.some((x: { id: string }) => x.id === t.id)).toBe(false);
  });

  it("an admin can take a trip down: it becomes private", async () => {
    const t = await save(users.alice, trip({ name: "Bad" }));
    await post({ action: "settings", trip: t.id, visibility: "public" }, users.alice);
    await post({ action: "report", trip: t.id, reason: "offensive" }, users.bob);
    await post({ action: "moderate", trip: t.id, decision: "remove" }, users.admin);
    expect((await get(`trip=${t.id}`)).status).toBe(404);
    expect((await (await get(`settings=${t.id}`, users.alice)).json()).visibility).toBe("private");
  });

  it("writes from other sites are refused", async () => {
    const res = await pub.POST(
      new Request("http://localhost:5173/api/public", {
        method: "POST",
        headers: { Origin: "https://evil.example", Cookie: users.alice, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "profile", displayName: "Hacked" }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
