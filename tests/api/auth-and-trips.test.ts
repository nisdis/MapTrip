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
