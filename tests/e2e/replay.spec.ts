import { execFileSync } from "node:child_process";
import { test, expect, fix, hold, hasDb, isolate } from "./fixtures";

test("an opened trip shows its totals, and replays with live figures", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await fix(page, 12.97, 77.6, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  for (let i = 1; i <= 6; i++) await fix(page, 12.97 + i * 0.001, 77.6, i * 10, 11, 900 + i * 5);
  await hold(page, 'button[aria-label^="Finish trip"]');
  await page.fill("#trip-name", "Replay ride");
  await page.getByRole("button", { name: "Save trip" }).click();

  // Saved: the trip stays open with its totals; the Record button makes room.
  const panel = page.getByRole("region", { name: "Trip" });
  await expect(panel.getByRole("heading", { name: "Replay ride" })).toBeVisible();
  await expect(panel).toContainText("Distance");
  await expect(panel).toContainText("Climbed");
  await expect(page.getByRole("button", { name: "Record a trip" })).toHaveCount(0);

  // The graph is the slider: jump to the end, then the start.
  const slider = panel.getByRole("slider", { name: "Replay position" });
  await slider.focus();
  await page.keyboard.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", "0:01:00");
  await expect(panel).toContainText("Altitude");
  await expect(panel).toContainText("930"); // altitude at the end
  await expect(panel).toContainText("0.67"); // km at the end (6 × ~111 m)
  await expect(page.locator(".replay-dot")).toHaveCount(1);
  await page.keyboard.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", "0:00:00");

  // A one-minute trip plays in real time; faster on request.
  const rate = panel.getByRole("button", { name: /^Replay speed/ });
  await expect(rate).toHaveText("1×");
  await rate.click();
  await expect(rate).toHaveText("5×");
  await panel.getByRole("button", { name: "Replay trip" }).click();
  await expect(panel.getByRole("button", { name: "Pause replay" })).toBeVisible();
  await expect.poll(async () => Number(await slider.getAttribute("aria-valuenow"))).toBeGreaterThan(2);
  // At 5× it reaches the end in about 12 s.
  await expect(panel.getByRole("button", { name: "Replay again" })).toBeVisible({ timeout: 20_000 });
  await expect(slider).toHaveAttribute("aria-valuetext", "0:01:00");

  // Dragging the map stops following; the button brings it back.
  const map = page.locator(".leaflet-container");
  const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + 220, { steps: 5 });
  await page.mouse.up();
  await expect(panel.getByRole("button", { name: "Follow the replay on the map" })).toBeVisible();

  await panel.getByRole("button", { name: "Close trip" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record a trip" })).toBeVisible();
});

test.describe("shared trip page", () => {
  test.skip(!hasDb, "needs DATABASE_URL (a Postgres for the API)");
  test.beforeAll(() => {
    execFileSync("node", ["scripts/migrate.mjs"], { stdio: "ignore" });
  });

  test("replays too, with altitude, but not the time of day", async ({ browser }) => {
    const ctx = await browser.newContext();
    await isolate(ctx);
    const owner = await ctx.newPage();
    await owner.goto("/");
    await owner.waitForSelector(".leaflet-container");
    const tripId = await owner.evaluate(async () => {
      const post = (url: string, body: unknown) =>
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await post("/api/auth/sign-up/email", { email: `replay-${Date.now()}@test.com`, password: "password123", name: "Rae" });
      await post("/api/public", { action: "profile", displayName: "Rae" });
      const id = crypto.randomUUID();
      const t0 = Date.now() - 3_600_000;
      const track = Array.from({ length: 40 }, (_, i) => ({ lat: 34.98 + i * 0.001, lng: 135.76, t: t0 + i * 10_000, speed: 8, alt: 50 + i }));
      await post("/api/trips", { id, name: "Hill ride", kind: "recorded", createdAt: t0, track, distanceM: 4400, durationS: 390, photos: [] });
      await post("/api/public", { action: "settings", trip: id, visibility: "unlisted", hideM: 300 });
      return id;
    });

    const anonCtx = await browser.newContext();
    await isolate(anonCtx);
    const page = await anonCtx.newPage();
    await page.goto(`/t/${tripId}`);
    const panel = page.getByRole("region", { name: "Trip" });
    await expect(panel.getByRole("heading", { name: "Hill ride" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Replay trip" })).toBeVisible();
    await expect(panel).toContainText(/Altitude \d+–\d+ m/); // graph legend
    const slider = panel.getByRole("slider", { name: "Replay position" });
    await slider.focus();
    await page.keyboard.press("End");
    await expect(panel).toContainText("Altitude");
    await expect(page.locator(".replay-dot")).toHaveCount(1);
    // Elapsed time only: no clock time on a shared page.
    await expect(panel.locator("text=/\\d{1,2}:\\d{2}:\\d{2}\\s?(AM|PM)/i")).toHaveCount(0);
  });
});
