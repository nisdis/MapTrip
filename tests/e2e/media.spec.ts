import { readFileSync } from "node:fs";
import { test, expect, fix, hold, openMenu } from "./fixtures";

const file = (name: string, mimeType: string) => ({
  name,
  mimeType,
  buffer: readFileSync(new URL(`./media/${name}`, import.meta.url)),
});

test("photos and videos while recording: pinned on the route, open full screen; videos up to 30 s", async ({ page }) => {
  const alerts: string[] = [];
  page.on("dialog", (d) => alerts.push(d.message()));
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await fix(page, 12.97, 77.6, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  for (let i = 1; i <= 5; i++) await fix(page, 12.97 + i * 0.001, 77.6, i, 10);

  const hud = page.locator('section[aria-label="Trip recorder"]');
  const add = hud.locator('input[type="file"]');
  await expect(add).toHaveAttribute("accept", "image/*,video/*");
  await expect(add).toHaveAttribute("multiple", "");
  // A photo and a short video, together; then a video that's too long.
  await add.setInputFiles([file("photo-plain.jpg", "image/jpeg"), file("clip-2s.webm", "video/webm")]);
  await expect(hud.getByLabel("Add photo or video (2 added)")).toBeVisible();
  await add.setInputFiles([file("clip-35s.webm", "video/webm")]);
  await expect.poll(() => alerts.join("\n")).toContain("Videos can be up to 30 seconds; this one is 35 s");
  await expect(hud.getByLabel("Add photo or video (2 added)")).toBeVisible();
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
  await item.locator('input[type="file"]').setInputFiles([file("photo-exif.jpg", "image/jpeg")]);
  await expect(item.getByRole("button", { name: "Open photo" })).toHaveCount(2);
  await page.locator('button[aria-label="Close"]').first().click();
  await expect(page.locator(".media-pin")).toHaveCount(1);
});
