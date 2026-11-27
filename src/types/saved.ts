/** What we keep about a saved place, so it shows (and works offline) without a lookup. */
export interface SavedPlaceSnapshot {
  /** "node/123", "way/45", "relation/6" or "pin/12.970000,77.600000" */
  id: string;
  name: string | null;
  category: string | null;
  address: string | null;
  lat: number;
  lng: number;
  countryCode: string | null;
}

export type SavedKind = "favourite" | "home" | "work" | "route";

/** A route saved from Directions (not a trip: it was worked out, not travelled). */
export interface SavedRoute {
  name: string;
  from: SavedPlaceSnapshot;
  to: SavedPlaceSnapshot;
  mode: "car" | "bike" | "foot";
  /** the route as drawn when saved (encoded polyline), shown at once and offline */
  path: string | null;
  distanceM: number | null;
  durationS: number | null;
}

export interface SavedEntry {
  /** "fav:<place id>", "route:<uuid>", "home" or "work" — one record per key */
  key: string;
  kind: SavedKind;
  /** "favourites", "routes", or null for Home/Work */
  list: string | null;
  /** the place; for a route, its destination */
  place: SavedPlaceSnapshot;
  /** routes only */
  route?: SavedRoute;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  /** Deletions are kept (as tombstones) so they sync to other devices. */
  deleted: boolean;
}

export const favouriteKey = (placeId: string) => `fav:${placeId}`;
export const routeKey = (id: string) => `route:${id}`;
