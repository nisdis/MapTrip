import { describe, expect, it } from "vitest";
import { TILE_RE, savedTileKey, tileXY, tilesFor } from "../../src/sw/tiles";

describe("map tiles for a saved area", () => {
  it("finds the tile under a point (standard Web Mercator numbering)", () => {
    expect(tileXY(0, 0, 1)).toEqual([1, 1]);
    expect(tileXY(51.5074, -0.1278, 10)).toEqual([511, 340]); // London
    expect(tileXY(34.9858, 135.7588, 14)).toEqual([14370, 6490]); // Kyoto Station
  });

  it("covers a city-sized box at every zoom up to 14, in the low hundreds of tiles", () => {
    const kyoto = { south: 34.93, west: 135.68, north: 35.07, east: 135.83 }; // ~14 x 15 km
    const tiles = tilesFor(kyoto);
    const z14 = tiles.filter(([z]) => z === 14);
    expect(z14.length).toBeGreaterThan(30);
    expect(tiles.length).toBeLessThan(500);
    expect(tiles.some(([z, x, y]) => z === 0 && x === 0 && y === 0)).toBe(true);
    expect(Math.max(...tiles.map(([z]) => z))).toBe(14);
  });

  it("stores tiles without the map data version, so they survive an update", () => {
    const old = "https://tiles.openfreemap.org/planet/20261115_080022_pt/14/14370/6488.pbf";
    const next = "https://tiles.openfreemap.org/planet/20261201_000000_pt/14/14370/6488.pbf";
    const key = (u: string) => {
      const m = u.match(TILE_RE)!;
      return savedTileKey(m[1], m[2], m[3]);
    };
    expect(key(old)).toBe(key(next));
    expect(TILE_RE.test("https://tiles.openfreemap.org/planet")).toBe(false);
  });
});
