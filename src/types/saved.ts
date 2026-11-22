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

export type SavedKind = "favourite" | "home" | "work";

export interface SavedEntry {
  /** "fav:<place id>", "home" or "work" — one record per key */
  key: string;
  kind: SavedKind;
  /** Always "favourites" for now; kept so lists can be added later without migrating data. */
  list: string | null;
  place: SavedPlaceSnapshot;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  /** Deletions are kept (as tombstones) so they sync to other devices. */
  deleted: boolean;
}

export const favouriteKey = (placeId: string) => `fav:${placeId}`;
