import { describe, expect, it } from "vitest";
import { SpeedEstimator } from "../../src/utils/speedEstimator";

const M_PER_DEG_LAT = 111320;

/** Simulates 1 fix/second heading north; returns km/h readings. */
function simulate(
  seconds: number,
  ms: (t: number) => number,
  deviceSpeed: (t: number, v: number) => number | null,
  { accuracy = 8, noiseM = 3 } = {},
) {
  const e = new SpeedEstimator();
  let y = 0;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const out: number[] = [];
  for (let t = 0; t < seconds; t++) {
    const v = ms(t);
    y += v;
    const lat = 12.97 + (y + rnd() * noiseM) / M_PER_DEG_LAT;
    const lng = 77.6 + (rnd() * noiseM) / 108500;
    out.push(Math.round(e.update({ lat, lng, t: t * 1000, accuracy, speed: deviceSpeed(t, v) }) * 3.6));
  }
  return out;
}

describe("SpeedEstimator", () => {
  it("never drops to 0 while driving when the phone only sometimes reports speed (the flicker bug)", () => {
    const out = simulate(15, () => 10, (t, v) => (t % 3 === 0 ? v : null));
    expect(out.slice(1).every((k) => k > 0)).toBe(true);
    expect(out.at(-1)).toBeGreaterThanOrEqual(33);
    expect(out.at(-1)).toBeLessThanOrEqual(39);
  });

  it("measures speed from positions when the phone never reports it", () => {
    const out = simulate(15, () => 10, () => null);
    expect(out.slice(3).every((k) => k >= 30 && k <= 42)).toBe(true);
  });

  it("reads a slow walk without speed from the phone (old recorder showed 0)", () => {
    const out = simulate(15, () => 1.4, () => null);
    expect(out.slice(3).every((k) => k > 0)).toBe(true);
  });

  it("reads 0 when standing still with normal GPS wander", () => {
    expect(simulate(15, () => 0, () => null).every((k) => k === 0)).toBe(true);
  });

  it("ignores a single impossible spike so it can't set max speed", () => {
    const out = simulate(10, () => 10, (t, v) => (t === 5 ? 83 : v));
    expect(Math.max(...out)).toBeLessThanOrEqual(40);
  });

  it("accepts a real jump once a second reading confirms it", () => {
    const out = simulate(8, (t) => (t < 3 ? 0 : 22), (t, v) => v);
    expect(out.at(-1)).toBeGreaterThan(70);
  });

  it("reaches 0 within a few seconds of stopping", () => {
    const out = simulate(16, (t) => (t < 8 ? 13.9 : 0), (t, v) => v);
    expect(out[13]).toBe(0);
  });
});

describe("standing still in the app (Android reports a speed anyway)", () => {
  it("ignores the phone's speed on an indoor (Wi-Fi/cell) fix", async () => {
    const { SpeedEstimator } = await import("../../src/utils/speedEstimator");
    const e = new SpeedEstimator();
    let v = 0;
    for (let i = 0; i < 20; i++) {
      // Wandering ±10 m around one spot, 40 m accuracy, phone says ~1.2 m/s
      v = e.update({ lat: 35 + (i % 2) * 0.00009, lng: 135.75, t: i * 1000, accuracy: 40, speed: 1.2, speedAccuracy: null });
    }
    expect(v).toBe(0);
  });

  it("treats a speed within the phone's own error as stopped", async () => {
    const { SpeedEstimator } = await import("../../src/utils/speedEstimator");
    const e = new SpeedEstimator();
    let v = 0;
    for (let i = 0; i < 20; i++) {
      v = e.update({ lat: 35, lng: 135.75, t: i * 1000, accuracy: 5, speed: 0.9 + (i % 3) * 0.2, speedAccuracy: 1.5 });
    }
    expect(v).toBe(0);
  });

  it("still trusts a real GPS speed that is clearly above its error", async () => {
    const { SpeedEstimator } = await import("../../src/utils/speedEstimator");
    const e = new SpeedEstimator();
    let v = 0;
    for (let i = 0; i < 10; i++) {
      v = e.update({ lat: 35 + i * 0.0001, lng: 135.75, t: i * 1000, accuracy: 5, speed: 11, speedAccuracy: 0.5 });
    }
    expect(v).toBeGreaterThan(10);
  });

  it("reads a plane's speed (900 km/h), with or without the phone's own speed", () => {
    // From a standstill it climbs over ~10 s (one wild reading can't jump it), then holds.
    expect(simulate(15, () => 250, (_t, v) => v).slice(-3)).toEqual([900, 900, 900]);
    expect(simulate(16, () => 250, () => null).slice(-1)[0]).toBeGreaterThanOrEqual(895);
  });
});
