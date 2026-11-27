import { test, expect, openMenu } from "./fixtures";

const place = (id: number, name: string, lat: number, lon: number) => ({
  osm_type: "node",
  osm_id: id,
  place_id: id,
  lat: String(lat),
  lon: String(lon),
  name,
  display_name: `${name}, Kyoto, Japan`,
  category: "place",
  type: "station",
  importance: 0.5,
  address: { city: "Kyoto", country_code: "jp" },
  namedetails: { name },
});
const STATION = place(1, "Kyoto Station", 34.9858, 135.7588);
const GION = place(2, "Gion", 35.0037, 135.7788);

/** A minimal OSRM answer: a straight line, with a duration that depends on the mode. */
const osrm = (minutes: number) => ({
  code: "Ok",
  routes: [
    {
      geometry: "_mntEoexaY_sB_sB",
      legs: [{ steps: [], summary: "", distance: 3000, duration: minutes * 60 }],
      distance: 3000,
      duration: minutes * 60,
    },
  ],
  waypoints: [
    { location: [135.7588, 34.9858], name: "" },
    { location: [135.7788, 35.0037], name: "" },
  ],
});

test("directions: car, bike or walk from the right router; public transport opens Google Maps", async ({ page }) => {
  const searches: string[] = [];
  await page.route(/nominatim\.openstreetmap\.org\/search/, (r) => {
    searches.push(decodeURIComponent(r.request().url()));
    return r.fulfill({ json: r.request().url().includes("Gion") ? [GION] : [STATION] });
  });
  const asked: string[] = [];
  await page.route(/router\.project-osrm\.org\/route\/v1\/driving\//, (r) => {
    asked.push("car");
    return r.fulfill({ json: osrm(9) });
  });
  await page.route(/routing\.openstreetmap\.de\/routed-(bike|foot)\/route\/v1\/driving\//, (r) => {
    const mode = r.request().url().includes("routed-foot") ? "foot" : "bike";
    asked.push(mode);
    return r.fulfill({ json: osrm(mode === "foot" ? 40 : 14) });
  });

  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await openMenu(page, "Directions");
  const modes = page.getByRole("radiogroup", { name: "Travel mode" });
  await expect(modes.getByRole("radio", { name: "Car" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("link", { name: /Public transport/ })).toHaveCount(0); // needs a destination

  await page.getByPlaceholder("Enter starting point").fill("Kyoto Station");
  await page.getByRole("button", { name: /Kyoto Station/ }).first().click();
  await page.getByPlaceholder("Enter destination").fill("Gion");
  await page.getByRole("button", { name: /^Gion/ }).first().click();
  // The destination was searched near the start (Kyoto Station), not anywhere.
  expect(searches.at(-1)).toMatch(/viewbox=135\.5088,35\.2358,136\.0088,34\.7358&bounded=1/);

  // Nothing is routed until you ask.
  await page.waitForTimeout(500);
  expect(asked).toEqual([]);
  await page.getByRole("button", { name: "Show route" }).click();
  await expect.poll(() => asked).toEqual(["car"]);
  await expect(page.locator(".leaflet-overlay-pane path")).not.toHaveCount(0); // the route is drawn
  const bar = page.getByRole("region", { name: "Route" });
  await expect(bar).toContainText("Kyoto Station → Gion");
  await expect(bar).toContainText("9 min");

  // Changing the mode re-routes straight away.
  await openMenu(page, "Directions");
  await modes.getByRole("radio", { name: "Walk" }).click();
  await expect.poll(() => asked).toEqual(["car", "foot"]);
  await modes.getByRole("radio", { name: "Bike" }).click();
  await expect.poll(() => asked).toEqual(["car", "foot", "bike"]);

  const transit = page.getByRole("link", { name: /Public transport/ });
  const href = new URL((await transit.getAttribute("href"))!);
  expect(href.origin + href.pathname).toBe("https://www.google.com/maps/dir/");
  expect(Object.fromEntries(href.searchParams)).toEqual({
    api: "1",
    origin: "34.985800,135.758800",
    destination: "35.003700,135.778800",
    travelmode: "transit",
  });
  await expect(transit).toHaveAttribute("target", "_blank");

  // Clear route, from the map.
  await page.locator('button[aria-label="Close"]').first().click();
  await bar.getByRole("button", { name: "Clear route" }).click();
  await expect(bar).toHaveCount(0);
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(0);

  // The choice is remembered.
  await page.reload();
  await page.waitForSelector(".leaflet-container");
  await openMenu(page, "Directions");
  await expect(page.getByRole("radiogroup", { name: "Travel mode" }).getByRole("radio", { name: "Bike" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
