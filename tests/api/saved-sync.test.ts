import { beforeAll, describe, expect, it } from "vitest";
import { hasDb, resetDb, call, signUp } from "./helpers";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.BETTER_AUTH_URL ??= "http://localhost:5173";

const entry = (over: Record<string, unknown> = {}, place: Record<string, unknown> = {}) => ({
  key: "fav:node/1",
  kind: "favourite",
  list: "favourites",
  place: { id: "node/1", name: "Cafe", category: "Cafe", address: null, lat: 12.9, lng: 77.6, countryCode: "in", ...place },
  note: null,
  createdAt: 1000,
  updatedAt: 1000,
  deleted: false,
  ...over,
});

describe.skipIf(!hasDb)("saved places sync API", async () => {
  const auth = await import("../../api/auth");
  const saved = await import("../../api/saved");
  let alice = "";
  let bob = "";
  const sync = (entries: unknown[], cookie?: string) => call(saved.POST, "POST", "/api/saved", { entries }, cookie);

  beforeAll(async () => {
    await resetDb();
    alice = await signUp(auth.POST as (r: Request) => Promise<Response>, "alice@test.com");
    bob = await signUp(auth.POST as (r: Request) => Promise<Response>, "bob@test.com");
  });

  it("needs a session", async () => {
    expect((await sync([])).status).toBe(401);
  });

  it("keeps the most recent edit of each place", async () => {
    await sync([entry({ note: "old", updatedAt: 2000 })], alice);
    await sync([entry({ note: "older", updatedAt: 1500 })], alice); // a stale device
    const body = await (await sync([], alice)).json();
    expect(body.entries[0].note).toBe("old");
  });

  it("syncs deletions as records", async () => {
    const body = await (await sync([entry({ deleted: true, updatedAt: 3000 })], alice)).json();
    expect(body.entries[0].deleted).toBe(true);
  });

  it("rejects inconsistent or malformed records", async () => {
    const body = await (
      await sync(
        [
          entry({ key: "fav:node/2" }, { id: "node/999" }), // key/place mismatch
          entry({ key: "home", kind: "favourite" }), // kind mismatch
          entry({ key: "fav:node/4;drop" }, { id: "node/4" }), // bad key
          entry({ key: "fav:node/5" }, { id: "node/5", lat: 999 }), // impossible latitude
        ],
        alice,
      )
    ).json();
    expect(body.rejected).toBe(4);
  });

  it("clamps timestamps from the future to at most 5 minutes ahead", async () => {
    const future = Date.now() + 365 * 24 * 3600 * 1000;
    const body = await (await sync([entry({ key: "work", kind: "work", list: null, updatedAt: future })], alice)).json();
    const work = body.entries.find((e: { key: string }) => e.key === "work");
    expect(work.updatedAt).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000 + 1000);
  });

  it("keeps each user's places private", async () => {
    const body = await (await sync([], bob)).json();
    expect(body.entries).toEqual([]);
  });

  it("rejects foreign origins even with a valid session", async () => {
    const res = await saved.POST(
      new Request("http://localhost:5173/api/saved", {
        method: "POST",
        headers: { Origin: "https://evil.example", "Content-Type": "application/json", Cookie: alice },
        body: JSON.stringify({ entries: [] }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("refuses oversized requests", async () => {
    expect((await sync(new Array(2001).fill({}), alice)).status).toBe(400);
  });
});
