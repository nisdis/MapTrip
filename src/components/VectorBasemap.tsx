import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  BASEMAP_ATTRIBUTION,
  loadEnglishStyle,
} from "../services/basemapStyle";

// The live MapLibre map, so a tap can ask which place icon is under it.
let activeMap: import("maplibre-gl").Map | null = null;

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

const FALLBACK_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const FALLBACK_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Base map with English labels. Raster tiles have their labels baked in (in the
 * local language), so this draws vector tiles and chooses the label text itself.
 * If the vector map can't load, it falls back to plain OpenStreetMap tiles.
 */
export function VectorBasemap() {
  const map = useMap();

  useEffect(() => {
    let cancelled = false;
    let layer: L.Layer | null = null;
    const controller = new AbortController();

    const useFallback = () => {
      if (cancelled) return;
      map.attributionControl.addAttribution(FALLBACK_ATTRIBUTION);
      layer = L.tileLayer(FALLBACK_URL, { maxZoom: 19 }).addTo(map);
    };

    (async () => {
      try {
        const [{ maplibreGL }, maplibre, worker, style] = await Promise.all([
          import("@maplibre/maplibre-gl-leaflet"),
          import("maplibre-gl"),
          // MapLibre v6 needs its worker bundled and pointed to explicitly.
          import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
          loadEnglishStyle(controller.signal),
        ]);
        if (cancelled) return;
        maplibre.setWorkerUrl(worker.default);
        map.attributionControl.addAttribution(BASEMAP_ATTRIBUTION);
        const gl = maplibreGL({ style }).addTo(map);
        layer = gl;
        activeMap = gl.getMaplibreMap();
      } catch (error) {
        if (cancelled) return;
        console.error("Vector basemap unavailable, using fallback:", error);
        useFallback();
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      activeMap = null;
      map.attributionControl.removeAttribution(BASEMAP_ATTRIBUTION);
      map.attributionControl.removeAttribution(FALLBACK_ATTRIBUTION);
      if (layer) map.removeLayer(layer);
    };
  }, [map]);

  return null;
}
