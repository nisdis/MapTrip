// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { gpxFileName, parseGpx, toGpx } from "../../src/utils/gpx";
import type { Trip } from "../../src/types/trip";

const t0 = Date.parse("2026-11-20T09:00:00Z");
const trip: Trip = {
  id: "a",
  name: "Kamo <river> & back",
  kind: "recorded",
  createdAt: t0,
  distanceM: 0,
  durationS: 60,
  track: [
    { lat: 35.0, lng: 135.77, t: t0, speed: 0, alt: 40 },
    { lat: 35.001, lng: 135.77, t: t0 + 20_000, speed: 5.5, alt: 41 },
    { lat: 35.002, lng: 135.77, t: t0 + 40_000, speed: 5.5, alt: null, gap: true },
    { lat: 35.003, lng: 135.77, t: t0 + 60_000, speed: 5.5, alt: 43 },
  ],
};

describe("GPX", () => {
  it("exports tracks with times, heights, and a new segment at each break", () => {
    const xml = toGpx(trip);
    expect(xml).toContain('<gpx version="1.1"');
    expect(xml).toContain("<name>Kamo &lt;river&gt; &amp; back</name>");
    expect(xml.match(/<trkseg>/g)).toHaveLength(2);
    expect(xml.match(/<trkpt /g)).toHaveLength(4);
    expect(xml).toContain("<time>2026-11-20T09:00:20.000Z</time>");
    expect(xml).toContain("<ele>41</ele>");
  });

  it("imports what it exports: points, times, breaks, distance; marked as imported", () => {
    const back = parseGpx(toGpx(trip), "x.gpx", "id1");
    expect(back.track).toHaveLength(4);
    expect(back.track!.map((p) => p.t)).toEqual(trip.track!.map((p) => p.t));
    expect(back.track![2].gap).toBe(true);
    expect(back).toMatchObject({ id: "id1", name: "Kamo <river> & back", kind: "recorded", imported: true, durationS: 60, createdAt: t0 });
    // 3 legs of ~111 m, but the break isn't counted: ~222 m
    expect(back.distanceM).toBeGreaterThan(215);
    expect(back.distanceM).toBeLessThan(230);
    expect(back.track![1].speed).toBeCloseTo(5.6, 1);
  });

  it("imports route points, and tracks without times (no speeds then)", () => {
    const rte = `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><rte><rtept lat="1" lon="2"/><rtept lat="1.01" lon="2"/></rte></gpx>`;
    const t = parseGpx(rte, "My Route.gpx", "id2");
    expect(t.name).toBe("My Route");
    expect(t.track![1].speed).toBeNull();
    expect(t.durationS).toBe(0);
  });

  it("refuses files that aren't GPX or have no track", () => {
    expect(() => parseGpx("not xml <", "a.gpx", "x")).toThrow(/valid GPX/);
    expect(() => parseGpx(`<gpx><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>`, "a.gpx", "x")).toThrow(/No track/);
  });

  it("makes safe file names", () => {
    expect(gpxFileName(trip)).toBe("Kamo-river-back.gpx");
    expect(gpxFileName({ ...trip, name: "///" })).toBe("trip.gpx");
  });
});
