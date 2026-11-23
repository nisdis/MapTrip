import type { StyleSpecification } from "maplibre-gl";

// OpenFreeMap: free vector tiles built from OpenStreetMap, no API key.
export const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
/**
 * Same map data, dark colours (dark mode). "fiord" rather than OpenFreeMap's
 * "dark": its roads stand out from the background; "dark" was too low-contrast
 * to read on a phone.
 */
export const BASEMAP_DARK_STYLE_URL = "https://tiles.openfreemap.org/styles/fiord";

/** Dark mode: brighter names with a dark outline, so they read at a glance. */
export function brightenLabels(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.map((layer) => {
    if (layer.type !== "symbol" || !layer.layout?.["text-field"]) return layer;
    const paint = { ...(layer.paint ?? {}) } as Record<string, unknown>;
    const road = /road|street|highway|transportation/.test(layer.id);
    paint["text-color"] = road ? "#d4dde2" : "#eef3f1";
    paint["text-halo-color"] = "#1c2530";
    paint["text-halo-width"] = 1.6;
    return { ...layer, paint } as typeof layer;
  });
  return { ...style, layers };
}
export const BASEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> ' +
  '&copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

// English name if the map data has one, else the Latin-script name, else the local one.
// (The stock style prints the Latin name and then the native script underneath.)
const ENGLISH_FIRST = ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];

/** Rewrites every place/road/water name label to prefer English. */
export function makeEnglish(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.map((layer) => {
    const layout = (layer as { layout?: Record<string, unknown> }).layout;
    const textField = layout?.["text-field"];
    if (textField === undefined) return layer;
    const text = JSON.stringify(textField);
    // Only name labels; leave route numbers and other non-name text alone.
    if (!/name/.test(text)) return layer;
    return { ...layer, layout: { ...layout, "text-field": ENGLISH_FIRST } } as typeof layer;
  });
  return { ...style, layers };
}

export async function loadEnglishStyle(signal?: AbortSignal, theme: "light" | "dark" = "light"): Promise<StyleSpecification> {
  const response = await fetch(theme === "dark" ? BASEMAP_DARK_STYLE_URL : BASEMAP_STYLE_URL, { signal });
  if (!response.ok) throw new Error(`Basemap style failed: ${response.status}`);
  const english = makeEnglish((await response.json()) as StyleSpecification);
  return theme === "dark" ? brightenLabels(english) : english;
}
