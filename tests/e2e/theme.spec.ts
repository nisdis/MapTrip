import { test, expect, fix } from "./fixtures";

test.use({ colorScheme: "dark" });

test("appearance: follows the phone by default; Light/Dark override it and are remembered", async ({ page }) => {
  const styles: string[] = [];
  page.on("request", (r) => /tiles\.openfreemap\.org\/styles\//.test(r.url()) && styles.push(r.url()));
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  const isDark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));

  // System (default) and the phone is dark: dark app, dark map.
  expect(await isDark()).toBe(true);
  await expect.poll(() => styles.some((u) => u.endsWith("/styles/fiord"))).toBe(true);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(21, 27, 31)");

  // Light overrides it, also after a reload.
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const appearance = page.getByRole("radiogroup", { name: "Appearance" });
  await expect(appearance.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
  await appearance.getByRole("radio", { name: "Light" }).click();
  expect(await isDark()).toBe(false);
  await expect.poll(() => styles.some((u) => u.endsWith("/styles/liberty"))).toBe(true);
  await page.reload();
  await page.waitForSelector(".leaflet-container");
  expect(await isDark()).toBe(false);

  // Back to System: dark again.
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("radiogroup", { name: "Appearance" }).getByRole("radio", { name: "System" }).click();
  expect(await isDark()).toBe(true);

  // Text on dark surfaces stays readable: the recorder's numbers are light on dark.
  await page.keyboard.press("Escape");
  await page.mouse.click(10, 400);
  await fix(page, 12.97, 77.6, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  const hud = page.locator('section[aria-label="Trip recorder"]');
  const [fg, hudBg] = await hud.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
  expect(fg).toBe("rgb(226, 232, 230)");
  expect(hudBg).toBe("rgb(21, 27, 31)");
});
