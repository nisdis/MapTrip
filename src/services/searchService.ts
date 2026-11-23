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

export async function searchPlaces(query: string): Promise<SearchResult[]> {
  // Check cache first
  // The country list is part of the cache key, so adding a country can't
  // surface stale results from before it was supported.
  const cacheKey = `search/${SEARCH_COUNTRIES.join("-")}/${encodeURIComponent(query)}`;
  const cachedResults = await getCachedResults(cacheKey);
  if (cachedResults) {
    return cachedResults;
  }

  try {
    // Shared, rate-limited client (search, directions fields and place lookups
    // all share Nominatim's one-request-per-second allowance).
    const data = await nominatimGet<NominatimResponse[]>(
      `/search?countrycodes=${SEARCH_COUNTRIES.join(",")}&format=json&q=${encodeURIComponent(query)}&limit=5`,
    );

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