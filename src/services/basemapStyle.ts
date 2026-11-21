import type { StyleSpecification } from "maplibre-gl";

// OpenFreeMap: free vector tiles built from OpenStreetMap, no API key.
export const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
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

export async function loadEnglishStyle(signal?: AbortSignal): Promise<StyleSpecification> {
  const response = await fetch(BASEMAP_STYLE_URL, { signal });
  if (!response.ok) throw new Error(`Basemap style failed: ${response.status}`);
  return makeEnglish((await response.json()) as StyleSpecification);
}
