import type { SearchResult } from './searchService';

const CACHE_KEY_PREFIX = 'map_search_';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  timestamp: number;
  results: SearchResult[];
}

export function getCachedResults(query: string): SearchResult[] | null {
  const cacheKey = CACHE_KEY_PREFIX + query.toLowerCase();
  const cached = localStorage.getItem(cacheKey);
  
  if (!cached) return null;
  
  try {
    const { timestamp, results } = JSON.parse(cached) as CacheEntry;
    
    // Check if cache is expired
    if (Date.now() - timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    return results;
  } catch (error) {
    localStorage.removeItem(cacheKey);
    return null;
  }
}

export function cacheResults(query: string, results: SearchResult[]): void {
  const cacheKey = CACHE_KEY_PREFIX + query.toLowerCase();
  const cacheEntry: CacheEntry = {
    timestamp: Date.now(),
    results,
  };
  
  try {
    localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
  } catch (error) {
    // If localStorage is full, clear old cache entries
    clearOldCache();
    try {
      localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
    } catch {
      console.error('Failed to cache search results');
    }
  }
}

function clearOldCache(): void {
  const keys = Object.keys(localStorage);
  const searchCacheKeys = keys.filter(key => key.startsWith(CACHE_KEY_PREFIX));
  
  // Sort by timestamp and remove oldest entries
  const sortedEntries = searchCacheKeys
    .map(key => {
      try {
        const entry = JSON.parse(localStorage.getItem(key) || '');
        return { key, timestamp: entry.timestamp };
      } catch {
        return { key, timestamp: 0 };
      }
    })
    .sort((a, b) => a.timestamp - b.timestamp);
  
  // Remove the oldest 50% of entries
  sortedEntries
    .slice(0, Math.floor(sortedEntries.length / 2))
    .forEach(entry => localStorage.removeItem(entry.key));
}