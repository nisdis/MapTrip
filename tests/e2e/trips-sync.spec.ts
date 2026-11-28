import { execFileSync } from "node:child_process";
import type { Browser, Page } from "@playwright/test";
import { test, expect, fix, hold, hasDb, openMenu, fakeGps, isolate } from "./fixtures";

test.skip(!hasDb, "needs DATABASE_URL (a Postgres for the API)");

test.beforeAll(() => {
  execFileSync("node", ["scripts/migrate.mjs"], { stdio: "ignore" });
  execFileSync(
    "node",
    [
      "-e",
      `const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('truncate follows, blocks, trip_reports, trip_views, profiles, trips, saved_places, session, account, verification, "user" cascade').then(()=>p.end())`,
    ],
    { stdio: "inherit" },
  );
});

const place = (id: number, name: string, lat: number, lon: number) => ({
  osm_type: "node", osm_id: id, place_id: id, lat: String(lat), lon: String(lon), name,
  display_name: `${name}, Kyoto, Japan`, category: "place", type: "station", importance: 0.5,
  address: { city: "Kyoto", country_code: "jp" }, namedetails: { name },
});

/** A phone: its own storage, no outside servers except the stand-ins below. */
async function device(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  await isolate(ctx);
  await fakeGps(ctx);
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await ctx.route(/nominatim\.openstreetmap\.org\/search/, (r) =>
    r.fulfill({ json: r.request().url().includes("Gion") ? [place(2, "Gion", 35.0037, 135.7788)] : [place(1, "Kyoto Station", 34.9858, 135.7588)] }),
  );
  await ctx.route(/router\.project-osrm\.org\/route\/v1\/driving\//, (r) =>
    r.fulfill({
      json: {
        code: "Ok",
        routes: [{ geometry: "_mntEoexaY_sB_sB", legs: [{ steps: [], summary: "", distance: 3000, duration: 540 }], distance: 3000, duration: 540 }],
        waypoints: [{ location: [135.7588, 34.9858], name: "" }, { location: [135.7788, 35.0037], name: "" }],
      },
    }),
  );
  const page = await ctx.newPage();
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  return page;
}

async function signIn(page: Page, mode: "signup" | "signin", email = "two@test.com") {
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  if (mode === "signup") await page.getByText("New here? Create an account").click();
  await page.getByRole("button", { name: mode === "signup" ? "Create account" : "Sign in", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Account", exact: true })).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");
}

async function record(page: Page, name: string, lat0: number) {
  await fix(page, lat0, 135.76, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  for (let i = 1; i <= 6; i++) await fix(page, lat0 + i * 0.001, 135.76, i, 10);
  await hold(page, 'button[aria-label^="Finish trip"]');
  await page.fill("#trip-name", name);
  await page.getByRole("button", { name: "Save trip" }).click();
  // The saved trip opens with its replay; close it to record the next one.
  await page.getByRole("button", { name: "Close trip" }).click();
}

/** The Trips list's text (opens and closes the panel). */
async function tripsText(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("online"))); // nudge a sync
  await openMenu(page, "Trips");
  await page.waitForTimeout(300);
  const text = await page.locator(".overflow-y-auto").last().innerText();
  await page.locator('button[aria-label="Close"]').first().click();
  return text;
}

test("trips follow the account to every device; delete is everywhere; sign-out clears them", async ({ browser }) => {
  const a = await device(browser);
  await signIn(a, "signup");
  await record(a, "Kyoto loop", 34.98);
  await record(a, "Second ride", 34.9);
  await expect.poll(() => tripsText(a), { timeout: 15_000 }).toContain("All trips are backed up");

  // Another phone, same account: both trips are there, from the account.
  const b = await device(browser);
  await signIn(b, "signin");
  await expect.poll(() => tripsText(b), { timeout: 15_000 }).toContain("Kyoto loop");
  expect(await tripsText(b)).toContain("From another device");

  // Opening one downloads it: its route is drawn.
  await openMenu(b, "Trips");
  await b.getByRole("button", { name: /^Kyoto loop/ }).click();
  await expect(b.locator(".leaflet-overlay-pane path")).not.toHaveCount(0);

  // Deleting asks where. This phone only: it stays in the account and comes back as a summary.
  await openMenu(b, "Trips");
  await b.locator("li", { hasText: "Kyoto loop" }).getByRole("button", { name: "Delete trip" }).click();
  await b.getByRole("dialog", { name: "Delete trip" }).getByRole("button", { name: /This phone only/ }).click();
  await b.locator('button[aria-label="Close"]').first().click();
  await expect.poll(() => tripsText(b), { timeout: 15_000 }).toMatch(/Kyoto loop[\s\S]*From another device/);

  // Everywhere: gone from the account and the other phone.
  await openMenu(b, "Trips");
  await b.locator("li", { hasText: "Kyoto loop" }).getByRole("button", { name: "Delete trip" }).click();
  await b.getByRole("dialog", { name: "Delete trip" }).getByRole("button", { name: /Everywhere/ }).click();
  await b.locator('button[aria-label="Close"]').first().click();
  await expect.poll(() => tripsText(a), { timeout: 15_000 }).not.toContain("Kyoto loop");
  expect(await tripsText(a)).toContain("Second ride");

  // Signing out: the account's trips leave this phone.
  await b.getByRole("button", { name: "Account", exact: true }).click();
  await b.getByRole("button", { name: /Sign out/ }).first().click();
  await expect.poll(() => tripsText(b), { timeout: 10_000 }).not.toContain("Second ride");
});

test("Directions: Save route puts it in Saved › Routes (not Trips), on every device", async ({ browser }) => {
  const a = await device(browser);
  await signIn(a, "signup", "routes@test.com");
  await openMenu(a, "Directions");
  await a.getByPlaceholder("Enter starting point").fill("Kyoto Station");
  await a.getByRole("button", { name: /Kyoto Station/ }).first().click();
  await a.getByPlaceholder("Enter destination").fill("Gion");
  await a.getByRole("button", { name: /^Gion/ }).first().click();
  await a.getByRole("radiogroup", { name: "Travel mode" }).getByRole("radio", { name: "Car" }).click();
  await a.getByRole("button", { name: "Show route" }).click();
  await expect(a.locator(".leaflet-overlay-pane path")).not.toHaveCount(0);
  const bar = a.getByRole("region", { name: "Route" });
  await bar.getByRole("button", { name: "Save route" }).click();
  await expect(bar.getByRole("button", { name: "Route saved" })).toBeVisible();
  expect(await tripsText(a)).not.toContain("Gion");

  const b = await device(browser);
  await signIn(b, "signin", "routes@test.com");
  const savedText = async () => {
    await openMenu(b, "Saved");
    await b.getByRole("tab", { name: /Routes/ }).click();
    const t = await b.locator(".overflow-y-auto").last().innerText();
    await b.locator('button[aria-label="Close"]').first().click();
    return t;
  };
  await expect.poll(savedText, { timeout: 15_000 }).toContain("Kyoto Station → Gion");
  expect(await savedText()).toMatch(/Car · 3\.0 km · 9 min/);

  // Opening it fills Directions in, with the route drawn.
  await openMenu(b, "Saved");
  await b.getByRole("tab", { name: /Routes/ }).click();
  await b.getByRole("button", { name: /^Kyoto Station → Gion/ }).click();
  await expect(b.getByPlaceholder("Enter destination")).toHaveValue("Gion");
  await expect(b.getByPlaceholder("Enter starting point")).toHaveValue("Kyoto Station");
  await expect(b.locator(".leaflet-overlay-pane path")).not.toHaveCount(0);
});

test("a planned trip already on the phone (older version) moves to Saved › Routes", async ({ browser }) => {
  const page = await device(browser);
  // Put one in this phone's storage the way older versions did.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("record-my-trip");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("trips", "readwrite");
          const end = (name: string, lat: number) => ({ id: 3, name, displayName: name, location: [lat, 135.76], type: "x", importance: 1 });
          const id = "5d0c4a52-8a3e-4c1e-9f55-0a1b2c3d4e5f";
          tx.objectStore("trips").put(
            { id, name: "Old plan to Gion", kind: "planned", createdAt: 1, origin: end("Station", 34.98), destination: end("Gion", 35.0), distanceM: 0, durationS: 0 },
            id,
          );
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await page.waitForSelector(".leaflet-container");
  await expect.poll(async () => {
    await openMenu(page, "Saved");
    await page.getByRole("tab", { name: /Routes/ }).click();
    const t = await page.locator(".overflow-y-auto").last().innerText();
    await page.locator('button[aria-label="Close"]').first().click();
    return t;
  }, { timeout: 10_000 }).toContain("Old plan to Gion");
  expect(await tripsText(page)).not.toContain("Old plan to Gion");
});

test("renaming a trip: on the open trip and in the list; the other device gets it", async ({ browser }) => {
  const a = await device(browser);
  const b = await device(browser);
  await signIn(a, "signup", "rename@test.com");
  await signIn(b, "signin", "rename@test.com");
  await record(a, "First name", 35.1);
  await expect.poll(() => tripsText(b), { timeout: 20_000 }).toContain("First name");

  // On the open trip: pencil, type, Enter. Esc cancels.
  await openMenu(a, "Trips");
  await a.getByRole("button", { name: /First name/ }).first().click();
  const panel = a.getByRole("region", { name: "Trip" });
  await panel.getByRole("button", { name: "Rename trip" }).click();
  await panel.getByLabel("Trip name").fill("Discarded");
  await panel.getByLabel("Trip name").press("Escape");
  await expect(panel.getByRole("heading", { name: "First name" })).toBeVisible();
  await panel.getByRole("button", { name: "Rename trip" }).click();
  await panel.getByLabel("Trip name").fill("   ");
  await panel.getByLabel("Trip name").press("Enter");
  await expect(panel.getByRole("alert")).toHaveText("Give the trip a name");
  await panel.getByLabel("Trip name").fill("  Hill   loop ");
  await panel.getByLabel("Trip name").press("Enter");
  await expect(panel.getByRole("heading", { name: "Hill loop" })).toBeVisible();
  await expect.poll(() => tripsText(b), { timeout: 20_000 }).toContain("Hill loop");

  // From the list on the other device, where it is only a summary (never opened there).
  await openMenu(b, "Trips");
  await b.getByRole("button", { name: "Rename Hill loop" }).click();
  await b.getByLabel("Trip name").fill("Sunday hill loop");
  await b.getByRole("button", { name: "Save name" }).click();
  await expect(b.getByText("Sunday hill loop")).toBeVisible();
  await b.locator('button[aria-label="Close"]').first().click();
  await expect.poll(() => tripsText(a), { timeout: 20_000 }).toContain("Sunday hill loop");
  // Still renamed after a reload.
  await a.reload();
  await a.waitForSelector(".leaflet-container");
  expect(await tripsText(a)).toContain("Sunday hill loop");
});
