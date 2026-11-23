import { test as base, expect, type Page } from "@playwright/test";
import { hold, isolate } from "./fixtures";

// The web side of the Record My Trip app bridge, with the app played by a fake
// (window.flutter_inappwebview). It pins down the protocol mobile/ implements.

interface Fix {
  seq: number;
  lat: number;
  lng: number;
  t: number;
  accuracy: number;
  speed: number | null;
  altitude: number | null;
  heading: number | null;
}

const test = base.extend({
  context: async ({ context }, use) => {
    await isolate(context);
    await context.addInitScript(() => {
      // What the fake app answers to "hello" survives reloads (like the real app).
      const w = window as unknown as Record<string, unknown>;
      const cfg = JSON.parse(localStorage.getItem("__fakeApp") ?? "{}");
      w.__RMT_APP__ = { version: "test", platform: "android" };
      const log: unknown[] = [];
      w.__appLog = log;
      w.flutter_inappwebview = {
        callHandler: async (_name: string, msg: { type: string }) => {
          log.push(msg);
          if (msg.type === "hello") {
            return {
              version: "test",
              platform: "android",
              recording: cfg.recording ?? "idle",
              pending: cfg.pending ?? [],
              share: cfg.share ?? null,
              device: cfg.device,
              battery: cfg.battery,
            };
          }
          if (msg.type === "batteryStatus") return cfg.battery ?? { unrestricted: true };
          return { ok: true };
        },
      };
    });
    await use(context);
  },
});

const t0 = Date.now() - 60 * 60_000;
/** n fixes heading north-east from (12.97, 77.6), one per second, ~155 m apart */
const fixes = (from: number, n: number, seq0 = from): Fix[] =>
  Array.from({ length: n }, (_, i) => ({
    seq: seq0 + i + 1,
    lat: 12.97 + (from + i) * 0.001,
    lng: 77.6 + (from + i) * 0.001,
    t: t0 + (from + i) * 1000,
    accuracy: 5,
    speed: 20,
    altitude: 900,
    heading: 45,
  }));

const send = (page: Page, list: Fix[]) =>
  page.evaluate((f) => (window as unknown as { __rmtReceive: (m: unknown) => void }).__rmtReceive({ type: "fixes", fixes: f }), list);
const appLog = (page: Page) => page.evaluate(() => (window as unknown as { __appLog: { type: string }[] }).__appLog);

test("in the app: GPS comes from the app, a locked-phone backlog arrives at once, nothing twice", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await expect.poll(async () => (await appLog(page)).map((m) => m.type)).toContain("hello");
  await send(page, fixes(0, 1));
  await page.getByRole("button", { name: "Record a trip" }).click();
  await expect.poll(async () => (await appLog(page)).filter((m) => m.type === "recording").at(-1)).toMatchObject({ state: "recording" });

  // 300 fixes recorded while the page was frozen, handed over in one go (+ a repeat).
  const backlog = fixes(1, 300);
  await send(page, backlog);
  await send(page, backlog.slice(250));
  const hud = page.locator('section[aria-label="Trip recorder"]');
  // 300 legs of ~155 m = 46.56 km
  await expect(hud).toContainText(/46\.5\d/);
  const acks = (await appLog(page)).filter((m) => m.type === "ack") as unknown as { seq: number }[];
  expect(acks.at(-1)?.seq).toBe(301);

  await hud.getByRole("button", { name: "Pause", exact: true }).click();
  await expect.poll(async () => (await appLog(page)).filter((m) => m.type === "recording").at(-1)).toMatchObject({ state: "paused" });
});

test("in the app: page reloaded mid-trip carries the trip on from the draft, then the app's backlog", async ({ page }) => {
  // First life of the page: record a bit (the draft is saved as it goes).
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await send(page, fixes(0, 1));
  await page.getByRole("button", { name: "Record a trip" }).click();
  await send(page, fixes(1, 10));
  await page.waitForTimeout(4500); // drafts save at most every 4 s
  await send(page, fixes(11, 1));
  await expect(page.locator('section[aria-label="Trip recorder"]')).toContainText(/1\.7\d/);

  // The page is reloaded; the app kept recording 20 more fixes meanwhile, and a live share.
  await page.evaluate(
    (cfg) => localStorage.setItem("__fakeApp", JSON.stringify(cfg)),
    { recording: "recording", pending: fixes(12, 20), share: null },
  );
  await page.reload();
  const hud = page.locator('section[aria-label="Trip recorder"]');
  await expect(hud).toBeVisible();
  await expect(page.getByText("You have an unfinished trip")).toHaveCount(0);
  // 31 legs of ~155 m = 4.81 km (the draft's 11 + 20 from the app)
  await expect(hud).toContainText(/4\.8\d/);
});

test("in the app: nothing to continue tells the app to stop", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("__fakeApp", JSON.stringify({ recording: "recording", pending: [] })));
  await page.evaluate(() => indexedDB.deleteDatabase("localforage"));
  await page.reload();
  await page.waitForSelector(".leaflet-container");
  await expect.poll(async () => (await appLog(page)).filter((m) => m.type === "recording").at(-1)).toMatchObject({ state: "idle" });
  await expect(page.locator('section[aria-label="Trip recorder"]')).toHaveCount(0);
});

test("in the app: first trip on a phone that may stop it in the background shows the battery guide once", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "__fakeApp",
      JSON.stringify({ device: { os: "android", manufacturer: "samsung", model: "SM-S921B", sdk: 35 }, battery: { unrestricted: false } }),
    ),
  );
  await page.reload();
  await page.waitForSelector(".leaflet-container");
  await send(page, fixes(0, 1));
  await page.getByRole("button", { name: "Record a trip" }).click();
  const guide = page.getByRole("dialog", { name: "Keep recording with the screen off" });
  await expect(guide).toContainText("Samsung phones can stop apps");
  await expect(guide).toContainText("Choose Unrestricted");
  await guide.getByRole("button", { name: "Open settings" }).click();
  await expect.poll(async () => (await appLog(page)).map((m) => m.type)).toContain("openBatterySettings");
  await guide.getByRole("button", { name: "Later" }).click();
  await expect(guide).toHaveCount(0);

  // Still reachable from the recorder, but not shown again by itself.
  const hud = page.locator('section[aria-label="Trip recorder"]');
  await hud.getByRole("button", { name: "Check battery settings" }).click();
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "Close" }).click();
  page.on("dialog", (d) => d.accept());
  await send(page, fixes(1, 3));
  await hold(page, 'button[aria-label^="Finish trip"]', 1200);
  await page.getByRole("button", { name: "Discard" }).click();
  await page.getByRole("button", { name: "Record a trip" }).click();
  await page.waitForTimeout(500);
  await expect(guide).toHaveCount(0);
});

test("in the app: no battery guide when the app may already run in the background", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "__fakeApp",
      JSON.stringify({ device: { os: "android", manufacturer: "google", model: "Pixel 9", sdk: 36 }, battery: { unrestricted: true } }),
    ),
  );
  await page.reload();
  await page.waitForSelector(".leaflet-container");
  await send(page, fixes(0, 1));
  await page.getByRole("button", { name: "Record a trip" }).click();
  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog", { name: "Keep recording with the screen off" })).toHaveCount(0);
  await expect(page.locator('section[aria-label="Trip recorder"]')).not.toContainText("Check battery settings");
});

test("the website tells Android this app may open its links", async ({ request }) => {
  const res = await request.get("/.well-known/assetlinks.json");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body[0].target.package_name).toBe("com.recordmytrip.map");
  expect(body[0].relation).toContain("delegate_permission/common.handle_all_urls");
});
