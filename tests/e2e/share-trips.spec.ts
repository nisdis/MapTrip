import { execFileSync } from "node:child_process";
import { test, expect, fix, hold, hasDb, isolate, openMenu } from "./fixtures";

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

test("share a trip: private by default, public with a name, ends hidden, in Explore, reportable", async ({ page, browser }) => {
  // Record ~3.3 km heading north, save it, save it to the cloud (signing up).
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await fix(page, 12.97, 77.6, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  for (let i = 1; i <= 30; i++) await fix(page, 12.97 + i * 0.001, 77.6, i * 10, 11);
  await hold(page, 'button[aria-label^="Finish trip"]');
  await page.fill("#trip-name", "River loop");
  await page.getByRole("button", { name: "Save trip" }).click();
  await openMenu(page, "Trips");
  await page.getByText("Save to cloud").click();
  await page.getByLabel("Email").fill("sharer@test.com");
  await page.getByLabel("Password").fill("password123");
  await page.getByText("New here? Create an account").click();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("Saved to cloud")).toBeVisible({ timeout: 10_000 });

  // Share sheet: starts private.
  await page.getByRole("button", { name: "Share River loop" }).click();
  const sheet = page.getByRole("dialog", { name: "Share trip" });
  await expect(sheet.getByRole("button", { name: /Private/ })).toHaveAttribute("aria-pressed", "true");

  // Public: start/end hidden by 500 m unless changed; "Off" warns.
  await sheet.getByRole("button", { name: /Public/ }).click();
  await expect(sheet.getByRole("button", { name: "500 m" })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Off" }).click();
  await expect(sheet.getByRole("alert")).toContainText("exactly where this trip started and ended");
  await sheet.getByRole("button", { name: "500 m" }).click();

  // A public name is needed first (not the email).
  await sheet.getByPlaceholder("e.g. Nissim D").fill("River Rider");
  await sheet.getByRole("button", { name: "Save and get link" }).click();
  await expect(sheet.getByRole("status")).toContainText("Share the link");
  const link = await sheet.getByLabel("Trip link").inputValue();
  expect(link).toMatch(/\/t\/[0-9a-f-]{36}$/);
  await sheet.getByRole("button", { name: "Close" }).click();

  // Someone else opens the link: name, author, stats; the ends aren't shown.
  const ctx = await browser.newContext();
  await isolate(ctx);
  const viewer = await ctx.newPage();
  await viewer.goto(new URL(link).pathname);
  const info = viewer.locator('section[aria-label="Trip"]');
  await expect(info).toContainText("River loop");
  await expect(info).toContainText("by River Rider");
  await expect(info).toContainText("3.3");
  await expect(info).toContainText("The first and last 500 m aren't shown");
  await expect(info).not.toContainText("sharer@");
  await expect(viewer.locator(".leaflet-overlay-pane path")).not.toHaveCount(0);

  // Reporting needs an account.
  await info.getByRole("button", { name: "Report" }).click();
  const report = viewer.getByRole("dialog", { name: "Report this trip" });
  await expect(report).toContainText("to report this trip");
  await report.getByRole("button", { name: "Close" }).click();

  // Explore, from the chip on the map: listed for this area.
  await page.locator('button[aria-label="Close"]').first().click(); // the Trips sheet
  const chip = page.getByRole("button", { name: "Explore", exact: true });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  const item = page.getByRole("button", { name: /River loop/ });
  await expect(item).toBeVisible({ timeout: 10_000 });
  await expect(item).toContainText("River Rider");

  // Picking it shows it on the map with a card above the bottom navigation.
  await item.click();
  const card = page.getByRole("region", { name: "Selected trip" });
  await expect(card).toContainText("River loop");
  await expect(page.getByRole("button", { name: "Search this area" })).toHaveCount(0); // the app moved the map, not you
  const cardBox = (await card.boundingBox())!;
  const navBox = (await page.getByRole("button", { name: "Record a trip" }).boundingBox())!;
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(navBox.y);
  // "All trips here" brings the list back; picking again and opening goes to the trip page.
  await card.getByRole("button", { name: "All trips here" }).click();
  await page.getByRole("button", { name: /River loop/ }).click();
  await card.getByRole("button", { name: "Open trip" }).click();
  await expect(page).toHaveURL(/\/t\/[0-9a-f-]{36}$/);
  await expect(page.locator('section[aria-label="Trip"]')).toContainText("River loop");
  await page.goBack();
  await page.waitForSelector(".leaflet-container");

  // Back to private: the link stops working.
  await openMenu(page, "Trips");
  await page.getByRole("button", { name: "Share River loop" }).click();
  await sheet.getByRole("button", { name: /Private/ }).click();
  await sheet.getByRole("button", { name: "Make private" }).click();
  await expect(sheet.getByRole("status")).toContainText("Only you");
  await viewer.reload();
  await expect(viewer.getByRole("heading", { name: "This trip isn't shared" })).toBeVisible();
  await ctx.close();
});
