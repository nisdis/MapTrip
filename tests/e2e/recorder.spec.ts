import { test, expect, fix, hold } from "./fixtures";

const STEP = 0.0012; // ~180 m diagonal per fix

test("records a trip: live HUD, pause, hold-to-finish, draft recovery, save", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await fix(page, 12.97, 77.6, 0, 0, 12);
  await page.getByRole("button", { name: "Record a trip" }).click();
  const hud = page.locator('section[aria-label="Trip recorder"]');
  await expect(hud).toBeVisible();
  await expect(page.getByRole("button", { name: "Search", exact: true })).toHaveCount(0); // nav hidden

  const legs: [number, number][] = [[3, 12], [8, 20], [14, 35], [20, 48], [25, 60], [28, 75], [18, 70]];
  for (const [i, [spd, alt]] of legs.entries()) await fix(page, 12.97 + (i + 1) * STEP, 77.6 + (i + 1) * STEP, i + 1, spd, alt);
  await expect(hud).toContainText("Distance");
  await expect(hud).toContainText(/1\.(29|30)/); // ~1.3 km over 7 diagonal steps
  await expect(hud).toContainText("Keep the screen on");

  await hud.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(hud).toContainText("Paused");
  await fix(page, 19.2, 72.9, 20, 25, 80); // moved far while paused: must not count
  await hud.getByRole("button", { name: "Resume", exact: true }).click();
  for (let k = 1; k <= 3; k++) await fix(page, 19.21 + k * 0.001, 72.9 + k * 0.001, 20 + k, 10, 90);

  // a short press must not finish the trip
  await hold(page, 'button[aria-label^="Finish trip"]', 300);
  await expect(hud).toBeVisible();

  // closing the tab mid-trip keeps a draft
  await page.waitForTimeout(4500); // drafts save at most every 4 s
  await fix(page, 19.214, 72.904, 25, 10, 90);
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector(".leaflet-container");
  await expect(page.getByText("You have an unfinished trip")).toBeVisible();
  await page.getByRole("button", { name: "Review and save" }).click();
  const summary = page.locator('section[aria-label="Trip summary"]');
  await expect(summary).toContainText("Trip finished");
  await page.fill("#trip-name", "E2E run");
  await page.getByRole("button", { name: "Save trip" }).click();
  await page.getByRole("button", { name: "Trips", exact: true }).click();
  await expect(page.locator("li").first()).toContainText("E2E run");
  await expect(page.locator("li").first()).not.toContainText("incl. estimate"); // pause isn't a gap
});

test("screen-off gaps are drawn dashed and counted as an estimate; pocket mode", async ({ page }) => {
  let routeCalls = 0;
  await page.route(/router\.project-osrm\.org\/route.*geojson/, (r) => {
    routeCalls++;
    return r.fulfill({
      json: { code: "Ok", routes: [{ distance: 2500, geometry: { coordinates: [[77.6, 12.9755], [77.605, 12.985], [77.6, 12.9955]] } }] },
    });
  });
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  const M = 1 / 111320;
  let lat = 12.97;
  let t = 0;
  const go = async (meters: number, dt: number, speed: number | null = 10) => {
    lat += meters * M;
    t += dt;
    await fix(page, lat, 77.6, t, speed);
    await page.waitForTimeout(80);
  };
  await go(0, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  const hud = page.locator('section[aria-label="Trip recorder"]');
  for (let i = 0; i < 5; i++) await go(10, 1);
  for (let i = 0; i < 20; i++) await go(0, 1, 0); // standing still: fixes keep coming
  for (let i = 0; i < 6; i++) await go(10, 1);
  expect(routeCalls).toBe(0); // standing still is not a gap

  await go(2000, 120); // 2 min of silence, then 2 km further on
  for (let i = 0; i < 3; i++) await go(10, 1);
  await expect(hud).toContainText("Tracking paused");
  await expect(hud).toContainText("Filled with an estimated road route");
  await expect(hud).toContainText("incl. 2.50 est.");
  expect(routeCalls).toBe(1);
  await expect(page.locator('path[stroke-dasharray="2 10"]')).toHaveCount(1);

  await hud.getByRole("button", { name: /pocket mode/i }).click();
  const pocket = page.locator('[role=dialog][aria-label^="Pocket mode"]');
  await expect(pocket).toBeVisible();
  await pocket.click({ position: { x: 100, y: 300 } }); // quick tap: stays on
  await expect(pocket).toBeVisible();
  await go(100, 1);
  await expect(pocket).toContainText("2.74 km"); // still recording underneath
  await hold(page, '[role=dialog][aria-label^="Pocket mode"]', 1200);
  await expect(pocket).toHaveCount(0);

  await hold(page, 'button[aria-label^="Finish trip"]');
  await expect(page.locator('section[aria-label="Trip summary"]')).toContainText("Includes 2.50 km estimated");
});

test("a gap on a train is a straight line, not a road; the summary can switch it", async ({ page }) => {
  await page.route(/router\.project-osrm\.org\/route.*geojson/, (r) =>
    r.fulfill({
      json: { code: "Ok", routes: [{ distance: 2500, geometry: { coordinates: [[77.6, 12.9755], [77.605, 12.985], [77.6, 12.9955]] } }] },
    }),
  );
  // Both ends of the gap are next to a railway line.
  let overpass = "";
  await page.route(/overpass-api\.de\/api\/interpreter/, (r) => {
    overpass = decodeURIComponent(r.request().url());
    return r.fulfill({ json: { elements: [{ type: "count", tags: { ways: "2" } }, { type: "count", tags: { ways: "1" } }] } });
  });
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  const M = 1 / 111320;
  let lat = 12.97;
  let t = 0;
  const go = async (meters: number, dt: number) => {
    lat += meters * M;
    t += dt;
    await fix(page, lat, 77.6, t, 10);
    await page.waitForTimeout(80);
  };
  await go(0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  const hud = page.locator('section[aria-label="Trip recorder"]');
  for (let i = 0; i < 5; i++) await go(10, 1);
  await go(2000, 120);
  for (let i = 0; i < 3; i++) await go(10, 1);
  await expect(hud).toContainText("Looks like a train");
  await expect(hud).toContainText("incl. 2.00 est."); // the straight line, not the 2.5 km road
  expect(overpass).toContain('railway~"^(rail|subway');

  await hold(page, 'button[aria-label^="Finish trip"]');
  const summary = page.locator('section[aria-label="Trip summary"]');
  const gaps = summary.getByRole("list", { name: "Stretches without GPS" });
  await expect(gaps).toContainText("Looks like a train: straight line");
  await expect(summary).toContainText("Includes 2.00 km estimated");
  // It was actually a road: switch it.
  await gaps.getByRole("button", { name: "Road" }).click();
  await expect(summary).toContainText("Includes 2.50 km estimated");
  await expect(gaps).toContainText("Filled with the road route");
  // Tapping the gap on the map selects it in the list.
  await gaps.getByRole("button", { name: "Straight" }).click();
  await expect(summary).toContainText("Includes 2.00 km estimated");
});
