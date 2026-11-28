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

/**
 * A whole city with its outskirts: Bangalore from the airport to Anekal is
 * ~66 km across (~1,100 tiles, ~55 MB); 100 km leaves room around it
 * (~2,600 tiles, 60-120 MB for a big city).
 */
export const MAX_AREA_KM = 100;
/** Average size of a vector tile, for the estimate shown before downloading (measured over Bangalore: ~48 KB). */
const AVG_TILE_BYTES = 50_000;
/** Waits between tries of one tile: a blip shouldn't throw away a big download. */
const RETRY_WAIT_MS = [0, 1_000, 3_000, 8_000];
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((ok, fail) => {
    if (!ms) return ok();
    const id = setTimeout(ok, ms);
    signal.addEventListener("abort", () => (clearTimeout(id), fail(new DOMException("Stopped", "AbortError"))), { once: true });
  });
const TILEJSON = "https://tiles.openfreemap.org/planet";
const STYLES = ["https://tiles.openfreemap.org/styles/liberty", "https://tiles.openfreemap.org/styles/fiord"];
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
  const est = estimateArea(bounds);
  if (est.tooBig) throw new Error(`Zoom in: an area can be at most ${MAX_AREA_KM} km across.`);
  // Room on the phone? (Browsers give a site a share of the free space.)
  try {
    const { quota, usage } = (await navigator.storage?.estimate?.()) ?? {};
    if (quota != null && usage != null && quota - usage < est.bytes * 1.2) {
      throw new Error(`Not enough space on this phone: this area needs about ${formatMB(est.bytes)}, and ${formatMB(Math.max(0, quota - usage))} is free for maps. Remove a saved area or choose a smaller one.`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Not enough space")) throw e;
  }
  // Ask the browser to keep it even when the phone runs low on space.
  void navigator.storage?.persist?.().catch(() => false);
  const template = await tileTemplate();
  const cache = await caches.open(SAVED_CACHE);
  const tiles = tilesFor(bounds);
  const keys: string[] = [];
  let bytes = 0;
  let done = 0;
  let next = 0;

  // What the map needs besides tiles (cached by the service worker as fetched).
  const extras = [...STYLES, TILEJSON, ...FONTS.flatMap((f) => [0, 256, 512, 768].map((r) => `https://tiles.openfreemap.org/fonts/${encodeURIComponent(f)}/${r}-${r + 255}.pbf`))];
  await Promise.all(extras.map((u) => fetch(u, { signal }).catch(() => undefined)));

  const worker = async () => {
    while (next < tiles.length) {
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      const [z, x, y] = tiles[next++];
      const url = template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
      let res: Response | null = null;
      for (let attempt = 0; attempt < RETRY_WAIT_MS.length && !res; attempt++) {
        await wait(RETRY_WAIT_MS[attempt], signal);
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
    // Remove what this download fetched, but not tiles an area already saved uses.
    const keep = new Set((await listAreas().catch(() => [])).flatMap((a) => a.tiles));
    await removeTiles(keys, keep);
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
