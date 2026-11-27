import { test, expect, fix, hold, openMenu } from "./fixtures";

test("challenges: a weekly streak and this month's three challenges, from trips on the phone", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await openMenu(page, "Challenges");
  const streak = page.getByRole("region", { name: "Weekly streak" });
  await expect(streak).toContainText("0 weeks in a row");
  await expect(streak).toContainText("to start a streak");
  await page.locator('button[aria-label="Close"]').first().click();

  // A 3 km trip.
  await fix(page, 12.9, 77.6, 0, 0);
  await page.getByRole("button", { name: "Record a trip" }).click();
  for (let i = 1; i <= 30; i++) await fix(page, 12.9 + i * 0.001, 77.6, i * 10, 11);
  await hold(page, 'button[aria-label^="Finish trip"]');
  await page.fill("#trip-name", "Morning loop");
  await page.getByRole("button", { name: "Save trip" }).click();

  await openMenu(page, "Challenges");
  await expect(streak).toContainText("1 week in a row");
  await expect(streak).toContainText("This week is done.");
  const month = page.getByRole("region", { name: "This month's challenges" });
  await expect(month.getByRole("progressbar")).toHaveCount(3);
  await expect(page.getByText("Sign in to include your other devices")).toBeVisible();
});
