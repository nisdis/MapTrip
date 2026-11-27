// Rules for sharing finished trips (no database, no requests): what a viewer
// may see of a trip, and the small checks around it. Kept pure for testing.

import { createHash } from "node:crypto";
import { haversineM } from "./live.js";
import { decodeTrack } from "./trackFormat.js";

export type Visibility = "private" | "unlisted" | "public";
export const VISIBILITIES: Visibility[] = ["private", "unlisted", "public"];

/** How much of the start and end is hidden, in metres. 0 = nothing (owner's choice, with a warning). */
export const HIDE_OPTIONS = [0, 300, 500, 1000] as const;
export const DEFAULT_HIDE_M = 500;

export interface SharePoint {
  lat: number;
  lng: number;
  t: number;
  speed: number | null;
  gap?: boolean;
}

/** Owner's sharing choices, stored in trips.share */
export interface ShareSettings {
  hideM: number;
  /** ids of the photos the owner ticked */
  photos: string[];
}

export function cleanSettings(raw: unknown, photoIds: string[]): ShareSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const hideM = HIDE_OPTIONS.includes(r.hideM as (typeof HIDE_OPTIONS)[number]) ? (r.hideM as number) : DEFAULT_HIDE_M;
  const ticked = Array.isArray(r.photos) ? r.photos.filter((p): p is string => typeof p === "string") : [];
  // Only photos that belong to this trip, each once.
  const photos = [...new Set(ticked)].filter((id) => photoIds.includes(id)).slice(0, 30);
  return { hideM, photos };
}

/** Points from the stored trip, validated (the data comes from the owner's device). */
export function pointsOf(data: unknown): SharePoint[] {
  return decodeTrack((data as { track?: unknown })?.track).map(({ lat, lng, t, speed, gap }) => ({
    lat,
    lng,
    t,
    speed,
    ...(gap ? { gap: true } : {}),
  }));
}

/**
 * What viewers see: every point within `hideM` of the start or of the end is
 * removed (also where the route passes near them mid-trip), and the line is
 * broken wherever something was removed.
 */
export function trimEnds(points: SharePoint[], hideM: number): SharePoint[] {
  if (!points.length || hideM <= 0) return points;
  const a: [number, number] = [points[0].lat, points[0].lng];
  const b: [number, number] = [points[points.length - 1].lat, points[points.length - 1].lng];
  const out: SharePoint[] = [];
  let hidden = false;
  for (const p of points) {
    const here: [number, number] = [p.lat, p.lng];
    if (haversineM(a, here) < hideM || haversineM(b, here) < hideM) {
      hidden = true;
      continue;
    }
    out.push(hidden && out.length ? { ...p, gap: true } : p);
    hidden = false;
  }
  return out;
}

export function bboxOf(points: SharePoint[]): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
  if (!points.length) return null;
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return { minLat, maxLat, minLng, maxLng };
}

/** At most `max` points, evenly spaced, keeping the first, the last and every line break. */
export function simplify(points: SharePoint[], max: number): SharePoint[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const keep = new Set<number>([0, points.length - 1]);
  for (let i = 0; i < max; i++) keep.add(Math.floor(i * step));
  points.forEach((p, i) => p.gap && keep.add(i));
  return [...keep].sort((x, y) => x - y).map((i) => points[i]);
}

/** Public stats. Distance and time don't reveal where; the date is shown, not the time of day. */
export function statsOf(data: unknown, points: SharePoint[]) {
  const d = (data ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const maxSpeedMs = points.reduce((m, p) => Math.max(m, p.speed ?? 0), 0);
  return {
    distanceM: num(d.distanceM),
    durationS: num(d.durationS),
    maxSpeedMs: Math.min(maxSpeedMs, 340), // ~1,220 km/h: a plane, at most
    date: new Date(num(d.createdAt)).toISOString().slice(0, 10),
  };
}

/** A public name: 2–40 visible characters, no links or email addresses. */
export function cleanDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 40) return null;
  if (/@|https?:|www\.|\.(com|net|org|in|io)\b/i.test(name)) return null;
  return name;
}

export const REPORT_REASONS = ["home", "person", "spam", "offensive", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
/** Reports from this many different accounts take a trip out of Explore until reviewed. */
export const HIDE_AFTER_REPORTS = 3;

export function isAdmin(email: string | null | undefined, adminEmails = process.env.ADMIN_EMAILS ?? ""): boolean {
  if (!email) return false;
  const list = adminEmails.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

/**
 * Counts a viewer once per trip per day without storing who they are: a
 * one-way hash of address + browser + day (rows are deleted after 2 days).
 */
export function viewerKey(ip: string, userAgent: string, day: string, secret = process.env.BETTER_AUTH_SECRET ?? "") {
  return createHash("sha256").update(`${secret}|${day}|${ip}|${userAgent}`).digest("base64url").slice(0, 22);
}

/**
 * JPEG without its metadata (EXIF incl. GPS position, XMP, comments): drops
 * APP1–APP15 and COM segments. Photos are re-encoded on the phone already;
 * this makes sure for anything shared publicly.
 */
export function stripJpegMetadata(buf: Uint8Array): Uint8Array {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf; // not a JPEG
  const parts: Uint8Array[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return buf; // unexpected: leave it as is
    const marker = buf[i + 1];
    if (marker === 0xda) {
      parts.push(buf.subarray(i)); // start of image data: keep the rest
      break;
    }
    const len = (buf[i + 2] << 8) | buf[i + 3];
    const end = i + 2 + len;
    if (len < 2 || end > buf.length) return buf;
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) parts.push(buf.subarray(i, end));
    i = end;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
