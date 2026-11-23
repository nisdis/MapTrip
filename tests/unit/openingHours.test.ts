import { describe, expect, it } from "vitest";
import { describeHours } from "../../src/utils/openingHours";

const blr = { lat: 12.97, lng: 77.59, countryCode: "in" };
const tokyo = { lat: 35.68, lng: 139.76, countryCode: "jp" };
const weekdays = "Mo-Sa 09:00-21:00; Su off";

describe("describeHours (judged on the place's own clock)", () => {
  it("closed all Sunday", async () => {
    const r = await describeHours(weekdays, blr, new Date("2026-11-22T10:30:00Z"));
    expect(r?.summary).toBe("Closed · Opens Mon 9:00 AM");
  });

  it("open on a weekday morning in India", async () => {
    const r = await describeHours(weekdays, blr, new Date("2026-11-23T05:00:00Z"));
    expect(r?.summary).toBe("Open · Closes 9:00 PM");
  });

  it("the same instant can be open in India and closed in Japan", async () => {
    const at = new Date("2026-11-23T14:00:00Z");
    expect((await describeHours(weekdays, blr, at))?.state).toBe("open");
    expect((await describeHours(weekdays, tokyo, at))?.summary).toBe("Closed · Opens Tue 9:00 AM");
  });

  it("handles 24/7, past-midnight and split shifts", async () => {
    expect((await describeHours("24/7", blr, new Date("2026-11-23T05:00:00Z")))?.summary).toBe("Open 24 hours");
    expect((await describeHours("Fr-Sa 18:00-02:00", blr, new Date("2026-11-27T19:00:00Z")))?.summary).toBe(
      "Open · Closes 2:00 AM",
    );
    expect(
      (await describeHours("Mo-Su 09:00-13:00,17:00-22:00", blr, new Date("2026-11-23T09:30:00Z")))?.summary,
    ).toBe("Closed · Opens 5:00 PM");
  });

  it("returns null for values it can't parse (shown as written instead)", async () => {
    expect(await describeHours("open whenever lol", blr)).toBeNull();
  });

  it("builds a 7-day week starting today", async () => {
    const r = await describeHours(weekdays, tokyo, new Date("2026-11-23T14:00:00Z"));
    expect(r?.week).toHaveLength(7);
    expect(r?.week[0]).toMatchObject({ day: "Monday", isToday: true, text: "9:00 AM – 9:00 PM" });
    expect(r?.week[6]).toMatchObject({ day: "Sunday", text: "Closed" });
  });
});
