import { readFileSync, writeFileSync } from "node:fs";
import { test, expect, fix, hold } from "./fixtures";

const SW = "dist/sw.js";

test.use({ serviceWorkers: "allow" });

// dist/sw.js is changed to play a new build; put it back whatever happens.
let original = "";
test.beforeAll(() => {
  original = readFileSync(SW, "utf8");
});
test.afterAll(() => writeFileSync(SW, original));

// A new build of the app reaches people who keep it open, but never interrupts a trip.
test("new version: waits for the trip to end, then offers a reload", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __swChanged: number };
    w.__swChanged = 0;
    navigator.serviceWorker?.addEventListener("controllerchange", () => w.__swChanged++);
  });

  await page.goto("/");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 }).catch(() => page.reload());
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 });
  await page.waitForSelector(".leaflet-container");
  const banner = page.getByRole("status").filter({ hasText: "A new version of the app is ready" });

  // Recording when the new build arrives: no banner, no reload.
  await fix(page, 12.97, 77.6, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  await fix(page, 12.971, 77.601, 1, 5);
  const before = await page.evaluate(() => (window as unknown as { __swChanged: number }).__swChanged);
  writeFileSync(SW, `${original}\n// next build`); // the "new build"
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
  await page.waitForFunction((n) => (window as unknown as { __swChanged: number }).__swChanged > n, before, { timeout: 15_000 });
  await page.waitForTimeout(500);
  await expect(banner).toHaveCount(0);
  await expect(page.locator('section[aria-label="Trip recorder"]')).toBeVisible();

  // Still on the summary: still no banner.
  await hold(page, 'button[aria-label^="Finish trip"]');
  await expect(page.getByRole("button", { name: "Discard" })).toBeVisible();
  await expect(banner).toHaveCount(0);

  // Trip done: the banner offers the new version; Reload loads it.
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(banner).toBeVisible();
  await Promise.all([page.waitForEvent("load"), banner.getByRole("button", { name: "Reload" }).click()]);
  await page.waitForSelector(".leaflet-container");
  await expect(banner).toHaveCount(0);
});

test("menu: Check for updates says up to date, then finds a new build and reloads into it", async ({ page }) => {
  writeFileSync(SW, original);
  await page.goto("/");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 }).catch(() => page.reload());
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 });
  await page.waitForSelector(".leaflet-container");

  const menu = page.getByRole("navigation", { name: "Menu" });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(menu).toContainText(/Version \S+/);
  await menu.getByRole("button", { name: "Check for updates" }).click();
  await expect(menu).toContainText("You have the latest version.");

  writeFileSync(SW, `${original}\n// another build`);
  await menu.getByRole("button", { name: "Check for updates" }).click();
  const reload = menu.getByRole("button", { name: "Reload to update" });
  await expect(reload).toBeVisible({ timeout: 15_000 });
  await Promise.all([page.waitForEvent("load"), reload.click()]);
  await page.waitForSelector(".leaflet-container");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(menu.getByRole("button", { name: "Check for updates" })).toBeVisible();
});
