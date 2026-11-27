import { useEffect, useMemo } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { CELL_DEG, cellBounds } from "../../api/_lib/explored";

interface ExploredLayerProps {
  cells: string[];
}

/**
 * "Fog of war": the map is dimmed everywhere except the squares you've been
 * through. Drawn on canvas tiles, so thousands of squares stay quick; squares
 * too small to see at this zoom are drawn at least 2 px so they still show.
 */
export function ExploredLayer({ cells }: ExploredLayerProps) {
  const map = useMap();
  // Squares by row, for finding the ones on each tile quickly.
  const byRow = useMemo(() => {
    const rows = new Map<number, string[]>();
    for (const id of cells) {
      const row = Number(id.split(":")[0]);
      rows.set(row, [...(rows.get(row) ?? []), id]);
    }
    return rows;
  }, [cells]);

  useEffect(() => {
    const Fog = L.GridLayer.extend({
      createTile(this: L.GridLayer, coords: L.Coords) {
        const tile = document.createElement("canvas");
        const size = this.getTileSize();
        tile.width = size.x;
        tile.height = size.y;
        const ctx = tile.getContext("2d")!;
        ctx.fillStyle = "rgba(24, 32, 40, 0.55)";
        ctx.fillRect(0, 0, size.x, size.y);
        const nw = map.unproject(coords.scaleBy(size), coords.z);
        const se = map.unproject(coords.add([1, 1]).scaleBy(size), coords.z);
        const origin = coords.scaleBy(size);
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "#000";
        const r0 = Math.floor(se.lat / CELL_DEG) - 1;
        const r1 = Math.floor(nw.lat / CELL_DEG) + 1;
        for (let row = r0; row <= r1; row++) {
          for (const id of byRow.get(row) ?? []) {
            const [s, w, n, e] = cellBounds(id);
            if (e < nw.lng || w > se.lng) continue;
            const a = map.project([n, w], coords.z).subtract(origin);
            const b = map.project([s, e], coords.z).subtract(origin);
            const wpx = Math.max(2, b.x - a.x);
            const hpx = Math.max(2, b.y - a.y);
            ctx.fillRect(Math.floor(a.x), Math.floor(a.y), Math.ceil(wpx), Math.ceil(hpx));
          }
        }
        return tile;
      },
    });
    const layer = new (Fog as unknown as new (o: L.GridLayerOptions) => L.GridLayer)({ pane: "overlayPane", zIndex: 350 });
    layer.addTo(map);
    return () => {
      layer.remove();
    };
  }, [map, byRow]);

  return null;
}
