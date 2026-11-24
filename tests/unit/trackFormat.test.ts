import { describe, expect, it } from "vitest";
import {
  TRACK_FIELDS,
  decodePolyline,
  decodeTrack,
  encodePolyline,
  encodeTrack,
  routePolylines,
  type StoredPoint,
} from "../../api/_lib/trackFormat";

const full: StoredPoint = {
  lat: 12.971234, lng: 77.594512, t: 1700000000000, speed: 12.3, alt: 901.5,
  accuracy: 4.2, altAccuracy: 3, heading: 182, headingAccuracy: 10, deviceSpeed: 12.41, speedAccuracy: 0.5,
};

describe("track table format", () => {
  it("stores every column in the fixed order, null where the device gave nothing", () => {
    const sparse = { lat: 12.98, lng: 77.6, t: 1700000005000, speed: null, gap: true };
    const table = encodeTrack([full, sparse]);
    expect(table.fields).toEqual([...TRACK_FIELDS]);
    expect(table.rows[0]).toEqual([1700000000000, 12.971234, 77.594512, 901.5, 12.3, 4.2, 3, 182, 10, 12.41, 0.5, 0]);
    expect(table.rows[1]).toEqual([1700000005000, 12.98, 77.6, null, null, null, null, null, null, null, null, 1]);
    for (const row of table.rows) expect(row).toHaveLength(TRACK_FIELDS.length);
  });

  it("round-trips points", () => {
    const back = decodeTrack(encodeTrack([full, { lat: 1, lng: 2, t: 3, speed: null, gap: true }]));
    expect(back[0]).toEqual(full);
    expect(back[1]).toMatchObject({ lat: 1, lng: 2, t: 3, speed: null, alt: null, heading: null, gap: true });
  });

  it("reads the old list of point objects", () => {
    const back = decodeTrack([{ lat: 1, lng: 2, t: 3, speed: 4, alt: 5 }, { lat: 1.1, lng: 2.1, t: 4, speed: null, gap: true }]);
    expect(back).toEqual([
      expect.objectContaining({ lat: 1, lng: 2, t: 3, speed: 4, alt: 5, accuracy: null }),
      expect.objectContaining({ lat: 1.1, t: 4, gap: true }),
    ]);
  });

  it("reads columns by name, so a different or longer column list still works", () => {
    const back = decodeTrack({ fields: ["lat", "lng", "t", "future"], rows: [[1, 2, 3, 99]] });
    expect(back).toEqual([expect.objectContaining({ lat: 1, lng: 2, t: 3, speed: null })]);
  });

  it("skips rows without a valid position or time, and junk", () => {
    expect(decodeTrack({ fields: [...TRACK_FIELDS], rows: [[1, 95, 2], [null, 1, 2], "x", [5, 1, 2]] })).toHaveLength(1);
    expect(decodeTrack(null)).toEqual([]);
    expect(decodeTrack({ rows: [] })).toEqual([]);
  });
});

describe("route polyline", () => {
  it("encodes Google's reference example", () => {
    const coords: [number, number][] = [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]];
    expect(encodePolyline(coords)).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual(coords);
  });

  it("simplifies a straight line to its ends and splits at gaps", () => {
    const line = Array.from({ length: 100 }, (_, i) => ({ lat: 12 + i * 0.0001, lng: 77, t: i, speed: 1 }));
    const after = Array.from({ length: 10 }, (_, i) => ({ lat: 13, lng: 78 + i * 0.0001, t: 200 + i, speed: 1, gap: i === 0 }));
    const lines = routePolylines([...line, ...after]);
    expect(lines).toHaveLength(2);
    expect(decodePolyline(lines[0])).toEqual([[12, 77], [12.0099, 77]]);
  });

  it("keeps bends larger than the tolerance", () => {
    const pts = [
      { lat: 12, lng: 77, t: 0, speed: 1 },
      { lat: 12.001, lng: 77.001, t: 1, speed: 1 }, // ~150 m off the straight line
      { lat: 12, lng: 77.002, t: 2, speed: 1 },
    ];
    expect(decodePolyline(routePolylines(pts)[0])).toHaveLength(3);
  });
});
