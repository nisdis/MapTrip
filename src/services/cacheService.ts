import type { SearchResult } from './searchService';

const CACHE_NAME = 'map-search-cache';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  timestamp: number;
  results: SearchResult[];
}

export async function getCachedResults(query: string): Promise<SearchResult[] | null> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(query);

    if (!response) return null;

    const data: CacheEntry = await response.json();

    // Check if cache is expired
    if (Date.now() - data.timestamp > CACHE_EXPIRY) {
      await cache.delete(query);
      return null;
    }

    return data.results;
  } catch (error) {
    console.error('Failed to get cached results:', error);
    return null;
  }
}

export async function cacheResults(query: string, results: SearchResult[]): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cacheEntry: CacheEntry = {
      timestamp: Date.now(),
      results,
    };

    const response = new Response(JSON.stringify(cacheEntry), {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    await cache.put(query, response);
  } catch (error) {
    console.error('Failed to cache search results:', error);
  }
}
