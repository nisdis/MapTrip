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
