import { describe, expect, it } from "vitest";
import { TILE_RE, savedTileKey, tileXY, tilesFor } from "../../src/sw/tiles";
import { MAX_AREA_KM, estimateArea } from "../../src/services/offlineMaps";

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

describe("how big an area can be saved", () => {
  it("a whole city with its outskirts fits: Bangalore from the airport to Anekal, Bidadi to Hoskote", () => {
    const bangalore = { south: 12.7, west: 77.3, north: 13.3, east: 77.9 }; // ~65 x 67 km
    const est = estimateArea(bangalore);
    expect(est.tooBig).toBe(false);
    expect(est.tiles).toBeGreaterThan(1000);
    expect(est.tiles).toBeLessThan(1300);
    // Measured on the real tiles: ~55 MB. The estimate shouldn't be far off.
    expect(est.bytes / 1e6).toBeGreaterThan(45);
    expect(est.bytes / 1e6).toBeLessThan(75);
  });

  it(`up to ${MAX_AREA_KM} km across; larger areas ask to zoom in`, () => {
    expect(MAX_AREA_KM).toBe(100);
    expect(estimateArea({ south: 12.53, west: 77.14, north: 13.42, east: 78.05 }).tooBig).toBe(false); // ~99 x 99 km
    expect(estimateArea({ south: 12.4, west: 77.0, north: 13.5, east: 78.1 }).tooBig).toBe(true); // ~120 km
  });
});
