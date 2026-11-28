import { readFileSync } from "node:fs";
import { test, expect, fix, hold, openMenu } from "./fixtures";

const file = (name: string, mimeType: string) => ({
  name,
  mimeType,
  buffer: readFileSync(new URL(`./media/${name}`, import.meta.url)),
});

test("photos and videos while recording: pinned on the route, open full screen", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await fix(page, 12.97, 77.6, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  for (let i = 1; i <= 5; i++) await fix(page, 12.97 + i * 0.001, 77.6, i, 10);

  const hud = page.locator('section[aria-label="Trip recorder"]');
  // The button opens a menu: Take photo, Record video (straight to the camera), or the gallery.
  await hud.getByRole("button", { name: "Add photo or video" }).click();
  const menu = page.getByRole("menu", { name: "Add photo or video" });
  await expect(menu.getByRole("menuitem", { name: "Take photo" }).locator("input")).toHaveAttribute("capture", "environment");
  await expect(menu.getByRole("menuitem", { name: "Take photo" }).locator("input")).toHaveAttribute("accept", "image/*");
  await expect(menu.getByRole("menuitem", { name: "Record video" }).locator("input")).toHaveAttribute("accept", "video/*");
  const add = menu.getByRole("menuitem", { name: "Choose from gallery" }).locator("input");
  await expect(add).toHaveAttribute("accept", "image/*,video/*");
  await expect(add).toHaveAttribute("multiple", "");
  await expect(add).not.toHaveAttribute("capture", /.*/);
  // A photo and a short video, together.
  await add.setInputFiles([file("photo-plain.jpg", "image/jpeg"), file("clip-2s.webm", "video/webm")]);
  await expect(hud.getByLabel("Add photo or video (2 added)")).toBeVisible();
  await expect(menu).toHaveCount(0); // closes once something is picked
  // Pinned on the route while still recording: taken at the same spot, so one pin with a count.
  await expect(page.locator(".media-pin")).toHaveCount(1);
  await expect(page.locator('.media-pin[title="2 photos and videos"]')).toBeVisible();

  for (let i = 6; i <= 8; i++) await fix(page, 12.97 + i * 0.001, 77.6, i, 10);
  await hold(page, 'button[aria-label^="Finish trip"]');
  await page.fill("#trip-name", "With pictures");
  await page.getByRole("button", { name: "Save trip" }).click();

  // On the saved trip: the pin opens them full screen, one after the other.
  await page.locator('.media-pin[title="2 photos and videos"]').click();
  const photo = page.getByRole("dialog", { name: "Photo" });
  await expect(photo.locator("img")).toBeVisible();
  await expect(photo).toContainText("1 of 2");
  await photo.getByRole("button", { name: "Next" }).click();
  const video = page.getByRole("dialog", { name: "Video" });
  await expect(video.locator("video")).toBeVisible();
  await expect(video).toContainText("2 of 2");
  await video.getByRole("button", { name: "Close" }).click();

  // The Trips list: thumbnails; the video plays.
  await openMenu(page, "Trips");
  const item = page.locator("li", { hasText: "With pictures" });
  await item.getByRole("button", { name: "Play video" }).click();
  await expect(page.getByRole("dialog", { name: "Video" }).locator("video")).toBeVisible();
  await page.getByRole("dialog", { name: "Video" }).getByRole("button", { name: "Close" }).click();

  // A gallery photo from another day: kept with the trip, but not pinned on its route.
  await item.getByRole("button", { name: "Add photo or video to With pictures" }).click();
  await page.getByRole("menuitem", { name: "Choose from gallery" }).locator("input").setInputFiles([file("photo-exif.jpg", "image/jpeg")]);
  await expect(item.getByRole("button", { name: "Open photo" })).toHaveCount(2);
  await page.locator('button[aria-label="Close"]').first().click();
  await expect(page.locator(".media-pin")).toHaveCount(1);
});

test("in the app: the camera is asked for when the menu opens; refused, only the gallery (and a way back)", async ({ page }) => {
  // Stand-in for the Android app: answers "camera" with whatever the test sets.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__RMT_APP__ = { version: "1.0.4", platform: "android" };
    w.__camera = "granted";
    w.__calls = [] as string[];
    w.flutter_inappwebview = {
      callHandler: async (_name: string, msg: { type: string }) => {
        (w.__calls as string[]).push(msg.type);
        if (msg.type === "camera") return { camera: w.__camera };
        if (msg.type === "hello") return { version: "1.0.4", platform: "android", recording: "idle", pending: [], share: null, device: {}, battery: { unrestricted: true } };
        return { ok: true };
      },
    };
  });
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await fix(page, 12.97, 77.6, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  const hud = page.locator('section[aria-label="Trip recorder"]');
  const button = hud.getByRole("button", { name: "Add photo or video" });
  const menu = page.getByRole("menu", { name: "Add photo or video" });

  await button.click();
  await expect(menu.getByRole("menuitem", { name: "Take photo" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __calls: string[] }).__calls)).toContain("camera");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // Refused: gallery only, and it can ask again.
  await page.evaluate(() => ((window as unknown as Record<string, unknown>).__camera = "denied"));
  await button.click();
  await expect(menu).toContainText("Camera access is off");
  await expect(menu.getByRole("menuitem", { name: "Take photo" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Choose from gallery" })).toBeVisible();
  await page.evaluate(() => ((window as unknown as Record<string, unknown>).__camera = "granted"));
  await menu.getByRole("menuitem", { name: "Allow camera" }).click();
  await expect(menu.getByRole("menuitem", { name: "Take photo" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Refused for good: only Settings can turn it back on.
  await page.evaluate(() => ((window as unknown as Record<string, unknown>).__camera = "blocked"));
  await button.click();
  await menu.getByRole("menuitem", { name: "Turn on camera in Settings" }).click();
  expect(await page.evaluate(() => (window as unknown as { __calls: string[] }).__calls)).toContain("openAppSettings");
});

test("a big video is made smaller on the phone: 720p at a generous bitrate, smaller file", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await fix(page, 12.97, 77.6, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  for (let i = 1; i <= 3; i++) await fix(page, 12.97 + i * 0.001, 77.6, i, 10);
  const hud = page.locator('section[aria-label="Trip recorder"]');
  await hud.getByRole("button", { name: "Add photo or video" }).click();
  const original = file("clip-1080p-3s.webm", "video/webm");
  await page.getByRole("menuitem", { name: "Choose from gallery" }).locator("input").setInputFiles([original]);
  await expect(hud.getByLabel("Add photo or video (1 added)")).toBeVisible({ timeout: 60_000 });

  // What was kept on the phone: 720p, the same length, far smaller than 2.8 MB.
  const kept = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok, no) => {
      const r = indexedDB.open("record-my-trip");
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    });
    const store = db.transaction("photos").objectStore("photos");
    const all: unknown[] = await new Promise((ok) => {
      const r = store.getAll();
      r.onsuccess = () => ok(r.result);
    });
    const blob = all.find((v) => v instanceof Blob) as Blob;
    const v = document.createElement("video");
    v.src = URL.createObjectURL(blob);
    await new Promise((ok) => (v.onloadedmetadata = ok));
    return { size: blob.size, type: blob.type, width: v.videoWidth, height: v.videoHeight, seconds: v.duration };
  });
  expect(kept.height).toBe(720);
  expect(kept.width).toBe(1280);
  expect(kept.seconds).toBeGreaterThan(2.5);
  // ~5 Mbit/s (generous for 720p), down from ~7.7 in the original.
  expect((kept.size * 8) / kept.seconds).toBeLessThan(6_500_000);
  expect(kept.size).toBeLessThan(original.buffer.length * 0.85);
  expect(kept.type).toMatch(/^video\/(mp4|webm)$/);
});

test("videos are limited by size, not length: a small clip over a minute is kept", async ({ page }) => {
  const alerts: string[] = [];
  page.on("dialog", (d) => alerts.push(d.message()));
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await fix(page, 12.97, 77.6, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  for (let i = 1; i <= 3; i++) await fix(page, 12.97 + i * 0.001, 77.6, i, 10);
  const hud = page.locator('section[aria-label="Trip recorder"]');
  await hud.getByRole("button", { name: "Add photo or video" }).click();
  const add = page.getByRole("menu", { name: "Add photo or video" }).getByRole("menuitem", { name: "Choose from gallery" }).locator("input");
  await add.setInputFiles([file("clip-65s.webm", "video/webm")]); // 65 s
  await expect(hud.getByLabel("Add photo or video (1 added)")).toBeVisible();
  expect(alerts).toEqual([]);
});

test("iPhone (HEIC) photos are added, even named .jpg; a damaged one says why", async ({ page }) => {
  const alerts: string[] = [];
  page.on("dialog", (d) => alerts.push(d.message()));
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await fix(page, 12.97, 77.6, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  const hud = page.locator('section[aria-label="Trip recorder"]');
  await hud.getByRole("button", { name: "Add photo or video" }).click();
  const add = page.getByRole("menu", { name: "Add photo or video" }).getByRole("menuitem", { name: "Choose from gallery" }).locator("input");
  const iphone = readFileSync(new URL("./media/photo-iphone.heic", import.meta.url));
  // Only the start of a HEIC file: can't be opened.
  const broken = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(64)]);
  await add.setInputFiles([
    { name: "IMG_9968.jpg", mimeType: "image/jpeg", buffer: iphone }, // as some apps send it
    { name: "IMG_9969.HEIC", mimeType: "", buffer: iphone }, // some phones don't say what it is
    { name: "IMG_9970.jpg", mimeType: "image/jpeg", buffer: broken },
  ]);
  await expect(hud.getByLabel("Add photo or video (2 added)")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => alerts.join("\n")).toMatch(/IMG_9970\.jpg: Couldn't open this iPhone \(HEIC\) photo/);
  expect(alerts.join("\n")).not.toMatch(/IMG_996[89]/);
});
