import { describe, expect, it } from "vitest";
import { achievementsFor, type TripFacts } from "../../api/_lib/achievements";

const day = 86_400_000;
const t0 = Date.UTC(2026, 10, 2, 9); // Monday 2 Nov 2026
const trip = (over: Partial<TripFacts> = {}): TripFacts => ({ distanceM: 5000, createdAt: t0, start: [35, 135.7], imported: false, ...over });
const byId = (list: ReturnType<typeof achievementsFor>) => Object.fromEntries(list.map((a) => [a.id, a]));

describe("achievements", () => {
  it("nothing yet: all unearned, no progress", () => {
    const a = byId(achievementsFor([]));
    expect(Object.values(a).every((x) => !x.earned && x.progress === 0)).toBe(true);
  });

  it("first trip, distance totals, with progress towards the next", () => {
    const a = byId(achievementsFor([trip({ distanceM: 12_000 })]));
    expect(a["first-trip"].earned).toBe(true);
    expect(a["km-10"].earned).toBe(true);
    expect(a["km-100"].earned).toBe(false);
    expect(a["km-100"].progress).toBeCloseTo(0.12);
  });

  it("imported GPX trips never count", () => {
    const a = byId(achievementsFor([trip({ distanceM: 2_000_000, imported: true })]));
    expect(a["first-trip"].earned).toBe(false);
    expect(a["km-1000"].earned).toBe(false);
  });

  it("a 50 km day adds up trips on the same day", () => {
    const a = byId(achievementsFor([trip({ distanceM: 30_000 }), trip({ distanceM: 25_000, createdAt: t0 + 3_600_000 })]));
    expect(a["day-50"].earned).toBe(true);
    const b = byId(achievementsFor([trip({ distanceM: 30_000 }), trip({ distanceM: 25_000, createdAt: t0 + day })]));
    expect(b["day-50"].earned).toBe(false);
  });

  it("5 different places means starts at least 25 km apart", () => {
    const near = [0, 0.01, 0.02, 0.03, 0.04].map((d) => trip({ start: [35 + d, 135.7] }));
    expect(byId(achievementsFor(near))["places-5"].earned).toBe(false);
    const far = [0, 1, 2, 3, 4].map((d) => trip({ start: [35 + d, 135.7] }));
    expect(byId(achievementsFor(far))["places-5"].earned).toBe(true);
  });

  it("every week for 4 weeks needs consecutive weeks, across a year boundary too", () => {
    const weekly = [0, 7, 14, 21].map((w) => trip({ createdAt: t0 + w * day }));
    expect(byId(achievementsFor(weekly))["weekly-4"].earned).toBe(true);
    const gap = [0, 7, 21, 28].map((w) => trip({ createdAt: t0 + w * day }));
    expect(byId(achievementsFor(gap))["weekly-4"].earned).toBe(false);
    const newYear = [0, 7, 14, 21].map((w) => trip({ createdAt: Date.UTC(2026, 11, 14) + w * day }));
    expect(byId(achievementsFor(newYear))["weekly-4"].earned).toBe(true);
  });
});
