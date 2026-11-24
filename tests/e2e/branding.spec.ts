import { test, expect } from "./fixtures";

test("every icon the web app manifest and page list exists", async ({ page, request }) => {
  await page.goto("/");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(manifestHref!)).json();
  expect(manifest.icons.length).toBeGreaterThanOrEqual(4);
  for (const icon of manifest.icons as { src: string; sizes: string; purpose?: string }[]) {
    const res = await request.get(`/${icon.src.replace(/^\//, "")}`);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  for (const sel of ['link[rel="apple-touch-icon"]', 'link[rel="icon"]', 'link[rel="mask-icon"]']) {
    const href = await page.locator(sel).getAttribute("href");
    expect((await request.get(href!)).status(), sel).toBe(200);
  }
});

test("privacy policy: served, says who to contact, linked from the menu", async ({ page }) => {
  await page.goto("/privacy.html");
  await expect(page.getByRole("heading", { name: "Privacy policy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "privacy@recordmytrip.com" }).first()).toBeVisible();
  await expect(page.getByText("Delete my account")).toBeVisible();
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy");
});
