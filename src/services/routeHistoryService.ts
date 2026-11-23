import type { SearchResult } from './searchService';

export interface RouteHistoryItem {
  id: string;
  origin: SearchResult;
  destination: SearchResult;
  timestamp: number;
}

const HISTORY_KEY = 'map_route_history';
/** Older versions also cached whole routes under this prefix; cleared on save. */
const LEGACY_ROUTE_CACHE_PREFIX = 'map_route_cache';
const MAX_HISTORY_ITEMS = 20;

const routeKey = (origin: SearchResult, destination: SearchResult) =>
  `${origin.location.join(',')}_${destination.location.join(',')}`;

export function saveRouteToHistory(origin: SearchResult, destination: SearchResult): void {
  // Same origin/destination replaces the older entry instead of duplicating it.
  const history = getRouteHistory().filter(
    (item) => routeKey(item.origin, item.destination) !== routeKey(origin, destination),
  );
  history.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    origin,
    destination,
    timestamp: Date.now(),
  });
  history.length = Math.min(history.length, MAX_HISTORY_ITEMS);

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    // Free space used by the old route cache.
    Object.keys(localStorage)
      .filter((k) => k.startsWith(LEGACY_ROUTE_CACHE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch (error) {
    // Storage full/unavailable (e.g. private mode): history is best-effort.
    console.error('Failed to save route history:', error);
  }
}

export function getRouteHistory(): RouteHistoryItem[] {
  try {
    const history = localStorage.getItem(HISTORY_KEY);
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error('Failed to parse route history:', error);
    return [];
  }
}

export function clearRouteHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}
