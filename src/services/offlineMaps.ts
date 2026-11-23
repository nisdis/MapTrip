import localforage from "localforage";
import { SAVED_CACHE, savedTileKey, tilesFor } from "../sw/tiles";
import { haversine } from "../utils/geo";
import type { Bounds } from "./placeService";

// "Save this area": every map tile of the visible area, zoom 0-14, kept on the
// phone until removed. The service worker serves them when there's no signal.

export interface SavedArea {
  id: string;
  name: string;
  bounds: Bounds;
  /** tile keys "z/x/y" */
  tiles: string[];
  bytes: number;
  savedAt: number;
}

/** About a big city: larger areas get heavy for the phone and the free tile server. */
export const MAX_AREA_KM = 30;
/** Average size of a vector tile, for the estimate shown before downloading. */
const AVG_TILE_BYTES = 70_000;
const TILEJSON = "https://tiles.openfreemap.org/planet";
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
const FONTS = ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"];

const store = localforage.createInstance({ name: "record-my-trip", storeName: "offline_areas" });

export function areaSizeKm(b: Bounds): { widthKm: number; heightKm: number } {
  const mid = (b.north + b.south) / 2;
  return {
    widthKm: haversine({ lat: mid, lng: b.west }, { lat: mid, lng: b.east }) / 1000,
    heightKm: haversine({ lat: b.south, lng: b.west }, { lat: b.north, lng: b.west }) / 1000,
  };
}

export function estimateArea(b: Bounds) {
  const { widthKm, heightKm } = areaSizeKm(b);
  const tiles = tilesFor(b).length;
  return {
    widthKm,
    heightKm,
    tiles,
    bytes: tiles * AVG_TILE_BYTES,
    tooBig: widthKm > MAX_AREA_KM || heightKm > MAX_AREA_KM,
  };
}

export async function listAreas(): Promise<SavedArea[]> {
  const out: SavedArea[] = [];
  await store.iterate<SavedArea, void>((v) => void out.push(v));
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

/** The current tile address template (it contains OpenFreeMap's data version). */
async function tileTemplate(): Promise<string> {
  const res = await fetch(TILEJSON);
  if (!res.ok) throw new Error("The map server isn't answering. Try again later.");
  const body = (await res.json()) as { tiles?: string[] };
  if (!body.tiles?.[0]) throw new Error("Unexpected map server answer");
  return body.tiles[0];
}

/**
 * Downloads the area. Calls onProgress(done, total) as it goes; stop it with
 * the AbortSignal (what was fetched so far is removed again).
 */
export async function saveArea(
  name: string,
  bounds: Bounds,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<SavedArea> {
  if (!("caches" in window)) throw new Error("This browser can't store maps for offline use.");
  if (estimateArea(bounds).tooBig) throw new Error(`Zoom in: an area can be at most ${MAX_AREA_KM} km across.`);
  const template = await tileTemplate();
  const cache = await caches.open(SAVED_CACHE);
  const tiles = tilesFor(bounds);
  const keys: string[] = [];
  let bytes = 0;
  let done = 0;
  let next = 0;

  // What the map needs besides tiles (cached by the service worker as fetched).
  const extras = [STYLE, TILEJSON, ...FONTS.flatMap((f) => [0, 256, 512, 768].map((r) => `https://tiles.openfreemap.org/fonts/${encodeURIComponent(f)}/${r}-${r + 255}.pbf`))];
  await Promise.all(extras.map((u) => fetch(u, { signal }).catch(() => undefined)));

  const worker = async () => {
    while (next < tiles.length) {
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      const [z, x, y] = tiles[next++];
      const url = template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
      let res: Response | null = null;
      for (let attempt = 0; attempt < 3 && !res; attempt++) {
        try {
          const r = await fetch(url, { signal });
          if (r.ok || r.status === 204) res = r;
        } catch (e) {
          if (signal.aborted) throw e;
        }
      }
      if (!res) throw new Error("Download interrupted. Check your connection and try again.");
      const body = await res.arrayBuffer();
      bytes += body.byteLength;
      await cache.put(savedTileKey(z, x, y), new Response(body, { headers: { "Content-Type": "application/x-protobuf" } }));
      keys.push(`${z}/${x}/${y}`);
      onProgress(++done, tiles.length);
    }
  };
  try {
    // A few at a time: kind to the free tile server.
    await Promise.all([worker(), worker(), worker(), worker()]);
  } catch (e) {
    await removeTiles(keys);
    throw e;
  }
  const area: SavedArea = { id: crypto.randomUUID(), name: name.trim() || "Saved area", bounds, tiles: keys, bytes, savedAt: Date.now() };
  await store.setItem(area.id, area);
  return area;
}

/** Removes tiles no other saved area uses. */
async function removeTiles(keys: string[], keep = new Set<string>()) {
  const cache = await caches.open(SAVED_CACHE);
  await Promise.all(
    keys.filter((k) => !keep.has(k)).map((k) => {
      const [z, x, y] = k.split("/");
      return cache.delete(savedTileKey(z, x, y));
    }),
  );
}

export async function deleteArea(id: string): Promise<void> {
  const areas = await listAreas();
  const area = areas.find((a) => a.id === id);
  if (!area) return;
  const keep = new Set(areas.filter((a) => a.id !== id).flatMap((a) => a.tiles));
  await removeTiles(area.tiles, keep);
  await store.removeItem(id);
}

export const formatMB = (bytes: number) => `${Math.max(0.1, bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
