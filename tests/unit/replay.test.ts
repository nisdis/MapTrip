import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  chartSamples,
  defaultRate,
  msAtClock,
  stateAt,
  type ReplayPoint,
} from "../../src/utils/replay";

const STEP = 0.001; // ~111 m of latitude
const p = (lat: number, t: number, extra: Partial<ReplayPoint> = {}): ReplayPoint => ({
  lat,
  lng: 77.6,
  t,
  speed: 10,
  ...extra,
});

describe("replay timeline", () => {
  it("follows the recorded clock, and jumps over a pause in tracking", () => {
    const tl = buildTimeline([p(12.97, 1000), p(12.97 + STEP, 11_000), p(13.2, 611_000, { gap: true }), p(13.2 + STEP, 621_000)]);
    expect(tl.at).toEqual([0, 10_000, 10_000, 20_000]); // the 10-minute pause takes no replay time
    expect(tl.durationMs).toBe(20_000);
    expect(tl.totalM).toBeGreaterThan(200);
    expect(tl.totalM).toBeLessThan(250); // nothing counted across the pause without an estimate
  });

  it("counts the estimated distance across a pause when given", () => {
    const track = [p(12.97, 0), p(12.97 + STEP, 10_000), p(13.2, 600_000, { gap: true }), p(13.2 + STEP, 610_000)];
    const tl = buildTimeline(track, new Map([[2, 30_000]]));
    expect(tl.totalM).toBeGreaterThan(30_200);
    expect(tl.dist[2] - tl.dist[1]).toBe(30_000);
  });

  it("is halfway along a segment halfway through its time", () => {
    const tl = buildTimeline([p(12.97, 0, { speed: 10, alt: 100 }), p(12.97 + STEP, 10_000, { speed: 20, alt: 200 })]);
    const s = stateAt(tl, 5_000);
    expect(s.lat).toBeCloseTo(12.97 + STEP / 2, 6);
    expect(s.speedMs).toBeCloseTo(15);
    expect(s.altM).toBeCloseTo(150);
    expect(s.distanceM).toBeCloseTo(tl.totalM / 2, 1);
    expect(s.clock).toBe(5_000);
  });

  it("is past the jump at the moment of a pause", () => {
    const tl = buildTimeline([p(12.97, 0), p(12.97 + STEP, 10_000), p(13.2, 600_000, { gap: true }), p(13.2 + STEP, 610_000)]);
    expect(stateAt(tl, 10_000).lat).toBe(13.2);
    expect(stateAt(tl, 9_999).lat).toBeLessThan(13);
  });

  it("clamps to the start and the end", () => {
    const tl = buildTimeline([p(12.97, 0), p(12.97 + STEP, 10_000)]);
    expect(stateAt(tl, -5).lat).toBe(12.97);
    expect(stateAt(tl, 1e9).lat).toBe(12.97 + STEP);
    expect(stateAt(tl, 1e9).ms).toBe(10_000);
  });

  it("works out the speed from distance and time when none was recorded", () => {
    const tl = buildTimeline([p(12.97, 0, { speed: null }), p(12.97 + STEP, 10_000, { speed: null })]);
    expect(stateAt(tl, 5_000).speedMs).toBeCloseTo(tl.totalM / 10, 1); // ~11 m/s
  });

  it("uses the nearest altitude when a fix has none", () => {
    const tl = buildTimeline([p(12.97, 0, { alt: null }), p(12.97 + STEP, 10_000, { alt: 300 }), p(12.97 + 2 * STEP, 20_000, { alt: null })]);
    expect(tl.hasAlt).toBe(true);
    expect(stateAt(tl, 0).altM).toBe(300);
    expect(stateAt(tl, 15_000).altM).toBe(300);
  });

  it("plays a track without times at an even pace", () => {
    const tl = buildTimeline([p(12.97, 0), p(12.97 + STEP, 0), p(12.97 + 2 * STEP, 0)]);
    expect(tl.durationMs).toBeGreaterThan(0);
    expect(stateAt(tl, tl.durationMs / 2).lat).toBeCloseTo(12.97 + STEP, 5);
  });

  it("finds the replay moment of a clock time (photos)", () => {
    const tl = buildTimeline([p(12.97, 1000), p(12.97 + STEP, 11_000), p(13.2, 611_000, { gap: true }), p(13.2 + STEP, 621_000)]);
    expect(msAtClock(tl, 6_000)).toBe(5_000);
    expect(msAtClock(tl, 300_000)).toBe(10_000); // taken during the pause: when the replay jumps
    expect(msAtClock(tl, 616_000)).toBe(15_000);
    expect(msAtClock(tl, 0)).toBeNull();
    expect(msAtClock(tl, 700_000)).toBeNull();
  });

  it("picks a rate that plays the trip in about a minute and a half", () => {
    expect(defaultRate(60_000)).toBe(1);
    expect(defaultRate(30 * 60_000)).toBe(30);
    expect(defaultRate(3 * 3600_000)).toBe(120);
    expect(defaultRate(1000 * 3600_000)).toBe(3600);
  });

  it("samples the whole trip for the graph", () => {
    const tl = buildTimeline([p(12.97, 0, { speed: 0 }), p(12.97 + STEP, 10_000, { speed: 10 })]);
    const s = chartSamples(tl, 11);
    expect(s).toHaveLength(11);
    expect(s[0].ms).toBe(0);
    expect(s[10].ms).toBe(10_000);
    expect(s[10].kmh).toBeCloseTo(36);
    expect(chartSamples(buildTimeline([p(1, 0)]))).toEqual([]);
  });
});
