import { describe, expect, it } from "vitest";
import { badgesFor, challengesFor, counts, localDate, progressFor, streakOf, type TripFact } from "../../api/_lib/challenges";

const at = (iso: string) => Date.parse(iso);
const trip = (iso: string, over: Partial<TripFact> = {}): TripFact => ({ createdAt: at(iso), distanceM: 5000, ...over });

describe("what counts", () => {
  it("recorded trips of 1 km or more; not imported, not planned, not tiny", () => {
    expect(counts(trip("2026-11-02T10:00:00Z"))).toBe(true);
    expect(counts(trip("2026-11-02T10:00:00Z", { distanceM: 900 }))).toBe(false);
    expect(counts(trip("2026-11-02T10:00:00Z", { imported: true }))).toBe(false);
    expect(counts(trip("2026-11-02T10:00:00Z", { kind: "planned" }))).toBe(false);
  });
});

describe("weekly streak", () => {
  // Mondays: 2026-11-02, 11-09, 11-16, 11-23.
  const weeks3 = [trip("2026-11-03T08:00:00Z"), trip("2026-11-10T08:00:00Z"), trip("2026-11-17T08:00:00Z")];
  it("counts weeks in a row; still alive mid-week before this week's trip", () => {
    expect(streakOf(weeks3, at("2026-11-18T12:00:00Z"), "UTC")).toEqual({ current: 3, best: 3, thisWeek: true });
    expect(streakOf(weeks3, at("2026-11-24T12:00:00Z"), "UTC")).toEqual({ current: 3, best: 3, thisWeek: false });
    // A whole week missed: back to 0 (best kept).
    expect(streakOf(weeks3, at("2026-12-01T12:00:00Z"), "UTC")).toEqual({ current: 0, best: 3, thisWeek: false });
  });
  it("weeks are in the person's own time zone (Monday 2 am in India is still Sunday in UTC)", () => {
    const t = [trip("2026-11-08T20:30:00Z")]; // Mon 9 Nov 02:00 in Kolkata, Sun 8 Nov in UTC
    expect(localDate(t[0].createdAt, "Asia/Kolkata")).toBe("2026-11-09");
    expect(streakOf(t, at("2026-11-10T12:00:00Z"), "Asia/Kolkata").thisWeek).toBe(true);
    expect(streakOf(t, at("2026-11-10T12:00:00Z"), "UTC").thisWeek).toBe(false);
    expect(localDate(0, "Not/AZone")).toBe("1970-01-01"); // a bad zone falls back to UTC
  });
  it("short or imported trips don't keep a streak going", () => {
    expect(streakOf([trip("2026-11-17T08:00:00Z", { distanceM: 300 })], at("2026-11-18T12:00:00Z"), "UTC").current).toBe(0);
  });
});

describe("monthly challenges", () => {
  it("three different ones each month, the same for everyone; rotating", () => {
    const nov = challengesFor("2026-11");
    expect(nov).toHaveLength(3);
    expect(new Set(nov.map((c) => c.id.split("-")[0])).size).toBe(3);
    expect(challengesFor("2026-11").map((c) => c.id)).toEqual(nov.map((c) => c.id));
    expect(challengesFor("2026-12").map((c) => c.id)).not.toEqual(nov.map((c) => c.id));
  });

  it("progress counts only this month's real trips; 'new squares' means never seen before", () => {
    const trips: TripFact[] = [
      trip("2026-10-20T08:00:00Z", { cells: ["1:1", "1:2"] }),
      trip("2026-11-03T08:00:00Z", { distanceM: 60_000, cells: ["1:2", "1:3", "1:4"], media: 6 }),
      trip("2026-11-05T08:00:00Z", { distanceM: 40_000, cells: ["1:4", "1:5"] }),
      trip("2026-11-06T08:00:00Z", { distanceM: 900_000, imported: true, cells: ["9:9"] }), // doesn't count
    ];
    // Every template, measured directly, whatever this month's pick is.
    const byKind = Object.fromEntries(
      ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"].flatMap((m) =>
        challengesFor(m).map((c) => [c.id.split("-")[0], c]),
      ),
    );
    const nov = trips.filter((t) => counts(t) && t.createdAt >= at("2026-11-01T00:00:00Z"));
    const oct = trips.filter((t) => counts(t) && t.createdAt < at("2026-11-01T00:00:00Z"));
    expect(byKind.distance.measure(nov, oct, "UTC")).toBe(100);
    expect(byKind.days.measure(nov, oct, "UTC")).toBe(2);
    expect(byKind.squares.measure(nov, oct, "UTC")).toBe(3); // 1:3, 1:4, 1:5 (1:2 was seen in October)
    expect(byKind.long.measure(nov, oct, "UTC")).toBe(60);
    expect(byKind.photos.measure(nov, oct, "UTC")).toBe(6);

    const p = progressFor(trips, "2026-11", "UTC");
    expect(p).toHaveLength(3);
    for (const c of p) expect(c.progress).toBeLessThanOrEqual(c.target);
  });

  it("badges: challenges done in earlier months", () => {
    const lots = Array.from({ length: 10 }, (_, i) => trip(`2026-10-${String(i + 2).padStart(2, "0")}T08:00:00Z`, { distanceM: 40_000, media: 9, cells: [`5:${i}`, `6:${i}`, `7:${i}`, `8:${i}`, `9:${i}`, `10:${i}`, `11:${i}`, `12:${i}`, `13:${i}`, `14:${i}`, `15:${i}`] }));
    const b = badgesFor(lots, at("2026-11-15T00:00:00Z"), "UTC");
    expect(b.length).toBeGreaterThan(0);
    expect(b.every((x) => x.month === "2026-10")).toBe(true);
    expect(badgesFor(lots, at("2026-10-20T00:00:00Z"), "UTC")).toEqual([]); // this month: progress, not badges yet
  });
});
