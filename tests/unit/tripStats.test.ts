import { describe, expect, it } from "vitest";
import { buildTrailRuns, computeStats } from "../../src/utils/tripStats";
import { gapDistance, type TrackPoint } from "../../src/types/trip";

const p = (lat: number, t: number, speed = 10, extra: Partial<TrackPoint> = {}): TrackPoint => ({
  lat,
  lng: 77.6,
  t,
  speed,
  alt: null,
  ...extra,
});
const STEP = 0.001; // ~111 m

describe("trip stats", () => {
  it("doesn't count distance across a gap (screen off / pause)", () => {
    const track = [p(12.97, 0), p(12.97 + STEP, 10), p(13.2, 600, 10, { gap: true }), p(13.2 + STEP, 610)];
    const s = computeStats(track, 620);
    expect(s.distanceM).toBeGreaterThan(200);
    expect(s.distanceM).toBeLessThan(250); // two ~111 m legs, not the ~25 km jump
  });

  it("breaks the coloured trail at a gap", () => {
    const track = [p(12.97, 0), p(12.97 + STEP, 10), p(13.2, 600, 10, { gap: true }), p(13.2 + STEP, 610)];
    const runs = buildTrailRuns(track);
    expect(runs).toHaveLength(2);
    expect(runs.flatMap((r) => r.positions).some(([lat]) => lat === 13.2)).toBe(true);
  });

  it("colours runs by speed band", () => {
    const track = [p(12.97, 0, 2), p(12.97 + STEP, 10, 2), p(12.97 + 2 * STEP, 20, 25), p(12.97 + 3 * STEP, 30, 25)];
    const colors = buildTrailRuns(track).map((r) => r.color);
    expect(new Set(colors).size).toBeGreaterThan(1);
  });

  it("estimated gap distance prefers the road route, else the straight line", () => {
    const gaps = [
      { index: 2, startedAt: 0, endedAt: 1, straightM: 1000, routeM: 1400, path: null },
      { index: 5, startedAt: 0, endedAt: 1, straightM: 500, routeM: null, path: null },
    ];
    expect(gapDistance(gaps)).toBe(1900);
    expect(gapDistance()).toBe(0);
  });
});
