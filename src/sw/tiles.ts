// Shared by the service worker and the page: how map tiles are named and stored.

/** OpenFreeMap vector tiles: https://tiles.openfreemap.org/planet/<version>/<z>/<x>/<y>.pbf */
export const TILE_RE = /^https:\/\/tiles\.openfreemap\.org\/planet\/[^/]+\/(\d+)\/(\d+)\/(\d+)\.pbf$/;

/** Cache for "Save this area": kept until the area is removed, never expires. */
export const SAVED_CACHE = "saved-areas";

/**
 * Saved tiles are stored without OpenFreeMap's data version in the address,
 * so they keep working after it publishes a new version.
 */
export const savedTileKey = (z: number | string, x: number | string, y: number | string) =>
  `https://saved-tiles.invalid/${z}/${x}/${y}.pbf`;

/** Vector tiles only go to zoom 14; the map draws closer zooms from them. */
export const MAX_TILE_ZOOM = 14;

/** Tile x/y containing a point at zoom z (Web Mercator). */
export function tileXY(lat: number, lng: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))];
}

/** Every tile covering the box, zoom 0..maxZoom. */
export function tilesFor(
  b: { south: number; west: number; north: number; east: number },
  maxZoom = MAX_TILE_ZOOM,
): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let z = 0; z <= maxZoom; z++) {
    const [x0, y0] = tileXY(b.north, b.west, z);
    const [x1, y1] = tileXY(b.south, b.east, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
  }
  return out;
}
