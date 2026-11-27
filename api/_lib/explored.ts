// The Explored map: the world as a grid of ~1 km squares, and which ones a
// trip passed through. No imports: used by both the web app and the server.

/** Square height in degrees (~1 km); widths shrink towards the poles so squares stay ~1 km wide. */
export const CELL_DEG = 0.009;
const SAMPLE_M = 200;
const M_PER_DEG = 111_320;

const lngStep = (row: number) => CELL_DEG / Math.max(0.01, Math.cos(((row + 0.5) * CELL_DEG * Math.PI) / 180));

/** The square a point is in, as "row:col". */
export function cellOf(lat: number, lng: number): string {
  const row = Math.floor(lat / CELL_DEG);
  return `${row}:${Math.floor(lng / lngStep(row))}`;
}

/** A square's edges: [south, west, north, east]. */
export function cellBounds(id: string): [number, number, number, number] {
  const [row, col] = id.split(":").map(Number);
  const w = lngStep(row);
  return [row * CELL_DEG, col * w, (row + 1) * CELL_DEG, (col + 1) * w];
}

export function cellCenter(id: string): [number, number] {
  const [s, w, n, e] = cellBounds(id);
  return [(s + n) / 2, (w + e) / 2];
}

interface P {
  lat: number;
  lng: number;
  speed?: number | null;
  alt?: number | null;
  gap?: boolean;
}

/** Flying over a place isn't exploring it: fast and high (a plane, not a train). */
const flying = (p: P) => (p.speed ?? 0) > 70 && (p.alt ?? 0) > 2000;

/**
 * Every square the recorded route passed through. Stretches without GPS
 * (dashed on the map) and flights don't count.
 */
export function cellsOfTrack(points: P[]): string[] {
  const cells = new Set<string>();
  for (let i = 0; i < points.length; i++) {
    const b = points[i];
    if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng) || flying(b)) continue;
    cells.add(cellOf(b.lat, b.lng));
    const a = points[i - 1];
    if (!a || b.gap || flying(a)) continue;
    // Fill in between, so a fast stretch with few points doesn't leave holes.
    const dy = (b.lat - a.lat) * M_PER_DEG;
    const dx = (b.lng - a.lng) * M_PER_DEG * Math.cos((a.lat * Math.PI) / 180);
    const steps = Math.min(5000, Math.floor(Math.hypot(dx, dy) / SAMPLE_M));
    for (let k = 1; k <= steps; k++) {
      const f = k / (steps + 1);
      cells.add(cellOf(a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f));
    }
  }
  return [...cells];
}

/** Squares to roughly km² (each is ~1 km²). */
export const cellsToKm2 = (n: number) => Math.round(n * (CELL_DEG * M_PER_DEG / 1000) ** 2);
