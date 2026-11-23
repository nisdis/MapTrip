import { describe, expect, it } from "vitest";
import {
  bboxOf,
  cleanDisplayName,
  cleanSettings,
  isAdmin,
  pointsOf,
  simplify,
  stripJpegMetadata,
  trimEnds,
  viewerKey,
  type SharePoint,
} from "../../api/_lib/publicTrip";

// ~111 m north per step
const north = (n: number, from = 0): SharePoint[] =>
  Array.from({ length: n }, (_, i) => ({ lat: 35 + (from + i) * 0.001, lng: 135.75, t: (from + i) * 1000, speed: 5 }));

describe("hiding the start and end of a shared trip", () => {
  it("removes everything within the distance of either end", () => {
    const shown = trimEnds(north(21), 500); // 0..2.2 km
    // start: 0..444 m hidden (5 points); end: within 500 m of 2224 m hidden (5 points)
    expect(shown.map((p) => +(p.lat - 35).toFixed(3))).toEqual([0.005, 0.006, 0.007, 0.008, 0.009, 0.01, 0.011, 0.012, 0.013, 0.014, 0.015]);
  });

  it("also where the route passes near the start mid-trip, without joining across", () => {
    const out = north(8); // up 777 m
    const back = north(8, 0).reverse().slice(0, 7); // back down to 111 m
    const away = north(4, 10).map((p) => ({ ...p, lng: 135.76 })); // then off east
    const shown = trimEnds([...out, ...back, ...away], 300);
    expect(shown.some((p, i) => i > 0 && p.gap)).toBe(true);
    expect(shown.every((p) => p.lat >= 35.003 || p.lng === 135.76)).toBe(true);
  });

  it("0 shows everything (the owner's explicit choice)", () => {
    expect(trimEnds(north(5), 0)).toHaveLength(5);
  });

  it("a trip shorter than both hidden ends shows nothing", () => {
    expect(trimEnds(north(5), 500)).toHaveLength(0);
  });
});

describe("settings", () => {
  it("only known hide distances, default 500 m", () => {
    expect(cleanSettings({ hideM: 1000 }, []).hideM).toBe(1000);
    expect(cleanSettings({ hideM: 0 }, []).hideM).toBe(0);
    expect(cleanSettings({ hideM: 50 }, []).hideM).toBe(500);
    expect(cleanSettings({}, []).hideM).toBe(500);
  });
  it("only photos that belong to the trip, once each", () => {
    expect(cleanSettings({ photos: ["a", "b", "a", "x", 3] }, ["a", "b"]).photos).toEqual(["a", "b"]);
  });
});

describe("public names", () => {
  it("accepts ordinary names, trims them", () => {
    expect(cleanDisplayName("  Nissim  D ")).toBe("Nissim D");
    expect(cleanDisplayName("旅人")).toBe("旅人");
  });
  it("rejects too short/long, links and email addresses", () => {
    expect(cleanDisplayName("x")).toBeNull();
    expect(cleanDisplayName("a".repeat(41))).toBeNull();
    expect(cleanDisplayName("me@example.org")).toBeNull();
    expect(cleanDisplayName("visit www.spam")).toBeNull();
    expect(cleanDisplayName("https://x")).toBeNull();
    expect(cleanDisplayName(42)).toBeNull();
  });
  it("strips invisible characters", () => {
    expect(cleanDisplayName("Ad​min‮")).toBe("Admin");
  });
});

describe("helpers", () => {
  it("only valid points from stored trips", () => {
    expect(pointsOf({ track: [{ lat: 1, lng: 2, t: 3, speed: 4 }, { lat: 99, lng: 0, t: 0 }, "x", { lat: 1 }] })).toHaveLength(1);
    expect(pointsOf(null)).toEqual([]);
  });
  it("bounding box", () => {
    expect(bboxOf(north(3))).toEqual({ minLat: 35, maxLat: 35.002, minLng: 135.75, maxLng: 135.75 });
    expect(bboxOf([])).toBeNull();
  });
  it("simplifies long lines, keeping ends and breaks", () => {
    const pts = north(1000);
    pts[501] = { ...pts[501], gap: true };
    const s = simplify(pts, 100);
    expect(s.length).toBeLessThanOrEqual(103);
    expect(s[0]).toBe(pts[0]);
    expect(s.at(-1)).toBe(pts[999]);
    expect(s).toContain(pts[501]);
  });
  it("admins from ADMIN_EMAILS, any case", () => {
    expect(isAdmin("Boss@Example.com", "a@b.c, boss@example.com")).toBe(true);
    expect(isAdmin("other@example.com", "boss@example.com")).toBe(false);
    expect(isAdmin(null, "boss@example.com")).toBe(false);
    expect(isAdmin("x@y.z", "")).toBe(false);
  });
  it("viewer keys: same person same day match, otherwise not, and reveal nothing", () => {
    const a = viewerKey("1.2.3.4", "UA", "2026-11-23", "s");
    expect(viewerKey("1.2.3.4", "UA", "2026-11-23", "s")).toBe(a);
    expect(viewerKey("1.2.3.4", "UA", "2026-11-24", "s")).not.toBe(a);
    expect(a).not.toContain("1.2.3.4");
  });
});

describe("photo metadata", () => {
  // SOI, APP0 (JFIF, kept), APP1 (Exif with "GPS", dropped), COM (dropped), SOS + data, EOI
  const seg = (marker: number, body: number[]) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
  const jpeg = new Uint8Array([
    0xff, 0xd8,
    ...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0]),
    ...seg(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, 0x47, 0x50, 0x53]),
    ...seg(0xfe, [0x68, 0x69]),
    ...seg(0xda, [1, 2, 3]), 9, 9, 9,
    0xff, 0xd9,
  ]);
  it("drops EXIF (incl. GPS) and comments, keeps the image", () => {
    const out = stripJpegMetadata(jpeg);
    const text = Buffer.from(out).toString("latin1");
    expect(text).not.toContain("Exif");
    expect(text).not.toContain("GPS");
    expect(text).toContain("JFIF");
    expect(out.length).toBe(jpeg.length - 13 - 6);
    expect([...out.slice(-5)]).toEqual([9, 9, 9, 0xff, 0xd9]);
  });
  it("leaves anything that isn't a JPEG alone", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(stripJpegMetadata(png)).toBe(png);
  });
});
