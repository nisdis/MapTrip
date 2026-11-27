import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

/** Every request leaving localhost is blocked unless a test mocks it, so tests never depend on live services. */
export async function isolate(context: BrowserContext) {
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
}

/** Replaces the browser's GPS with fixes the test sends: window.__fix(lat, lng, tSeconds, speed?, alt?). */
export async function fakeGps(context: BrowserContext) {
  await context.addInitScript(() => {
    let cb: PositionCallback | null = null;
    const w = window as unknown as { __t0: number; __fix: (...a: (number | null)[]) => void };
    w.__t0 = Date.now();
    navigator.geolocation.watchPosition = (ok) => {
      cb = ok;
      return 1;
    };
    navigator.geolocation.clearWatch = () => {};
    navigator.geolocation.getCurrentPosition = (ok) =>
      ok({ coords: { latitude: 12.97, longitude: 77.6, accuracy: 6, speed: 0, altitude: 900, heading: 0 }, timestamp: Date.now() } as GeolocationPosition);
    w.__fix = (lat, lng, t, speed = null, alt = 900, accuracy = 6) =>
      cb?.({
        coords: { latitude: lat, longitude: lng, accuracy, speed, altitude: alt, heading: 0 },
        timestamp: w.__t0 + (t ?? 0) * 1000,
      } as GeolocationPosition);
  });
}

/** One GPS reading: t in seconds from the start, speed in m/s, accuracy in metres. */
export const fix = (page: Page, lat: number, lng: number, t: number, speed: number | null = null, alt = 900, accuracy = 6) =>
  page.evaluate(([a, b, c, d, e, f]) => (window as unknown as { __fix: (...x: unknown[]) => void }).__fix(a, b, c, d, e, f), [
    lat,
    lng,
    t,
    speed,
    alt,
    accuracy,
  ] as const);

/** Press and hold (hold-to-finish, pocket-mode wake). */
export async function hold(page: Page, selector: string, ms = 1200) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

export const test = base.extend<{ gps: void }>({
  context: async ({ context }, use) => {
    await isolate(context);
    await fakeGps(context);
    await use(context);
  },
  page: async ({ page }, use) => {
    page.on("dialog", (d) => d.accept());
    await use(page);
  },
});
export { expect };

export const hasDb = !!process.env.DATABASE_URL;

/** Opens a panel (Search, Directions, Trips, Saved…) from the ☰ menu. */
export async function openMenu(page: Page, item: string) {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("navigation", { name: "Menu" }).getByRole("button", { name: item, exact: true }).click();
}
