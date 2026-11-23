import { describe, expect, it } from "vitest";
import {
  START_PRIVACY_M,
  cleanPoint,
  extendedExpiry,
  thin,
  visibleTrail,
  type LivePoint,
} from "../../api/_lib/live";

const H = 3600_000;
const p = (lat: number, gap: 0 | 1 = 0, t = 0): LivePoint => [lat, 77.6, t, 5, gap];
// ~111 m per 0.001° of latitude
const north = (n: number) => Array.from({ length: n }, (_, i) => p(12.97 + i * 0.001, 0, i));

describe("start privacy trim", () => {
  it("hides every point within 300 m of the start", () => {
    const shown = visibleTrail(north(10));
    expect(shown).toHaveLength(7);
    expect(START_PRIVACY_M).toBe(300);
  });

  it("also hides a return past the start, and breaks the line there", () => {
    const out = north(6); // 0..555 m north
    const back = [p(12.9705), p(12.974), p(12.975)]; // back near the start, then away again
    const shown = visibleTrail([...out, ...back]);
    expect(shown.map((x) => +x[0].toFixed(4))).toEqual([12.973, 12.974, 12.975, 12.974, 12.975]);
    expect(shown[3][4]).toBe(1); // not joined across the hidden stretch
  });

  it("only grows as points are added (viewers can fetch just the new part)", () => {
    const pts = [...north(8), p(12.9701), p(12.98)];
    for (let n = 1; n < pts.length; n++) {
      const before = visibleTrail(pts.slice(0, n));
      expect(visibleTrail(pts.slice(0, n + 1)).slice(0, before.length)).toEqual(before);
    }
  });
});

describe("point validation", () => {
  const now = 1_800_000_000_000;
  it("rounds and keeps good points", () => {
    expect(cleanPoint([12.1234567, 77.7654321, now, 12.345, 1], now)).toEqual([12.123457, 77.765432, now, 12.3, 1]);
  });
  it("rejects impossible positions and times", () => {
    expect(cleanPoint([91, 0, now, 1, 0], now)).toBeNull();
    expect(cleanPoint([0, 181, now, 1, 0], now)).toBeNull();
    expect(cleanPoint([0, 0, now + H, 1, 0], now)).toBeNull();
    expect(cleanPoint([0, 0, now - 72 * H, 1, 0], now)).toBeNull();
    expect(cleanPoint({ lat: 0 }, now)).toBeNull();
  });
  it("drops implausible speeds but keeps the point", () => {
    expect(cleanPoint([0, 0, now, 900, 0], now)?.[3]).toBeNull();
  });
});

describe("expiry", () => {
  it("+1 h from the current expiry, or from now if it already passed", () => {
    expect(extendedExpiry(0, 2 * H, H)).toBe(3 * H);
    expect(extendedExpiry(0, H, 2 * H)).toBe(3 * H);
  });
  it("never beyond 24 h after the link was made", () => {
    expect(extendedExpiry(0, 23.5 * H, H)).toBe(24 * H);
  });
});

describe("thinning long trails", () => {
  it("halves the trail, keeps the last point and every break", () => {
    const pts: LivePoint[] = [p(1), p(2), p(3), p(4, 1), p(5), p(6)];
    const out = thin(pts);
    expect(out.map((x) => x[0])).toEqual([1, 3, 5, 6]);
    expect(out[2][4]).toBe(1); // the break on the dropped point 4 moved to 5
  });
});
