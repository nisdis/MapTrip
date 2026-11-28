import { execFileSync } from "node:child_process";
import { test, expect, fix, hold, hasDb, isolate } from "./fixtures";

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

test("share a trip live: sign in, viewer sees it, pause, +1 h, finish ends the link", async ({ page, browser }) => {
  // Sharer: start recording and head north (~111 m per fix).
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await fix(page, 12.97, 77.6, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  for (let i = 1; i <= 7; i++) await fix(page, 12.97 + i * 0.001, 77.6, i, 12, 905);

  const hud = page.locator('section[aria-label="Trip recorder"]');
  await hud.getByRole("button", { name: "Share live location" }).click();
  const sheet = page.getByRole("dialog", { name: "Share live location" });
  await expect(sheet).toContainText("to share this trip live");
  await sheet.getByLabel("Email").fill("live@test.com");
  await sheet.getByLabel("Password").fill("password123");
  await sheet.getByText("New here? Create an account").click();
  await sheet.getByRole("button", { name: "Create account" }).click();

  await expect(sheet).toContainText("first 300 m");
  await sheet.getByRole("button", { name: "1 hour" }).click();
  await sheet.getByRole("button", { name: "Start sharing" }).click();
  await expect(sheet).toContainText("Sharing live");
  await expect(sheet).toContainText(/Last sent/, { timeout: 10_000 });
  const link = await sheet.getByLabel("Live link").inputValue();
  expect(link).toMatch(/\/live\/[A-Za-z0-9_-]{22}$/);
  const endsBefore = await sheet.getByRole("status").innerText();
  await expect(hud).toContainText("Live");

  // Viewer: no account, another browser.
  const ctx = await browser.newContext();
  await isolate(ctx);
  const viewer = await ctx.newPage();
  await viewer.goto(new URL(link).pathname);
  const stats = viewer.locator('section[aria-label="Trip stats"]');
  await expect(viewer.getByRole("status").first()).toContainText("Live");
  await expect(stats).toContainText(/0\.7\d/); // ~0.78 km
  await expect(stats).toContainText("43"); // 12 m/s
  await expect(stats).toContainText("905");
  await expect(viewer.locator(".leaflet-overlay-pane path")).not.toHaveCount(0); // the trail
  await expect(viewer.locator(".leaflet-marker-pane > *")).toHaveCount(1); // where they are now

  // Pausing reaches viewers straight away.
  await sheet.getByRole("button", { name: "Close" }).click();
  await hud.getByRole("button", { name: "Pause", exact: true }).click();
  await page.waitForTimeout(1000);
  await viewer.reload();
  await expect(viewer.getByRole("status").first()).toContainText("Paused");

  // +1 hour
  await hud.getByRole("button", { name: "Resume", exact: true }).click();
  await hud.getByRole("button", { name: /Manage live link/ }).click();
  await sheet.getByRole("button", { name: "+1 hour" }).click();
  await expect(sheet.getByRole("status")).not.toHaveText(endsBefore);
  await sheet.getByRole("button", { name: "Close" }).click();

  // Finishing the trip ends the link; the route is no longer shown.
  await fix(page, 12.978, 77.6, 20, 10);
  await hold(page, 'button[aria-label^="Finish trip"]');
  await expect(page.locator('section[aria-label="Trip summary"]')).toBeVisible();
  await page.waitForTimeout(1000);
  await viewer.reload();
  await expect(viewer.getByRole("heading", { name: "This trip has ended" })).toBeVisible();
  await expect(viewer.locator(".leaflet-container")).toHaveCount(0);
  await ctx.close();
});

test("reloading mid-share stops that share (the recording is gone), other tabs don't", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await fix(page, 12.97, 77.6, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  for (let i = 1; i <= 5; i++) await fix(page, 12.97 + i * 0.001, 77.6, i, 10);
  await page.getByRole("button", { name: "Share live location" }).click();
  const sheet = page.getByRole("dialog", { name: "Share live location" });
  await sheet.getByLabel("Email").fill("reload@test.com");
  await sheet.getByLabel("Password").fill("password123");
  await sheet.getByText("New here? Create an account").click();
  await sheet.getByRole("button", { name: "Create account" }).click();
  await sheet.getByRole("button", { name: "Start sharing" }).click();
  await expect(sheet).toContainText(/Last sent/, { timeout: 10_000 });
  const path = new URL(await sheet.getByLabel("Live link").inputValue()).pathname;

  // A second tab of the app must not touch the share running in the first.
  const other = await context.newPage();
  await other.goto("/");
  await other.waitForSelector(".leaflet-container");
  await other.waitForTimeout(1000);
  await other.goto(path);
  await expect(other.getByRole("status").first()).toContainText("Live");

  await page.reload();
  await page.waitForSelector(".leaflet-container");
  await page.waitForTimeout(1000);
  await other.reload();
  await expect(other.getByRole("heading", { name: "This trip has ended" })).toBeVisible();
});

test("an unknown live link says so", async ({ page }) => {
  await page.goto("/live/aaaaaaaaaaaaaaaaaaaaaa");
  await expect(page.getByRole("heading", { name: "Live link not found" })).toBeVisible();
});

test("live share sends only new points; offline it keeps them and sends the lot when back online", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await fix(page, 12.9, 77.6, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  for (let i = 1; i <= 3; i++) await fix(page, 12.9 + i * 0.001, 77.6, i, 12);

  const hud = page.locator('section[aria-label="Trip recorder"]');
  await hud.getByRole("button", { name: "Share live location" }).click();
  const sheet = page.getByRole("dialog", { name: "Share live location" });
  await sheet.getByLabel("Email").fill("buffer@test.com");
  await sheet.getByLabel("Password").fill("password123");
  await sheet.getByText("New here? Create an account").click();
  await sheet.getByRole("button", { name: "Create account" }).click();

  // Record every update that reached the server.
  const sent: number[][] = [];
  page.on("requestfinished", (r) => {
    if (!r.url().endsWith("/api/live") || r.method() !== "POST") return;
    const body = r.postDataJSON();
    if (body.action === "update") sent.push(body.points.map((p: number[]) => p[2]));
  });
  await sheet.getByRole("button", { name: "1 hour" }).click();
  await sheet.getByRole("button", { name: "Start sharing" }).click();
  await expect(sheet).toContainText(/Last sent/, { timeout: 10_000 });
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect.poll(() => sent.flat().length).toBe(4);

  // Dead zone: points are recorded but can't go anywhere.
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  for (let i = 4; i <= 9; i++) await fix(page, 12.9 + i * 0.001, 77.6, i, 12);
  sent.length = 0;

  // Back online: the backlog goes straight away (not at the next 20 s tick), and only that.
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => sent.flat().length, { timeout: 5000 }).toBe(6);
  const t0 = sent.flat()[0];
  expect(sent.flat().map((t) => (t - t0) / 1000)).toEqual([0, 1, 2, 3, 4, 5]);

  // Phones say "online" a moment before the connection works: that first try
  // fails, and the next goes within seconds (not at the next 20 s tick).
  sent.length = 0;
  let failNext = true;
  await page.route("**/api/live", (r) => {
    if (failNext && r.request().method() === "POST") {
      failNext = false;
      return r.abort("internetdisconnected");
    }
    return r.fallback();
  });
  for (let i = 10; i <= 12; i++) await fix(page, 12.9 + i * 0.001, 77.6, i, 12);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => failNext).toBe(false);
  await expect.poll(() => sent.flat().length, { timeout: 5000 }).toBe(3);
});
