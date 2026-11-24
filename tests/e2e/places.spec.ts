import { test, expect, fix, openMenu } from "./fixtures";

const POI = {
  osm_type: "node",
  osm_id: 42,
  place_id: 1,
  lat: "12.9450",
  lon: "77.5714",
  name: "Test Bhavan",
  category: "amenity",
  type: "restaurant",
  address: { house_number: "32", road: "Gandhi Bazaar Main Road", city: "Bengaluru", country_code: "in" },
  extratags: { opening_hours: "24/7", phone: "+91 80 1234 5678", website: "example.in", cuisine: "regional" },
  namedetails: { name: "Test Bhavan" },
};
const cafe = (i: number) => ({
  ...POI,
  osm_id: 100 + i,
  name: `Cafe ${i}`,
  type: "cafe",
  lat: String(12.9784 + i * 0.0005),
  lon: "77.6408",
  extratags: i === 0 ? { opening_hours: "24/7" } : {},
  namedetails: { name: `Cafe ${i}` },
});

test.beforeEach(async ({ context }) => {
  await context.route(/nominatim\.openstreetmap\.org\/(reverse|lookup)/, (r) =>
    r.fulfill({ json: r.request().url().includes("/lookup") ? [POI] : POI }),
  );
  await context.route(/nominatim\.openstreetmap\.org\/search.*q=cafe/, (r) =>
    r.fulfill({ json: Array.from({ length: 6 }, (_, i) => cafe(i)) }),
  );
});

test("place sheet: details, save, Home, note, Saved tab, Home shortcut", async ({ page }) => {
  await page.goto("/?place=12.9450,77.5714");
  const sheet = page.locator('[role=dialog][aria-label="Place details"]');
  await expect(sheet).toContainText("Test Bhavan");
  await expect(sheet).toContainText("Open 24 hours");
  await expect(sheet.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+918012345678");

  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "More details", exact: true }).click();
  await sheet.getByRole("button", { name: "Set as Home" }).click();
  await sheet.getByPlaceholder("e.g. Try the filter coffee").fill("Masala dosa");
  await page.waitForTimeout(1200); // saved after typing stops, without leaving the box

  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await expect(page.locator(".category-pin")).toHaveCount(2); // Home + favourite pins
  await openMenu(page, "Saved");
  const panel = page.locator(".overflow-y-auto").last();
  await expect(panel).toContainText("Home");
  await expect(panel).toContainText("“Masala dosa”");
  await panel.getByRole("button", { name: /Test Bhavan/ }).first().click();
  await expect(sheet).toContainText("Test Bhavan");
  await sheet.getByRole("button", { name: "Close place details" }).click();

  await fix(page, 12.96, 77.59, 1, 0); // "Current location" needs a GPS fix
  await openMenu(page, "Directions");
  await page.locator(".overflow-y-auto").last().getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByPlaceholder("Enter destination")).toHaveValue("Home");
  await expect(page.getByPlaceholder("Enter starting point")).toHaveValue("Current location");
});

test("nearby list: category pins, peeking sheet, open a result and go back", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await page.getByRole("button", { name: "Cafes", exact: true }).click();
  const list = page.locator('section[aria-label="Cafes nearby"]');
  await expect(list.locator("li")).toHaveCount(1); // peek shows the nearest only
  await expect(page.locator(".category-pin")).toHaveCount(6);
  await expect(list).toContainText("6 here");
  await list.getByText(/See all 6/).click();
  await expect(list.locator("li")).toHaveCount(6);
  await list.getByRole("button", { name: "Open now" }).click();
  await expect(list.locator("li")).toHaveCount(1); // only the 24/7 cafe lists hours
  await list.getByRole("button", { name: "Open now" }).click();
  await list.locator("li button").first().click();
  const sheet = page.locator('[role=dialog][aria-label="Place details"]');
  await expect(sheet).toBeVisible();
  await expect(page.locator(".category-pin.is-selected")).toHaveCount(1);
  await sheet.getByRole("button", { name: /Cafes/ }).click(); // back to the list
  await expect(list).toBeVisible();
});

test("share links open the exact place and Share copies one", async ({ page }) => {
  await page.goto("/p/node/42?n=Test%20Bhavan");
  const sheet = page.locator('[role=dialog][aria-label="Place details"]');
  await expect(sheet).toContainText("Test Bhavan");
  await sheet.getByRole("button", { name: "Share", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/p\/node\/42\?n=Test%20Bhavan$/);
});
