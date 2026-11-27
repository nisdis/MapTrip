import { LatLngTuple } from 'leaflet';
import { getCachedResults, cacheResults } from './cacheService';
import { nominatimGet } from './nominatimClient';

export interface SearchResult {
  id: number;
  name: string;
  displayName: string;
  location: LatLngTuple;
  type: string;
  importance: number;
}

interface NominatimResponse {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  importance: number;
  name?: string;
}

/**
 * Countries that search covers (ISO 3166-1 alpha-2). Directions use a worldwide
 * routing server, so this is the only list to extend to support a new country.
 */
export const SEARCH_COUNTRIES = ["in", "jp"] as const;

/** How far around `near` counts as nearby (degrees; ~30 km). */
const NEAR_DEG = 0.25;

/**
 * Places matching `query`. With `near`, places around that point come first
 * (only those, when there are any), closest first; otherwise anywhere in the
 * supported countries.
 */
export async function searchPlaces(query: string, near?: [number, number] | null): Promise<SearchResult[]> {
  // Check cache first
  // The country list is part of the cache key, so adding a country can't
  // surface stale results from before it was supported.
  const area = near ? `@${near[0].toFixed(1)},${near[1].toFixed(1)}` : "";
  const cacheKey = `search/${SEARCH_COUNTRIES.join("-")}/${encodeURIComponent(query)}${area}`;
  const cachedResults = await getCachedResults(cacheKey);
  if (cachedResults) {
    return cachedResults;
  }

  try {
    // Shared, rate-limited client (search, directions fields and place lookups
    // all share Nominatim's one-request-per-second allowance).
    const base = `/search?countrycodes=${SEARCH_COUNTRIES.join(",")}&format=json&q=${encodeURIComponent(query)}&limit=5`;
    let data: NominatimResponse[] = [];
    if (near) {
      const [lat, lng] = near;
      const box = [lng - NEAR_DEG, lat + NEAR_DEG, lng + NEAR_DEG, lat - NEAR_DEG].map((v) => v.toFixed(4)).join(",");
      data = await nominatimGet<NominatimResponse[]>(`${base}&viewbox=${box}&bounded=1`);
    }
    // Nothing nearby (or no reference point): anywhere.
    if (!data.length) data = await nominatimGet<NominatimResponse[]>(base);
    if (near) {
      const d = (i: NominatimResponse) => (parseFloat(i.lat) - near[0]) ** 2 + ((parseFloat(i.lon) - near[1]) * Math.cos((near[0] * Math.PI) / 180)) ** 2;
      data = [...data].sort((a, b) => d(a) - d(b));
    }

    const results = data.map((item) => ({
      id: item.place_id,
      name: item.name || item.display_name.split(',')[0],
      displayName: item.display_name,
      location: [parseFloat(item.lat), parseFloat(item.lon)] as LatLngTuple,
      type: item.type,
      importance: item.importance,
    }));

    // Cache the results
    await cacheResults(cacheKey, results);

    return results;
  } catch (error) {
    console.error('Search failed:', error);

    // If offline and no cached results, return empty array
    if (!navigator.onLine) return [];

    throw error;
  }
}