import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { setActiveMap } from "../services/basemapRegistry";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  BASEMAP_ATTRIBUTION,
  loadEnglishStyle,
} from "../services/basemapStyle";

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

    const showFallback = () => {
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
        setActiveMap(gl.getMaplibreMap());
      } catch (error) {
        if (cancelled) return;
        console.error("Vector basemap unavailable, using fallback:", error);
        showFallback();
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      setActiveMap(null);
      map.attributionControl.removeAttribution(BASEMAP_ATTRIBUTION);
      map.attributionControl.removeAttribution(FALLBACK_ATTRIBUTION);
      if (layer) map.removeLayer(layer);
    };
  }, [map]);

  return null;
}
