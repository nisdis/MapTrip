import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { CELL_DEG, cellBounds, cellOf, cellsOfTrack, cellsToKm2 } from "../../api/_lib/explored";

vi.mock("localforage", () => {
  const mem = new Map<string, unknown>();
  const inst = { getItem: async (k: string) => mem.get(k) ?? null, setItem: async (k: string, v: unknown) => void mem.set(k, v) };
  return { default: { createInstance: () => inst } };
});

describe("explored squares", () => {
  it("~1 km squares everywhere; a point is inside its square", () => {
    for (const [lat, lng] of [[35.0, 135.76], [12.97, 77.59], [64.1, -21.9], [-33.9, 151.2]]) {
      const [s, w, n, e] = cellBounds(cellOf(lat, lng));
      expect(lat).toBeGreaterThanOrEqual(s);
      expect(lat).toBeLessThan(n);
      expect(lng).toBeGreaterThanOrEqual(w);
      expect(lng).toBeLessThan(e);
      const widthKm = (e - w) * 111.32 * Math.cos((lat * Math.PI) / 180);
      expect(widthKm).toBeGreaterThan(0.95);
      expect(widthKm).toBeLessThan(1.05);
    }
    expect(CELL_DEG * 111.32).toBeCloseTo(1, 1);
  });

  it("a 10 km drive north fills ~10 squares, even with only two points", () => {
    const cells = cellsOfTrack([
      { lat: 12.9, lng: 77.6 },
      { lat: 12.9 + 10 / 111.32, lng: 77.6 },
    ]);
    expect(cells.length).toBeGreaterThanOrEqual(10);
    expect(cells.length).toBeLessThanOrEqual(12);
    expect(cellsToKm2(cells.length)).toBe(cells.length);
  });

  it("stretches without GPS and flights don't count", () => {
    const gap = cellsOfTrack([
      { lat: 12.9, lng: 77.6 },
      { lat: 13.0, lng: 77.6, gap: true },
    ]);
    expect(gap).toHaveLength(2);
    const plane = cellsOfTrack([
      { lat: 12.9, lng: 77.6, speed: 230, alt: 10000 },
      { lat: 13.5, lng: 77.6, speed: 230, alt: 10000 },
    ]);
    expect(plane).toHaveLength(0);
    // A fast train on the ground still counts.
    expect(cellsOfTrack([{ lat: 35.0, lng: 135.7, speed: 80, alt: 50 }, { lat: 35.05, lng: 135.7, speed: 80, alt: 50 }]).length).toBeGreaterThan(4);
  });
});

describe("countries and regions from the bundled borders", () => {
  beforeAll(() => {
    vi.stubGlobal("fetch", async (url: string) => {
      const name = /borders\/(\w+)\.json/.exec(url)![1];
      const body = readFileSync(new URL(`../../public/borders/${name}.json`, import.meta.url), "utf8");
      return new Response(body, { status: 200 });
    });
  });

  it("finds the country and state/region of known places", async () => {
    const { placeAt } = await import("../../src/services/explored");
    expect(await placeAt(35.0037, 135.7788)).toMatchObject({ country: { code: "JPN" }, region: { name: "Kyōto" } });
    expect(await placeAt(12.9716, 77.5946)).toMatchObject({ country: { code: "IND" }, region: { name: "Karnataka" } });
    expect(await placeAt(48.8566, 2.3522)).toMatchObject({ country: { code: "FRA" } });
    expect(await placeAt(40.7128, -74.006)).toMatchObject({ country: { code: "USA" }, region: { name: "New York" } });
    expect(await placeAt(0, -30)).toEqual({ country: null, region: null }); // mid-Atlantic
  });

  it("summarizes squares into countries and regions", async () => {
    const { summarize } = await import("../../src/services/explored");
    const s = await summarize([cellOf(35.0037, 135.7788), cellOf(35.01, 135.76), cellOf(12.9716, 77.5946), cellOf(0, -30)]);
    expect(s.countries.map((c) => [c.code, c.squares])).toEqual([["JPN", 2], ["IND", 1]]);
    expect(s.regionCount).toBe(2);
  });
});
