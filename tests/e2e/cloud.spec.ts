import { execFileSync } from "node:child_process";
import { test, expect, fix, hold, hasDb, openMenu } from "./fixtures";

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

async function signUpFromSheet(page: import("@playwright/test").Page, email: string, mode: "signup" | "signin") {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  if (mode === "signup") await page.getByText("New here? Create an account").click();
  await page.getByRole("button", { name: mode === "signup" ? "Create account" : "Sign in", exact: true }).last().click();
}

test("record a trip, sign up from Save to cloud, and it saves", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await fix(page, 12.97, 77.87, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  await page.mouse.click(195, 230);
  await expect(page.locator('[role=dialog][aria-label="Place details"]')).toHaveCount(0); // taps ignored while recording
  for (let i = 1; i <= 5; i++) await fix(page, 12.97 + i * 0.001, 77.87 + i * 0.001, i, 10 + i);
  await hold(page, 'button[aria-label^="Finish trip"]');
  await page.fill("#trip-name", "Cloud run");
  await page.getByRole("button", { name: "Save trip" }).click();
  await openMenu(page, "Trips");
  await page.getByText("Save to cloud").click();
  await expect(page.getByText(/to save “Cloud run” to the cloud/)).toBeVisible();
  await signUpFromSheet(page, "cloud@test.com", "signup");
  await expect(page.getByText("Saved to cloud")).toBeVisible({ timeout: 10_000 });
});

test("favourites sync between two devices, deletions too", async ({ browser }) => {
  const poi = { osm_type: "node", osm_id: 42, place_id: 1, lat: "12.97", lon: "77.6", name: "Sync Cafe", category: "amenity", type: "cafe", address: { road: "MG Road", country_code: "in" }, extratags: {}, namedetails: { name: "Sync Cafe" } };
  const device = async () => {
    const ctx = await browser.newContext();
    await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
    await ctx.route(/nominatim\.openstreetmap\.org\/(reverse|lookup)/, (r) =>
      r.fulfill({ json: r.request().url().includes("/lookup") ? [poi] : poi }),
    );
    return ctx.newPage();
  };
  const savedTab = async (p: import("@playwright/test").Page) => {
    await openMenu(p, "Saved");
    const text = await p.locator(".overflow-y-auto").last().innerText();
    await p.locator('button[aria-label="Close"]').first().click();
    return text;
  };

  const a = await device();
  await a.goto("/?place=12.97,77.6");
  await a.locator('[role=dialog]').getByRole("button", { name: "Save", exact: true }).click();
  await a.locator('[role=dialog]').getByRole("button", { name: "Close place details" }).click();
  await a.getByRole("button", { name: "Sign in", exact: true }).click();
  await signUpFromSheet(a, "sync@test.com", "signup");
  await expect.poll(async () => savedTab(a), { timeout: 10_000 }).toContain("Synced to your account");

  const b = await device();
  await b.goto("/");
  await b.waitForSelector(".leaflet-container");
  await b.getByRole("button", { name: "Sign in", exact: true }).click();
  await signUpFromSheet(b, "sync@test.com", "signin");
  await expect.poll(async () => savedTab(b), { timeout: 10_000 }).toContain("Sync Cafe");

  await openMenu(b, "Saved");
  await b.getByRole("button", { name: /Remove Sync Cafe from Favourites/ }).click();
  await b.waitForTimeout(2500);
  await b.locator('button[aria-label="Close"]').first().click();
  await a.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => savedTab(a), { timeout: 10_000 }).toContain("No favourites yet");
});

test("delete my account: needs the password; afterwards signed out", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await signUpFromSheet(page, "leaving@test.com", "signup");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0, { timeout: 10_000 });
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Delete my account" }).click();
  const form = page.getByRole("form", { name: "Delete account" });
  await expect(form).toContainText("can't be undone");
  await form.getByLabel("Your password").fill("not-my-password");
  await form.getByRole("button", { name: "Delete forever" }).click();
  await expect(form.getByRole("alert")).toContainText("That password isn't right");
  await form.getByLabel("Your password").fill("password123");
  await form.getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Account deleted" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  // The account really is gone: signing in fails.
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await signUpFromSheet(page, "leaving@test.com", "signin");
  await expect(page.getByRole("alert")).toBeVisible();
});
