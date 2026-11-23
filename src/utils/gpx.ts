import type { TrackPoint, Trip } from "../types/trip";
import { haversine } from "./geo";

// GPX 1.1: the common format for GPS tracks (Strava, Garmin, Google, Komoot…).

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** A recorded trip as GPX. A new segment starts wherever recording paused or GPS was lost. */
export function toGpx(trip: Trip): string {
  const segments: TrackPoint[][] = [];
  for (const p of trip.track ?? []) {
    if (p.gap || !segments.length) segments.push([]);
    segments[segments.length - 1].push(p);
  }
  const pt = (p: TrackPoint) =>
    `      <trkpt lat="${p.lat}" lon="${p.lng}">` +
    (p.alt != null ? `<ele>${p.alt}</ele>` : "") +
    `<time>${new Date(p.t).toISOString()}</time>` +
    `</trkpt>`;
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="Map Trip (map.recordmytrip.com)" xmlns="http://www.topografix.com/GPX/1/1">`,
    `  <metadata><name>${esc(trip.name)}</name><time>${new Date(trip.createdAt).toISOString()}</time></metadata>`,
    `  <trk>`,
    `    <name>${esc(trip.name)}</name>`,
    ...segments.map((seg) => [`    <trkseg>`, ...seg.map(pt), `    </trkseg>`].join("\n")),
    `  </trk>`,
    `</gpx>`,
    ``,
  ].join("\n");
}

export const gpxFileName = (trip: Trip) =>
  `${trip.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "trip"}.gpx`;

const MAX_POINTS = 50_000;

/**
 * A trip from a GPX file: track points (or, failing that, route points), one
 * segment after another. Times are kept when the file has them. Marked as
 * imported, so viewers can tell it wasn't recorded live in the app.
 */
export function parseGpx(text: string, fileName: string, id: string): Trip {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length || doc.documentElement?.localName !== "gpx") {
    throw new Error("That file isn't valid GPX.");
  }
  // By local name, whatever namespace prefix the file uses (GPX 1.0, 1.1, extensions).
  const byTag = (el: Document | Element, tag: string) =>
    Array.from(el.getElementsByTagName("*")).filter((e) => e.localName === tag);

  let segs = byTag(doc, "trkseg").map((s) => byTag(s, "trkpt"));
  if (!segs.some((s) => s.length)) segs = byTag(doc, "rte").map((r) => byTag(r, "rtept"));
  const raw = segs.flatMap((seg) =>
    seg.map((el, i) => {
      const lat = Number(el.getAttribute("lat"));
      const lng = Number(el.getAttribute("lon"));
      const time = byTag(el, "time")[0]?.textContent;
      const ele = byTag(el, "ele")[0]?.textContent;
      return { lat, lng, t: time ? Date.parse(time) : NaN, alt: ele != null && ele !== "" ? Number(ele) : null, first: i === 0 };
    }),
  );
  const pts = raw.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
  if (pts.length < 2) throw new Error("No track found in that file.");
  if (pts.length > MAX_POINTS) throw new Error(`That track is too long (over ${MAX_POINTS.toLocaleString()} points).`);

  const timed = pts.every((p) => Number.isFinite(p.t));
  const start = timed ? pts[0].t : Date.now();
  let distanceM = 0;
  const track: TrackPoint[] = pts.map((p, i) => {
    const prev = i > 0 ? pts[i - 1] : null;
    const d = prev && !p.first ? haversine(prev, p) : 0;
    distanceM += d;
    const dt = prev && timed ? (p.t - prev.t) / 1000 : 0;
    const speed = dt > 0 && d / dt < 100 ? Math.round((d / dt) * 10) / 10 : timed ? 0 : null;
    return {
      lat: Math.round(p.lat * 1e6) / 1e6,
      lng: Math.round(p.lng * 1e6) / 1e6,
      // Without times, points are spaced a second apart (order kept, no speeds).
      t: timed ? p.t : start + i * 1000,
      speed,
      alt: p.alt != null && Number.isFinite(p.alt) ? Math.round(p.alt * 10) / 10 : null,
      ...(i > 0 && p.first ? { gap: true } : {}),
    };
  });
  const nameEl = byTag(doc, "name")[0]?.textContent?.trim();
  return {
    id,
    name: (nameEl || fileName.replace(/\.gpx$/i, "")).slice(0, 80) || "Imported trip",
    kind: "recorded",
    createdAt: start,
    track,
    distanceM: Math.round(distanceM),
    durationS: timed ? Math.round((pts[pts.length - 1].t - start) / 1000) : 0,
    imported: true,
  };
}
