// The live MapLibre map, so a tap can ask which place icon is under it.
let activeMap: import("maplibre-gl").Map | null = null;

/** Called by VectorBasemap when the vector map appears or goes away. */
export function setActiveMap(map: import("maplibre-gl").Map | null) {
  activeMap = map;
}

export interface TappedPoi {
  names: string[];
  kind?: string;
  lat: number;
  lng: number;
}

/** The place icon (cafe, shop, ...) nearest to a map position, if one is drawn there. */
export function queryPoiNear(lat: number, lng: number, radiusPx = 18): TappedPoi | null {
  const m = activeMap;
  if (!m) return null;
  try {
    const p = m.project([lng, lat]);
    const layers = m
      .getStyle()
      .layers.filter((l) => (l as { "source-layer"?: string })["source-layer"] === "poi")
      .map((l) => l.id);
    const features = m.queryRenderedFeatures(
      [
        [p.x - radiusPx, p.y - radiusPx],
        [p.x + radiusPx, p.y + radiusPx],
      ],
      { layers },
    );
    let best: { f: (typeof features)[number]; d: number } | null = null;
    for (const f of features) {
      if (f.geometry.type !== "Point") continue;
      const [fx, fy] = f.geometry.coordinates as [number, number];
      const fp = m.project([fx, fy]);
      const d = Math.hypot(fp.x - p.x, fp.y - p.y);
      if (!best || d < best.d) best = { f, d };
    }
    if (!best) return null;
    const props = best.f.properties as Record<string, string | undefined>;
    const names = [props.name_en, props["name:latin"], props.name].filter((n): n is string => !!n);
    if (!names.length) return null;
    const [fx, fy] = (best.f.geometry as GeoJSON.Point).coordinates;
    return { names, kind: props.subclass ?? props.class, lat: fy, lng: fx };
  } catch {
    return null;
  }
}

