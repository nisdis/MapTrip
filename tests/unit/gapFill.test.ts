import { describe, expect, it } from "vitest";
import { judgeRoad } from "../../src/services/gapFill";
import { gapDistance, type TrackGap } from "../../src/types/trip";

const gap = (over: Partial<TrackGap> = {}): TrackGap => ({
  index: 1,
  startedAt: 0,
  endedAt: 600_000,
  straightM: 8000,
  routeM: 9500,
  path: [
    [0, 0],
    [1, 1],
  ],
  ...over,
});

describe("choosing how to fill a gap", () => {
  const base = { straightM: 8000, routeM: 9500, durationMs: 600_000, nearRail: false };
  it("a plausible road route is used", () => {
    expect(judgeRoad(base)).toBeNull(); // 57 km/h
  });
  it("next to a railway at both ends: a train", () => {
    expect(judgeRoad({ ...base, nearRail: true })).toBe("rail");
  });
  it("a road route needing an impossible speed is rejected", () => {
    expect(judgeRoad({ ...base, durationMs: 180_000 })).toBe("too-fast"); // 190 km/h
  });
  it("a huge detour (water, no road) is rejected", () => {
    expect(judgeRoad({ ...base, routeM: 30_000, durationMs: 3_600_000 })).toBe("detour");
  });
  it("no road route at all: nothing to judge", () => {
    expect(judgeRoad({ ...base, routeM: null })).toBeNull();
  });
});

describe("gap distance", () => {
  it("counts the road route only when that's the fill", () => {
    expect(gapDistance([gap()])).toBe(9500);
    expect(gapDistance([gap({ fill: "straight" })])).toBe(8000);
    expect(gapDistance([gap({ path: null, routeM: null })])).toBe(8000);
    expect(gapDistance([gap({ fill: "road", path: null, routeM: null })])).toBe(8000);
  });
});
