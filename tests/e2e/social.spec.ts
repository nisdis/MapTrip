import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import { test, expect, hasDb, isolate } from "./fixtures";

test.skip(!hasDb, "needs DATABASE_URL (a Postgres for the API)");

test.beforeAll(() => {
  execFileSync("node", ["scripts/migrate.mjs"], { stdio: "ignore" });
  execFileSync(
    "node",
    [
      "-e",
      `const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('truncate follows, blocks, trip_reports, trip_views, profiles, live_shares, trips, saved_places, session, account, verification, "user" cascade').then(()=>p.end())`,
    ],
    { stdio: "inherit" },
  );
});

/** A signed-in person with a public name, in their own browser. */
async function person(browser: Browser, email: string, name: string): Promise<{ page: Page; id: string }> {
  const ctx = await browser.newContext();
  await isolate(ctx);
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByText("New here? Create an account").click();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0, { timeout: 10_000 });
  expect((await page.request.post("/api/public", { data: { action: "profile", displayName: name } })).ok()).toBe(true);
  const id = (await (await page.request.get("/api/auth/get-session")).json()).user.id as string;
  return { page, id };
}

async function shareTrip(page: Page, name: string, visibility: string) {
  const track = Array.from({ length: 31 }, (_, i) => ({ lat: 34.985 + i * 0.001, lng: 135.758, t: Date.now() - 3_600_000 + i * 10_000, speed: 8 }));
  const id = randomUUID();
  await page.request.post("/api/trips", { data: { id, name, kind: "recorded", createdAt: Date.now() - 3_600_000, track, distanceM: 12_000, durationS: 1800, photos: [] } });
  await page.request.post("/api/public", { data: { action: "settings", trip: id, visibility } });
}

test("follow by request: request, approve, then the follower sees unlisted trips and the feed", async ({ browser }) => {
  const ana = await person(browser, "ana@test.com", "Ana R");
  await shareTrip(ana.page, "Ana's public ride", "public");
  await shareTrip(ana.page, "Ana's unlisted ride", "unlisted");
  const ben = await person(browser, "ben@test.com", "Ben K");

  // Ben finds Ana's profile (from her trip's author link in real use) and asks to follow.
  await ben.page.goto(`/u/${ana.id}`);
  await expect(ben.page.getByRole("heading", { name: "Ana R" })).toBeVisible();
  await expect(ben.page.getByText("Ana's public ride")).toBeVisible();
  await expect(ben.page.getByText("Ana's unlisted ride")).toHaveCount(0);
  await ben.page.getByRole("button", { name: "Request to follow" }).click();
  await expect(ben.page.getByRole("button", { name: "Requested" })).toBeVisible();

  // Ana sees the request (badge), approves it.
  await ana.page.reload();
  await ana.page.waitForSelector(".leaflet-container");
  await ana.page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(ana.page.getByLabel("1 follow requests")).toBeVisible();
  await ana.page.getByRole("button", { name: /^People/ }).click();
  await ana.page.getByRole("button", { name: "Approve Ben K" }).click();
  await expect(ana.page.getByRole("list", { name: "Follow requests" })).toContainText("None.");

  // Ben now follows her: unlisted trips appear on her profile and in his feed.
  await ben.page.reload();
  await expect(ben.page.getByRole("button", { name: "Following" })).toBeVisible();
  await expect(ben.page.getByText("Ana's unlisted ride")).toBeVisible();
  await ben.page.goto("/");
  await ben.page.waitForSelector(".leaflet-container");
  await ben.page.getByRole("button", { name: "Menu", exact: true }).click();
  await ben.page.getByRole("button", { name: /^People/ }).click();
  const feed = ben.page.getByRole("list", { name: "Trips from people you follow" });
  await expect(feed).toContainText("Ana's unlisted ride");
  await expect(feed).toContainText("Ana's public ride");

  // Leaderboard: opt in, then he's on it (Ana isn't until she joins).
  await ben.page.getByRole("tab", { name: "Leaderboard" }).click();
  await ben.page.getByRole("button", { name: "Join" }).click();
  const board = ben.page.getByRole("list", { name: "Leaderboard" });
  await expect(board).toContainText("Ben K (you)");
  await expect(board).not.toContainText("Ana R");

  // Ana blocks Ben: he loses access to her profile.
  await ana.page.goto(`/u/${ben.id}`);
  await ana.page.getByRole("button", { name: "Block" }).click();
  await expect(ana.page.getByText("You blocked Ben K.")).toBeVisible();
  await ben.page.goto(`/u/${ana.id}`);
  await expect(ben.page.getByRole("heading", { name: "Profile not found" })).toBeVisible();
});
