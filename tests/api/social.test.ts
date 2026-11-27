import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { hasDb, resetDb, call, signUp } from "./helpers";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.BETTER_AUTH_URL ??= "http://localhost:5173";

const track = Array.from({ length: 31 }, (_, i) => ({ lat: 34.985 + i * 0.001, lng: 135.758, t: Date.now() - 3_600_000 + i * 10_000, speed: 8 }));
const trip = (name: string, over: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  name,
  kind: "recorded",
  createdAt: Date.now() - 3_600_000,
  track,
  distanceM: 12_000,
  durationS: 1800,
  photos: [],
  ...over,
});

describe.skipIf(!hasDb)("social: follows, blocks, feed, leaderboard, achievements", async () => {
  const auth = await import("../../api/auth");
  const trips = await import("../../api/trips");
  const pub = await import("../../api/public");
  const social = await import("../../api/social");
  const c: Record<string, string> = {};
  const id: Record<string, string> = {};
  const get = (q: string, who?: string) => call(social.GET, "GET", `/api/social?${q}`, undefined, who ? c[who] : undefined);
  const post = (body: unknown, who: string) => call(social.POST, "POST", "/api/social", body, c[who]);
  const share = async (who: string, name: string, visibility: string, over: Record<string, unknown> = {}) => {
    const t = trip(name, over);
    await call(trips.POST as never, "POST", "/api/trips", t, c[who]);
    if (visibility !== "private") await call(pub.POST, "POST", "/api/public", { action: "settings", trip: t.id, visibility }, c[who]);
    return t;
  };

  beforeAll(async () => {
    await resetDb();
    for (const n of ["ana", "ben", "cat", "dan"]) {
      c[n] = await signUp(auth.POST as (r: Request) => Promise<Response>, `${n}@test.com`);
      id[n] = (await (await call(auth.GET as never, "GET", "/api/auth/get-session", undefined, c[n])).json()).user.id;
      if (n !== "dan") await call(pub.POST, "POST", "/api/public", { action: "profile", displayName: n.toUpperCase() }, c[n]);
    }
    await share("ana", "Ana public", "public");
    await share("ana", "Ana unlisted", "unlisted");
    await share("ana", "Ana private", "private");
    await share("ana", "Ana imported", "public", { imported: true, distanceM: 500_000 });
  });

  it("a profile shows only public trips to strangers, never private ones", async () => {
    const p = await (await get(`profile=${id.ana}`)).json();
    expect(p).toMatchObject({ displayName: "ANA", isMe: false, followers: 0 });
    expect(p.trips.map((t: { title: string }) => t.title).sort()).toEqual(["Ana imported", "Ana public"]);
    expect(p.achievements).toBeNull(); // private by default
    expect((await get(`profile=${id.dan}`)).status).toBe(404); // no public name, no profile
  });

  it("trip cards carry the route as others see it: start and end trimmed, never the full route", async () => {
    const { decodePolyline } = await import("../../api/_lib/trackFormat");
    const p = await (await get(`profile=${id.ana}`)).json();
    const card = p.trips.find((t: { title: string }) => t.title === "Ana public");
    expect(card.line.length).toBeGreaterThan(0);
    const pts = card.line.flatMap((l: string) => decodePolyline(l));
    // 31 points ~111 m apart going north; the default 500 m is hidden at each end.
    const lats = pts.map((q: number[]) => q[0]);
    expect(Math.min(...lats)).toBeGreaterThan(track[0].lat + 0.004);
    expect(Math.max(...lats)).toBeLessThan(track[30].lat - 0.004);
  });

  it("following needs approval; approved followers also see unlisted trips", async () => {
    expect(await (await post({ action: "follow", user: id.ana }, "ben")).json()).toMatchObject({ following: "pending" });
    let p = await (await get(`profile=${id.ana}`, "ben")).json();
    expect(p.relationship.following).toBe("pending");
    expect(p.trips.some((t: { title: string }) => t.title === "Ana unlisted")).toBe(false);

    const people = await (await get("people=1", "ana")).json();
    expect(people.requests).toEqual([expect.objectContaining({ userId: id.ben, displayName: "BEN" })]);
    await post({ action: "respond", user: id.ben, accept: true }, "ana");

    p = await (await get(`profile=${id.ana}`, "ben")).json();
    expect(p.relationship.following).toBe("approved");
    expect(p.followers).toBe(1);
    expect(p.trips.map((t: { title: string }) => t.title)).toContain("Ana unlisted");
    expect(p.trips.map((t: { title: string }) => t.title)).not.toContain("Ana private");

    const feed = await (await get("feed=1", "ben")).json();
    expect(feed.trips.map((t: { title: string }) => t.title).sort()).toEqual(["Ana imported", "Ana public", "Ana unlisted"]);
    expect(feed.trips[0]).toMatchObject({ author: "ANA", authorId: id.ana });
  });

  it("declining removes the request; you need a public name to follow", async () => {
    await post({ action: "follow", user: id.ana }, "cat");
    await post({ action: "respond", user: id.cat, accept: false }, "ana");
    expect((await (await get(`profile=${id.ana}`, "cat")).json()).relationship.following).toBe("none");
    expect((await post({ action: "follow", user: id.ana }, "dan")).status).toBe(409);
  });

  it("a block removes follows both ways, hides the profile from them, and stops new requests", async () => {
    await post({ action: "follow", user: id.ana }, "cat");
    await post({ action: "respond", user: id.cat, accept: true }, "ana");
    await post({ action: "block", user: id.cat }, "ana");
    expect((await get(`profile=${id.ana}`, "cat")).status).toBe(404);
    expect((await post({ action: "follow", user: id.ana }, "cat")).status).toBe(404);
    expect((await (await get("feed=1", "cat")).json()).trips).toHaveLength(0);
    const people = await (await get("people=1", "ana")).json();
    expect(people.blocked.map((b: { userId: string }) => b.userId)).toEqual([id.cat]);
    expect(people.followers.map((f: { userId: string }) => f.userId)).toEqual([id.ben]);
    await post({ action: "unblock", user: id.cat }, "ana");
    expect((await get(`profile=${id.ana}`, "cat")).status).toBe(200);
  });

  it("leaderboard: opt-in only, among people you follow, imported trips don't count", async () => {
    let lb = await (await get("leaderboard=week", "ben")).json();
    expect(lb).toMatchObject({ optedIn: false, rows: [] });
    await post({ action: "settings", leaderboard: true }, "ben");
    await post({ action: "settings", leaderboard: true }, "ana");
    await share("ben", "Ben ride", "private");
    lb = await (await get("leaderboard=week", "ben")).json();
    expect(lb.rows.map((r: { displayName: string; km: number }) => [r.displayName, r.km])).toEqual([
      ["ANA", 36], // her 3 recorded trips (public, unlisted, private: it's her distance), not the 500 km import
      ["BEN", 12],
    ]);
    // Ana doesn't follow Ben: her leaderboard has only her.
    const anas = await (await get("leaderboard=week", "ana")).json();
    expect(anas.rows.map((r: { displayName: string }) => r.displayName)).toEqual(["ANA"]);
  });

  it("achievements are shown on a profile only when the person chooses", async () => {
    const mine = await (await get(`profile=${id.ana}`, "ana")).json();
    expect(mine.achievements.find((a: { id: string }) => a.id === "first-trip").earned).toBe(true);
    expect(mine.achievements.find((a: { id: string }) => a.id === "km-1000").earned).toBe(false); // import ignored
    expect((await (await get(`profile=${id.ana}`, "ben")).json()).achievements).toBeNull();
    await post({ action: "settings", showAchievements: true }, "ana");
    const shown = await (await get(`profile=${id.ana}`, "ben")).json();
    expect(shown.achievements.every((a: { earned: boolean }) => a.earned)).toBe(true); // only earned ones
    expect(shown.achievements.length).toBeGreaterThan(0);
  });

  it("unfollow, remove a follower; writes need sign-in and this site", async () => {
    await post({ action: "removeFollower", user: id.ben }, "ana");
    expect((await (await get(`profile=${id.ana}`, "ben")).json()).relationship.following).toBe("none");
    expect((await call(social.POST, "POST", "/api/social", { action: "follow", user: id.ana })).status).toBe(401);
    const foreign = await social.POST(
      new Request("http://localhost:5173/api/social", {
        method: "POST",
        headers: { Origin: "https://evil.example", Cookie: c.ben, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "follow", user: id.ana }),
      }),
    );
    expect(foreign.status).toBe(403);
  });

  it("shared trips name their author with a link to the profile", async () => {
    const t = await share("ana", "Linked", "public");
    expect(await (await call(pub.GET, "GET", `/api/public?trip=${t.id}`)).json()).toMatchObject({ author: "ANA", authorId: id.ana });
  });
});

describe.skipIf(!hasDb)("usage counts", async () => {
  const auth = await import("../../api/auth");
  const pub = await import("../../api/public");
  const { actorKey } = await import("../../api/_lib/usage");
  const event = (name: string, device: string, cookie?: string) =>
    call(pub.POST, "POST", "/api/public", { action: "event", name, device }, cookie);

  it("counts known events by person per day, anonymously; only admins see the numbers", async () => {
    const d1 = randomUUID();
    const d2 = randomUUID();
    for (let i = 0; i < 3; i++) expect((await event("app_open", d1)).status).toBe(200);
    await event("app_open", d2);
    await event("trip_recorded", d1);
    expect((await event("stolen_secrets", d1)).status).toBe(400);
    expect((await event("app_open", "not-a-uuid")).status).toBe(400);

    process.env.ADMIN_EMAILS = "boss@test.com";
    const boss = await signUp(auth.POST as never, "boss@test.com");
    const stats = await (await call(pub.GET, "GET", "/api/public?stats=1", undefined, boss)).json();
    expect(stats.active).toMatchObject({ d1: 2, d7: 2, d30: 2 });
    expect(stats.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "app_open", d7: 4, p7: 2 }),
        expect.objectContaining({ name: "trip_recorded", d7: 1, p7: 1 }),
      ]),
    );
    expect((await call(pub.GET, "GET", "/api/public?stats=1")).status).toBe(404);
    // The stored code isn't the device id, and changes month to month.
    expect(actorKey("d:x", "2026-11")).not.toBe(actorKey("d:x", "2026-12"));
    const id = "d:5d0c4a52-8a3e-4c1e-9f55-0a1b2c3d4e5f";
    expect(actorKey(id, "2026-11")).not.toContain("5d0c4a52");
    expect(actorKey(id, "2026-11")).toHaveLength(22);
  });
});

describe.skipIf(!hasDb)("explored map on profiles", async () => {
  const auth = await import("../../api/auth");
  const trips = await import("../../api/trips");
  const pub = await import("../../api/public");
  const social = await import("../../api/social");
  const saved = await import("../../api/saved");
  const { cellCenter } = await import("../../api/_lib/explored");
  const { haversineM } = await import("../../api/_lib/live");
  // 6 km north from "home", then a separate private trip far away.
  const north = (lat0: number, lng: number) =>
    Array.from({ length: 61 }, (_, i) => ({ lat: lat0 + i * 0.0009, lng, t: Date.now() - 3_600_000 + i * 10_000, speed: 8 }));

  it("off by default; when on: only shared trips, start/end trimmed, nothing near Home", async () => {
    const eve = await signUp(auth.POST as never, "eve@test.com");
    const id = (await (await call(auth.GET as never, "GET", "/api/auth/get-session", undefined, eve)).json()).user.id;
    await call(pub.POST, "POST", "/api/public", { action: "profile", displayName: "Eve" }, eve);
    const home = { id: "pin/34.900000,135.760000", name: "Home", category: null, address: null, lat: 34.9, lng: 135.76, countryCode: null };
    await call(saved.POST, "POST", "/api/saved", { entries: [{ key: "home", kind: "home", list: null, place: home, note: null, createdAt: 1, updatedAt: 1, deleted: false }] }, eve);
    const shared = { id: randomUUID(), name: "From home", kind: "recorded", createdAt: Date.now() - 3_600_000, track: north(34.9, 135.76), distanceM: 6000, durationS: 600, photos: [] };
    const secret = { ...shared, id: randomUUID(), name: "Secret", track: north(35.5, 136.5) };
    await call(trips.POST as never, "POST", "/api/trips", shared, eve);
    await call(trips.POST as never, "POST", "/api/trips", secret, eve);
    await call(pub.POST, "POST", "/api/public", { action: "settings", trip: shared.id, visibility: "public" }, eve);

    const look = async () => (await (await call(social.GET, "GET", `/api/social?profile=${id}`)).json()).explored as string[] | null;
    expect(await look()).toBeNull();

    await call(social.POST, "POST", "/api/social", { action: "settings", showExplored: true }, eve);
    const cells = (await look())!;
    expect(cells.length).toBeGreaterThan(2);
    // Nothing within 1.5 km of Home (the trip starts there; its first 500 m are trimmed anyway).
    for (const c of cells) expect(haversineM(cellCenter(c), [34.9, 135.76])).toBeGreaterThan(1500);
    // The private trip's area never shows.
    expect(cells.every((c) => cellCenter(c)[0] < 35.4)).toBe(true);
    // Its owner's settings say it's on.
    const mine = await (await call(social.GET, "GET", `/api/social?profile=${id}`, undefined, eve)).json();
    expect(mine.settings.showExplored).toBe(true);
  });
});

describe.skipIf(!hasDb)("reactions, comments and notifications", async () => {
  const auth = await import("../../api/auth");
  const trips = await import("../../api/trips");
  const pub = await import("../../api/public");
  const social = await import("../../api/social");
  const c: Record<string, string> = {};
  const id: Record<string, string> = {};
  const post = (body: unknown, who: string) => call(social.POST, "POST", "/api/social", body, c[who]);
  const talk = async (trip: string, who?: string) => (await call(social.GET, "GET", `/api/social?talk=${trip}`, undefined, who ? c[who] : undefined)).json();
  const pubT = { id: randomUUID(), name: "Coast road", kind: "recorded", createdAt: Date.now() - 3_600_000, track, distanceM: 3000, durationS: 600, photos: [] };
  const unl = { ...pubT, id: randomUUID(), name: "Followers only" };
  const priv = { ...pubT, id: randomUUID(), name: "Private" };

  beforeAll(async () => {
    for (const n of ["owner", "fan", "noname", "troll"]) {
      c[n] = await signUp(auth.POST as never, `${n}-talk@test.com`);
      id[n] = (await (await call(auth.GET as never, "GET", "/api/auth/get-session", undefined, c[n])).json()).user.id;
      if (n !== "noname") await call(pub.POST, "POST", "/api/public", { action: "profile", displayName: n.toUpperCase() }, c[n]);
    }
    for (const t of [pubT, unl, priv]) await call(trips.POST as never, "POST", "/api/trips", t, c.owner);
    await call(pub.POST, "POST", "/api/public", { action: "settings", trip: pubT.id, visibility: "public" }, c.owner);
    await call(pub.POST, "POST", "/api/public", { action: "settings", trip: unl.id, visibility: "unlisted" }, c.owner);
    await post({ action: "block", user: id.troll }, "owner");
  });

  it("react with one of five, change it, take it back; the owner gets one notification per person", async () => {
    expect((await post({ action: "react", trip: pubT.id, emoji: "clap" }, "fan")).status).toBe(200);
    expect((await post({ action: "react", trip: pubT.id, emoji: "fire" }, "fan")).status).toBe(200);
    expect((await post({ action: "react", trip: pubT.id, emoji: "poop" }, "fan")).status).toBe(400);
    let t = await talk(pubT.id, "fan");
    expect(t.counts).toEqual({ clap: 0, heart: 0, wow: 0, laugh: 0, fire: 1 });
    expect(t.mine).toBe("fire");
    expect(t.people).toEqual([{ userId: id.fan, name: "FAN", emoji: "fire" }]);
    const n = await (await call(social.GET, "GET", "/api/social?notifications=1", undefined, c.owner)).json();
    expect(n.unread).toBe(1);
    expect(n.items[0]).toMatchObject({ kind: "reaction", emoji: "fire", actor: { name: "FAN" }, trip: { title: "Coast road" } });
    await post({ action: "react", trip: pubT.id, emoji: null }, "fan");
    t = await talk(pubT.id);
    expect(t.counts.fire).toBe(0);
    expect(t.canTalk).toBe(false); // signed out: read only
  });

  it("comments: tidied, owner notified, author or owner can delete; reports reach admins", async () => {
    const r = await (await post({ action: "comment", trip: pubT.id, body: "  Great views!\n\n\n\nWhere is this?  " }, "fan")).json();
    expect(r.ok).toBe(true);
    const t = await talk(pubT.id, "owner");
    expect(t.comments).toEqual([expect.objectContaining({ body: "Great views!\n\nWhere is this?", author: { id: id.fan, name: "FAN" }, canDelete: true })]);
    expect((await post({ action: "comment", trip: pubT.id, body: "   " }, "fan")).status).toBe(400);
    const n = await (await call(social.GET, "GET", "/api/social?notifications=1", undefined, c.owner)).json();
    expect(n.items[0]).toMatchObject({ kind: "comment", comment: "Great views!\n\nWhere is this?" });
    await post({ action: "readNotifications" }, "owner");
    expect((await (await call(social.GET, "GET", "/api/social?notifications=1", undefined, c.owner)).json()).unread).toBe(0);

    expect((await post({ action: "reportComment", comment: r.id, reason: "spam" }, "owner")).status).toBe(200);
    process.env.ADMIN_EMAILS = "owner-talk@test.com";
    const rep = await (await call(pub.GET, "GET", "/api/public?reports=1", undefined, c.owner)).json();
    expect(rep.comments[0]).toMatchObject({ id: r.id, count: 1, reasons: ["spam"] });
    // Someone else can't delete it; the trip's owner can.
    expect((await post({ action: "deleteComment", comment: r.id }, "troll")).status).toBe(404);
    expect((await post({ action: "deleteComment", comment: r.id }, "owner")).status).toBe(200);
    expect((await talk(pubT.id)).comments).toEqual([]);
  });

  it("who can: needs a public name; unlisted only for approved followers; never private or blocked", async () => {
    expect((await post({ action: "react", trip: pubT.id, emoji: "clap" }, "noname")).status).toBe(409);
    expect((await post({ action: "comment", trip: unl.id, body: "hi" }, "fan")).status).toBe(403);
    await post({ action: "follow", user: id.owner }, "fan");
    await post({ action: "respond", user: id.fan, accept: true }, "owner");
    expect((await post({ action: "comment", trip: unl.id, body: "hi" }, "fan")).status).toBe(200);
    expect((await post({ action: "react", trip: priv.id, emoji: "clap" }, "fan")).status).toBe(404);
    expect((await talk(priv.id)).message).toBe("Trip not found");
    expect((await post({ action: "react", trip: pubT.id, emoji: "clap" }, "troll")).status).toBe(404); // blocked
  });
});

describe.skipIf(!hasDb)("streaks and challenges", async () => {
  const auth = await import("../../api/auth");
  const trips = await import("../../api/trips");
  const pub = await import("../../api/public");
  const social = await import("../../api/social");
  const c: Record<string, string> = {};
  const id: Record<string, string> = {};
  const save = (who: string, daysAgo: number, km: number) =>
    call(trips.POST as never, "POST", "/api/trips", {
      id: randomUUID(), name: "Ride", kind: "recorded", createdAt: Date.now() - daysAgo * 86_400_000,
      track: Array.from({ length: 20 }, (_, i) => ({ lat: 12.9 + i * 0.001, lng: 77.6, t: Date.now() - daysAgo * 86_400_000 + i * 1000, speed: 8 })),
      distanceM: km * 1000, durationS: 600, photos: [],
    }, c[who]);
  const get = async (who: string) => (await call(social.GET, "GET", "/api/social?challenges=1&tz=Asia/Kolkata", undefined, c[who])).json();

  beforeAll(async () => {
    for (const n of ["sam", "pal", "shy"]) {
      c[n] = await signUp(auth.POST as never, `${n}-ch@test.com`);
      id[n] = (await (await call(auth.GET as never, "GET", "/api/auth/get-session", undefined, c[n])).json()).user.id;
      await call(pub.POST, "POST", "/api/public", { action: "profile", displayName: n.toUpperCase() }, c[n]);
    }
    await save("sam", 0, 12);
    await save("sam", 7, 8);
    await save("sam", 14, 0.5); // too short: doesn't count
    await save("pal", 0, 30);
    await save("shy", 0, 30);
    for (const f of ["pal", "shy"]) {
      await call(social.POST, "POST", "/api/social", { action: "follow", user: id[f] }, c.sam);
      await call(social.POST, "POST", "/api/social", { action: "respond", user: id.sam, accept: true }, c[f]);
    }
    await call(social.POST, "POST", "/api/social", { action: "settings", leaderboard: true }, c.pal);
  });

  it("your streak and this month's three challenges", async () => {
    const r = await get("sam");
    expect(r.streak).toMatchObject({ current: 2, thisWeek: true });
    expect(r.challenges).toHaveLength(3);
    expect(r.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("people you follow show only if they joined the leaderboard", async () => {
    const r = await get("sam");
    expect(r.friends.map((f: { name: string }) => f.name)).toEqual(["PAL"]);
    expect(r.friends[0].progress).toHaveLength(3);
  });
});
