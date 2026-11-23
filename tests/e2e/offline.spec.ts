import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test as base } from "@playwright/test";
import { test, expect, fix, hold, hasDb, isolate } from "./fixtures";

const truncate = () =>
  execFileSync(
    "node",
    [
      "-e",
      `const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('truncate follows, blocks, trip_reports, trip_views, profiles, live_shares, trips, saved_places, session, account, verification, "user" cascade').then(()=>p.end())`,
    ],
    { stdio: "inherit" },
  );

async function recordAndSave(page: import("@playwright/test").Page, name: string) {
  await fix(page, 12.97, 77.6, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  for (let i = 1; i <= 6; i++) await fix(page, 12.97 + i * 0.001, 77.6, i * 10, 11, 900 + i);
  await hold(page, 'button[aria-label^="Finish trip"]');
  await page.fill("#trip-name", name);
  await page.getByRole("button", { name: "Save trip" }).click();
}

test.describe("offline, then back online", () => {
  test.skip(!hasDb, "needs DATABASE_URL (a Postgres for the API)");
  test.beforeAll(() => {
    execFileSync("node", ["scripts/migrate.mjs"], { stdio: "ignore" });
    truncate();
  });

  test("record and save offline; it backs up by itself when the connection returns", async ({ page, context }) => {
    await page.goto("/");
    await page.waitForSelector(".leaflet-container");
    // Signed in (auto backup is for signed-in people).
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Email").fill("offline@test.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByText("New here? Create an account").click();
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    // Signed in: the header's "Sign in" button is gone.
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0, { timeout: 10_000 });

    await context.setOffline(true);
    await expect(page.getByRole("status").filter({ hasText: "You're offline" })).toBeVisible();
    await recordAndSave(page, "Tunnel ride");

    await page.getByRole("button", { name: "Trips", exact: true }).click();
    await expect(page.getByText("1 trip will back up when you're online.")).toBeVisible();
    await expect(page.locator("li").filter({ hasText: "Tunnel ride" })).not.toContainText("Saved to cloud");

    await context.setOffline(false);
    await expect(page.getByText("All trips are backed up to your account (private).")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("li").filter({ hasText: "Tunnel ride" })).toContainText("Saved to cloud");
    await expect(page.getByRole("status").filter({ hasText: "You're offline" })).toHaveCount(0);
  });
});

test("GPX: export a trip, import the file back as an 'Imported' trip", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await recordAndSave(page, "Ride to export");
  await page.getByRole("button", { name: "Trips", exact: true }).click();

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Ride to export as GPX" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("Ride-to-export.gpx");
  const path = await download.path();
  const xml = readFileSync(path!, "utf8");
  expect(xml).toContain("<name>Ride to export</name>");
  expect(xml.match(/<trkpt /g)!.length).toBeGreaterThanOrEqual(6);

  await page.getByLabel("Import a GPX file").setInputFiles({ name: "ride.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from(xml) });
  // It's shown on the map; in the list it's marked as imported.
  await page.getByRole("button", { name: "Trips", exact: true }).click();
  const items = page.locator("li").filter({ hasText: "Ride to export" });
  await expect(items).toHaveCount(2);
  await expect(items.filter({ hasText: "Imported" })).toHaveCount(1);

  await page.getByLabel("Import a GPX file").setInputFiles({ name: "bad.gpx", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByText("That file isn't valid GPX.")).toBeVisible();
});

// The service worker on, and the tile server played by the test.
const withSw = base.extend({
  context: async ({ context }, use) => {
    await isolate(context);
    await use(context);
  },
});
withSw.use({ serviceWorkers: "allow" });

withSw("save an area: its map tiles are served offline, even after the map data version changes", async ({ page, context }) => {
  const tile = Buffer.from("fake-vector-tile");
  await context.route("https://tiles.openfreemap.org/planet", (r) =>
    r.fulfill({ json: { tilejson: "3.0.0", tiles: ["https://tiles.openfreemap.org/planet/v1/{z}/{x}/{y}.pbf"] } }),
  );
  await context.route(/tiles\.openfreemap\.org\/planet\/v1\/\d+\/\d+\/\d+\.pbf/, (r) =>
    r.fulfill({ body: tile, contentType: "application/x-protobuf" }),
  );
  await context.route(/tiles\.openfreemap\.org\/(styles|fonts|sprites)/, (r) => r.fulfill({ body: "{}", contentType: "application/json" }));
  await context.route(/nominatim\.openstreetmap\.org\/reverse/, (r) => r.fulfill({ json: { address: { city: "Testville" } } }));

  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 15_000 }).catch(async () => {
    await page.reload(); // first load installs it; the next is controlled
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 });
  await page.waitForSelector(".leaflet-container");
  // A small area so the test is quick.
  for (let i = 0; i < 4; i++) await page.locator('button[aria-label="Zoom in"]').click().catch(() => undefined);

  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Offline maps" }).click();
  await expect(page.getByLabel("Area name")).toHaveValue("Testville");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved “Testville”" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /^Testville/ })).toBeVisible();

  // Offline, with a newer map version in the address: still served from the saved area.
  const { z, x, y } = await page.evaluate(async () => {
    const keys = await (await caches.open("saved-areas")).keys();
    const m = keys[keys.length - 1].url.match(/\/(\d+)\/(\d+)\/(\d+)\.pbf$/)!;
    return { z: m[1], x: m[2], y: m[3] };
  });
  await context.setOffline(true);
  const body = await page.evaluate(
    async (u) => {
      const r = await fetch(u);
      return r.ok ? await r.text() : `status ${r.status}`;
    },
    `https://tiles.openfreemap.org/planet/v2-newer/${z}/${x}/${y}.pbf`,
  );
  expect(body).toBe("fake-vector-tile");
  await context.setOffline(false);

  // Removing the area removes its tiles.
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remove Testville" }).click();
  await expect(page.getByText("None yet.")).toBeVisible();
  expect(await page.evaluate(async () => (await (await caches.open("saved-areas")).keys()).length)).toBe(0);
});
