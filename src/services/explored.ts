import localforage from "localforage";
import { feature } from "topojson-client";
import type { Trip } from "../types/trip";
import { cellCenter, cellsOfTrack } from "../../api/_lib/explored";

// The Explored map's numbers: squares from your trips (this device's, plus the
// account's from other devices), and the countries and regions they're in.
// Borders download once (then work offline); each square's place is worked out
// once on this device and remembered.

type Ring = [number, number][];
interface Area {
  code: string;
  name: string;
  /** regions: the country they're in */
  country?: string;
  bbox: [number, number, number, number]; // west, south, east, north
  polygons: Ring[][]; // each: outer ring, then holes ([lng, lat])
}

const BORDERS_VERSION = 2;
let borders: Promise<{ countries: Area[]; regions: Area[]; names: Map<string, string> }> | null = null;

function toAreas(geojson: { features: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } | null }[] }): Area[] {
  const out: Area[] = [];
  for (const f of geojson.features) {
    if (!f.geometry) continue;
    const polygons = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][];
    let w = 180, s = 90, e = -180, n = -90;
    for (const poly of polygons)
      for (const [x, y] of poly[0]) {
        if (x < w) w = x;
        if (x > e) e = x;
        if (y < s) s = y;
        if (y > n) n = y;
      }
    out.push({ code: f.properties.code, name: f.properties.name, country: f.properties.country, bbox: [w, s, e, n], polygons });
  }
  return out;
}

export function loadBorders() {
  borders ??= (async () => {
    const get = async (name: string) => {
      const res = await fetch(`/borders/${name}.json?v=${BORDERS_VERSION}`);
      if (!res.ok) throw new Error("Couldn't download the world borders");
      // TopoJSON (shared borders stored once: about half the download).
      const topo = (await res.json()) as Parameters<typeof feature>[0];
      return toAreas(feature(topo, topo.objects[Object.keys(topo.objects)[0]]) as unknown as Parameters<typeof toAreas>[0]);
    };
    const [countries, regions] = await Promise.all([get("countries"), get("regions")]);
    return { countries, regions, names: new Map(countries.map((c) => [c.code, c.name])) };
  })().catch((e) => {
    borders = null; // try again next time (offline the first time)
    throw e;
  });
  return borders;
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function contains(a: Area, lat: number, lng: number): boolean {
  const [w, s, e, n] = a.bbox;
  if (lng < w || lng > e || lat < s || lat > n) return false;
  return a.polygons.some((p) => inRing(lng, lat, p[0]) && !p.slice(1).some((hole) => inRing(lng, lat, hole)));
}

export interface Place {
  country: { code: string; name: string } | null;
  region: { code: string; name: string } | null;
}

/** The country and region a point is in (null at sea, or between simplified borders). */
export async function placeAt(lat: number, lng: number): Promise<Place> {
  const { countries, regions, names } = await loadBorders();
  // States/provinces are the more detailed borders, so they decide the country too.
  const r = regions.find((a) => contains(a, lat, lng));
  if (r?.country) return { country: { code: r.country, name: names.get(r.country) ?? r.country }, region: { code: r.code, name: r.name } };
  const c = countries.find((a) => contains(a, lat, lng));
  return { country: c ? { code: c.code, name: c.name } : null, region: null };
}

/** How close to a border's coastline a square on "sea" still counts as that land. */
const COAST_M = 3000;

/** Metres from a point to the nearest edge of an area (flat approximation; fine at this scale). */
function distanceTo(a: Area, lat: number, lng: number): number {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110_574;
  let best = Infinity;
  for (const poly of a.polygons)
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++) {
        const ax = (ring[i - 1][0] - lng) * kx, ay = (ring[i - 1][1] - lat) * ky;
        const bx = (ring[i][0] - lng) * kx, by = (ring[i][1] - lat) * ky;
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
        best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
      }
  return best;
}

/**
 * A square's place: where its middle is; on a coast, the nearest land within
 * ~3 km. The borders' coastlines are approximate (to about a kilometre), and
 * a waterfront walk shouldn't read as "at sea".
 */
export async function placeOfCell(id: string): Promise<Place> {
  const [lat, lng] = cellCenter(id);
  const here = await placeAt(lat, lng);
  if (here.country) return here;
  const { regions, names } = await loadBorders();
  const dLat = COAST_M / 110_574;
  const dLng = COAST_M / (111_320 * Math.cos((lat * Math.PI) / 180));
  let best: Area | null = null;
  let bestD = COAST_M;
  for (const r of regions) {
    const [w, s, e, n] = r.bbox;
    if (lng < w - dLng || lng > e + dLng || lat < s - dLat || lat > n + dLat) continue;
    const d = distanceTo(r, lat, lng);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best?.country
    ? { country: { code: best.country, name: names.get(best.country) ?? best.country }, region: { code: best.code, name: best.name } }
    : here;
}

// Each square's place, worked out once.
const placeStore = localforage.createInstance({ name: "record-my-trip", storeName: "explored-places" });

export interface Explored {
  cells: string[];
  countries: { code: string; name: string; regions: { code: string; name: string; squares: number }[]; squares: number }[];
  regionCount: number;
}

/** Squares from trips on this device (with their tracks). */
export function localCells(trips: Trip[]): string[] {
  const all = new Set<string>();
  for (const t of trips) if (t.kind === "recorded" && t.track) for (const c of cellsOfTrack(t.track)) all.add(c);
  return [...all];
}

/** The account's squares (all its devices); null when signed out or offline. */
export async function accountCells(): Promise<string[] | null> {
  try {
    const res = await fetch("/api/trips?explored=1");
    if (!res.ok) return null;
    return ((await res.json()) as { cells: string[] }).cells;
  } catch {
    return null;
  }
}

export async function summarize(cells: string[]): Promise<Explored> {
  const countries = new Map<string, Explored["countries"][number]>();
  const regions = new Map<string, { code: string; name: string; squares: number }>();
  for (const id of cells) {
    let p = await placeStore.getItem<Place>(id).catch(() => null);
    if (!p) {
      p = await placeOfCell(id);
      void placeStore.setItem(id, p).catch(() => undefined);
    }
    if (!p.country) continue;
    const c = countries.get(p.country.code) ?? { ...p.country, regions: [], squares: 0 };
    c.squares += 1;
    countries.set(p.country.code, c);
    if (p.region) {
      const r = regions.get(p.region.code) ?? { ...p.region, squares: 0 };
      if (r.squares === 0) c.regions.push(r);
      r.squares += 1;
      regions.set(p.region.code, r);
    }
  }
  const list = [...countries.values()].sort((a, b) => b.squares - a.squares);
  for (const c of list) c.regions.sort((a, b) => b.squares - a.squares);
  return { cells, countries: list, regionCount: regions.size };
}
