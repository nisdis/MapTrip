import { test, expect, fix, hold, openMenu } from "./fixtures";

test("explored map: squares from your trips, counted by country and region, fog on the map", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  // A ~3 km trip north through central Kyoto.
  await fix(page, 34.99, 135.76, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  for (let i = 1; i <= 30; i++) await fix(page, 34.99 + i * 0.001, 135.76, i * 10, 11);
  await hold(page, 'button[aria-label^="Finish trip"]');
  await page.fill("#trip-name", "Kyoto north");
  await page.getByRole("button", { name: "Save trip" }).click();

  await openMenu(page, "Explored map");
  const stats = page.getByLabel("Explored", { exact: true });
  await expect(stats).toContainText("Countries", { timeout: 15_000 });
  const n = async (label: string) =>
    Number((await stats.locator("div", { hasText: label }).locator("dd").first().innerText()).replace(/,/g, ""));
  expect(await n("Squares")).toBeGreaterThanOrEqual(3);
  expect(await n("Squares")).toBeLessThanOrEqual(6);
  expect(await n("Countries")).toBe(1);
  expect(await n("Regions")).toBe(1);
  await page.getByRole("list", { name: "Countries" }).getByRole("button", { name: /Japan/ }).click();
  await expect(page.getByRole("list", { name: "Countries" })).toContainText("Kyōto");
  await expect(page.getByText("Only you can see this")).toBeVisible();

  // On the map: the fog, with the bar to close it.
  await page.getByRole("button", { name: "Show on map" }).click();
  await expect(page.locator(".leaflet-overlay-pane canvas.leaflet-tile").first()).toBeAttached();
  const bar = page.getByRole("region", { name: "Explored map" });
  await expect(bar).toContainText("1 country · 1 region");
  await bar.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".leaflet-overlay-pane canvas.leaflet-tile")).toHaveCount(0);
});
