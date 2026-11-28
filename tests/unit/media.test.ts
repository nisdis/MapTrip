import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { exifTakenAt, placeMedia, placeOnTrack } from "../../src/utils/media";

const buf = (name: string) => {
  const b = readFileSync(new URL(`../e2e/media/${name}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

describe("when a photo was taken", () => {
  it("reads the camera's date from the photo", () => {
    expect(exifTakenAt(buf("photo-exif.jpg"))).toBe(new Date(2026, 10, 20, 10, 15, 30).getTime());
  });
  it("null for a photo without one, or something that isn't a JPEG", () => {
    expect(exifTakenAt(buf("photo-plain.jpg"))).toBeNull();
    expect(exifTakenAt(new TextEncoder().encode("not a jpeg").buffer)).toBeNull();
  });
});

describe("where on the route", () => {
  const track = [
    { lat: 10, lng: 20, t: 1000_000, speed: 1 },
    { lat: 10.01, lng: 20, t: 1010_000, speed: 1 },
    { lat: 11, lng: 21, t: 2000_000, speed: 1, gap: true }, // after a pause in tracking
  ];
  it("between two points: in proportion to the time", () => {
    expect(placeOnTrack(track, 1005_000)).toEqual({ lat: 10.005, lng: 20 });
  });
  it("across a pause: the nearer end, not a made-up spot in between", () => {
    expect(placeOnTrack(track, 1100_000)).toEqual({ lat: 10.01, lng: 20 });
    expect(placeOnTrack(track, 1990_000)).toEqual({ lat: 11, lng: 21 });
  });
  it("just before the start or after the end: those ends; long before or after: nowhere", () => {
    expect(placeOnTrack(track, 1000_000 - 60_000)).toEqual({ lat: 10, lng: 20 });
    expect(placeOnTrack(track, 2000_000 + 60_000)).toEqual({ lat: 11, lng: 21 });
    expect(placeOnTrack(track, 1000_000 - 3_600_000)).toBeNull();
    expect(placeOnTrack(track, null)).toBeNull();
    expect(placeOnTrack([], 1)).toBeNull();
  });
  it("placeMedia fills in only what has no place yet", () => {
    const out = placeMedia(
      [
        { id: "a", addedAt: 0, takenAt: 1005_000 },
        { id: "b", addedAt: 0, takenAt: 1005_000, lat: 1, lng: 2 },
        { id: "c", addedAt: 0, takenAt: 1 },
      ],
      track,
    );
    expect(out.map((m) => [m.lat, m.lng])).toEqual([[10.005, 20], [1, 2], [undefined, undefined]]);
  });
});

describe("making videos smaller", async () => {
  const { targetSize, needsShrink } = await import("../../src/services/videoShrink");
  it("720 on the short side, same shape, even numbers; small ones stay as they are", () => {
    expect(targetSize(3840, 2160)).toEqual({ width: 1280, height: 720 });
    expect(targetSize(1080, 1920)).toEqual({ width: 720, height: 1280 }); // upright
    expect(targetSize(1440, 1080)).toEqual({ width: 960, height: 720 });
    expect(targetSize(1280, 720)).toBeNull();
  });
  it("shrinks big or heavy videos and MOV; leaves small ones alone", () => {
    const mb = 1024 * 1024;
    expect(needsShrink({ width: 1920, height: 1080, bytes: 5 * mb, seconds: 10, mime: "video/mp4" })).toBe(true);
    expect(needsShrink({ width: 1280, height: 720, bytes: 60 * mb, seconds: 30, mime: "video/mp4" })).toBe(true); // 16 Mbit/s
    expect(needsShrink({ width: 1280, height: 720, bytes: 10 * mb, seconds: 30, mime: "video/mp4" })).toBe(false); // ~2.8 Mbit/s
    expect(needsShrink({ width: 640, height: 480, bytes: 1 * mb, seconds: 5, mime: "video/quicktime" })).toBe(true);
  });
});
