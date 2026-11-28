import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MAX_VIDEO_BYTES, exifLocation, exifTakenAt, imageFormat, pinMedia, unreadablePhotoMessage, videoInfo, maxVideoLength, placeMedia, placeOnTrack, tooLongToFit, videoSizeProblem } from "../../src/utils/media";

const buf = (name: string) => {
  const b = readFileSync(new URL(`../e2e/media/${name}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

describe("when a photo was taken", () => {
  it("reads the camera's date from the photo", () => {
    expect(exifTakenAt(buf("photo-exif.jpg"))).toBe(new Date(2026, 10, 20, 10, 15, 30).getTime());
  });
  it("also from an iPhone (HEIC) photo", () => {
    expect(exifTakenAt(buf("photo-iphone.heic"))).toBe(new Date(2026, 10, 20, 10, 15, 30).getTime());
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

describe("how big a video may be", () => {
  const MB = 1024 * 1024;
  it("is limited by size (100 MB once shrunk), not by length", () => {
    expect(MAX_VIDEO_BYTES).toBe(100 * MB);
    expect(videoSizeProblem(99 * MB)).toBeNull();
    expect(videoSizeProblem(100 * MB)).toBeNull();
    expect(videoSizeProblem(101 * MB)).toBe(
      "That video is too large: it's 101 MB after shrinking, and videos can be up to 100 MB (about 2½ minutes). Try a shorter clip.",
    );
    expect(maxVideoLength()).toBe("about 2½ minutes");
  });
  it("doesn't try to shrink a video that can't fit even once shrunk", () => {
    expect(tooLongToFit(120, 500 * MB)).toBe(false); // 2 min of 4K: ~80 MB once shrunk
    expect(tooLongToFit(240, 900 * MB)).toBe(true); // 4 min: ~160 MB once shrunk
    expect(tooLongToFit(600, 60 * MB)).toBe(false); // 10 min, already small: kept as it is
  });
});

describe("what a photo file really is", () => {
  const bytes = (...parts: (string | number[])[]) =>
    new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p))).buffer;
  it("from its first bytes, whatever it's called", () => {
    expect(imageFormat(buf("photo-plain.jpg"))).toBe("jpeg");
    expect(imageFormat(buf("photo-iphone.heic"))).toBe("heic");
    expect(imageFormat(bytes([0, 0, 0, 24], "ftypheic", [0, 0, 0, 0]))).toBe("heic");
    expect(imageFormat(bytes([0, 0, 0, 24], "ftypmif1", [0, 0, 0, 0]))).toBe("heic");
    expect(imageFormat(bytes([0, 0, 0, 24], "ftypavif"))).toBe("avif");
    expect(imageFormat(bytes([0x89], "PNG"))).toBe("png");
    expect(imageFormat(new ArrayBuffer(0))).toBe("empty");
    expect(imageFormat(bytes("hello world"))).toBe("unknown");
  });
  it("says why it couldn't be opened", () => {
    expect(unreadablePhotoMessage("heic")).toMatch(/iPhone \(HEIC\)/);
    expect(unreadablePhotoMessage("empty")).toMatch(/download it/);
  });
});

describe("where a photo or video was taken, from its own data", () => {
  const goa = { lat: 15.4909, lng: 73.8278 };
  it("photos: the GPS the camera wrote (JPEG and iPhone HEIC)", () => {
    expect(exifLocation(buf("photo-gps.jpg"))).toEqual(goa);
    expect(exifLocation(buf("photo-iphone-gps.heic"))).toEqual(goa);
    expect(exifLocation(buf("photo-gps-sw.jpg"))).toEqual({ lat: -22.9068, lng: -43.1729 }); // south, west
  });
  it("photos without GPS, or not photos: none", () => {
    expect(exifLocation(buf("photo-exif.jpg"))).toBeNull();
    expect(exifLocation(buf("photo-iphone.heic"))).toBeNull();
    expect(exifLocation(new TextEncoder().encode("not a jpeg").buffer)).toBeNull();
  });
  it("videos: the place and time Android (MP4) and iPhone (MOV) write", async () => {
    const at = Date.UTC(2026, 10, 21, 4, 0, 0);
    expect(await videoInfo(new Blob([buf("clip-gps.mp4")]))).toEqual({ place: goa, takenAt: at });
    expect(await videoInfo(new Blob([buf("clip-iphone-gps.mov")]))).toEqual({ place: goa, takenAt: at });
  });
  it("videos without it (e.g. WebM): none", async () => {
    expect(await videoInfo(new Blob([buf("clip-2s.webm")]))).toEqual({ place: null, takenAt: null });
  });
});

describe("where media is pinned on the trip", () => {
  const track = [
    { lat: 10, lng: 20, t: 1000_000, speed: 1 },
    { lat: 10.01, lng: 20, t: 1010_000, speed: 1 },
  ];
  it("its own place first, then the route at that time, else the start of the trip", () => {
    const [own, onRoute, otherDay] = pinMedia(
      [
        { id: "a", addedAt: 0, takenAt: 5, lat: 15.49, lng: 73.83 },
        { id: "b", addedAt: 0, takenAt: 1005_000 },
        { id: "c", addedAt: 0, takenAt: 5 },
      ],
      track,
    );
    expect([own.lat, own.lng]).toEqual([15.49, 73.83]);
    expect([onRoute.lat, onRoute.lng]).toEqual([10.005, 20]);
    expect([otherDay.lat, otherDay.lng]).toEqual([10, 20]);
  });
});
