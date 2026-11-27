import { execFileSync } from "node:child_process";
import type { Browser, Page } from "@playwright/test";
import { test, expect, hasDb, isolate, fakeGps } from "./fixtures";

test.skip(!hasDb, "needs DATABASE_URL (a Postgres for the API)");

test.beforeAll(() => {
  execFileSync("node", ["scripts/migrate.mjs"], { stdio: "ignore" });
  execFileSync(
    "node",
    [
      "-e",
      `const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('truncate follows, blocks, trip_reports, trip_views, profiles, trips, saved_places, session, account, verification, "user" cascade').then(()=>p.end())`,
    ],
    { stdio: "inherit" },
  );
});

/** A signed-in person with a public name (through the real API, from the page). */
async function person(browser: Browser, email: string, name: string): Promise<Page> {
  const ctx = await browser.newContext();
  await isolate(ctx);
  await fakeGps(ctx);
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.waitForSelector(".leaflet-container");
  await page.evaluate(
    async ([email, name]) => {
      const post = (url: string, body: unknown) =>
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await post("/api/auth/sign-up/email", { email, password: "password123", name });
      await post("/api/public", { action: "profile", displayName: name });
    },
    [email, name],
  );
  await page.reload();
  await page.waitForSelector(".leaflet-container");
  return page;
}

test("react and comment on a shared trip; the owner sees it in Activity, with the menu badge", async ({ browser }) => {
  const owner = await person(browser, "owner@talk.test", "Olive");
  const tripId = await owner.evaluate(async () => {
    const id = crypto.randomUUID();
    const t0 = Date.now() - 3_600_000;
    const track = Array.from({ length: 40 }, (_, i) => ({ lat: 34.98 + i * 0.001, lng: 135.76, t: t0 + i * 10_000, speed: 8 }));
    const post = (url: string, body: unknown) =>
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await post("/api/trips", { id, name: "Riverside ride", kind: "recorded", createdAt: t0, track, distanceM: 4400, durationS: 400, photos: [] });
    await post("/api/public", { action: "settings", trip: id, visibility: "public" });
    return id;
  });

  const fan = await person(browser, "fan@talk.test", "Finn");
  await fan.goto(`/t/${tripId}`);
  const talk = fan.getByRole("region", { name: "Reactions and comments" });
  await talk.getByRole("button", { name: "Fire" }).click();
  await expect(talk.getByRole("button", { name: "Fire (1)" })).toHaveAttribute("aria-pressed", "true");
  await expect(talk).toContainText("Finn reacted");
  await talk.getByLabel("Write a comment").fill("Lovely route along the river!");
  await talk.getByRole("button", { name: "Post comment" }).click();
  await expect(talk.getByRole("list", { name: "Comments" })).toContainText("Lovely route along the river!");

  // The owner: a badge on the menu, and the Activity tab.
  await owner.reload();
  await owner.waitForSelector(".leaflet-container");
  await owner.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(owner.getByLabel("2 new")).toBeVisible();
  await owner.getByRole("navigation", { name: "Menu" }).getByRole("button", { name: /^People/ }).click();
  const activity = owner.getByRole("list", { name: "Activity" });
  await expect(activity).toContainText("Finn reacted 🔥 to Riverside ride");
  await expect(activity).toContainText("Finn commented on Riverside ride");
  await expect(activity).toContainText("Lovely route along the river!");

  // The owner can remove the comment from their trip's page.
  await owner.goto(`/t/${tripId}`);
  const mine = owner.getByRole("region", { name: "Reactions and comments" });
  await mine.getByRole("button", { name: "Delete comment" }).click();
  await expect(mine.getByRole("list", { name: "Comments" })).toContainText("No comments yet.");

  // Signed out: reads, but needs to sign in to react.
  const ctx = await browser.newContext();
  await isolate(ctx);
  const anon = await ctx.newPage();
  await anon.goto(`/t/${tripId}`);
  const ro = anon.getByRole("region", { name: "Reactions and comments" });
  await expect(ro.getByRole("button", { name: "Fire (1)" })).toBeVisible();
  await expect(ro.getByRole("button", { name: "Sign in to react and comment" })).toBeVisible();
});
