import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  favouriteKey,
  routeKey,
  type SavedEntry,
  type SavedKind,
  type SavedPlaceSnapshot,
  type SavedRoute,
} from "../types/saved";
import { listSavedEntries, putSavedEntries } from "../services/savedStore";
import type { PlaceDetails } from "../services/placeService";

export function snapshotOf(place: PlaceDetails): SavedPlaceSnapshot {
  return {
    id: place.id,
    name: place.name,
    category: place.category,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    countryCode: place.countryCode,
  };
}

/** Favourites, Home and Work: stored on the device. (Cloud sync is added by useSavedSync.) */
export function useSaved() {
  const [entries, setEntries] = useState<SavedEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  /** Bumped on every local change; the sync hook listens to it. */
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    listSavedEntries()
      .then((e) => setEntries(e))
      .catch((err) => console.error("Failed to load saved places:", err))
      .finally(() => setLoaded(true));
  }, []);

  const write = useCallback(async (changed: SavedEntry[], fromSync = false) => {
    if (!changed.length) return;
    setEntries((prev) => {
      const map = new Map(prev.map((e) => [e.key, e]));
      for (const e of changed) map.set(e.key, e);
      return [...map.values()];
    });
    try {
      await putSavedEntries(changed);
    } catch (err) {
      console.error("Failed to store saved places:", err);
    }
    if (!fromSync) setRevision((r) => r + 1);
  }, []);

  const live = useMemo(() => entries.filter((e) => !e.deleted), [entries]);
  const favourites = useMemo(
    () => live.filter((e) => e.kind === "favourite").sort((a, b) => b.createdAt - a.createdAt),
    [live],
  );
  const routes = useMemo(
    () => live.filter((e) => e.kind === "route" && e.route).sort((a, b) => b.createdAt - a.createdAt),
    [live],
  );
  const home = live.find((e) => e.kind === "home") ?? null;
  const work = live.find((e) => e.kind === "work") ?? null;

  const isFavourite = useCallback(
    (placeId: string) => live.some((e) => e.key === favouriteKey(placeId)),
    [live],
  );

  const upsert = useCallback(
    (key: string, kind: SavedKind, place: SavedPlaceSnapshot, patch: Partial<SavedEntry> = {}) => {
      const now = Date.now();
      const existing = entriesRef.current.find((e) => e.key === key);
      const next: SavedEntry = {
        key,
        kind,
        list: kind === "favourite" ? "favourites" : kind === "route" ? "routes" : null,
        place,
        note: existing && !existing.deleted ? existing.note : null,
        createdAt: existing && !existing.deleted ? existing.createdAt : now,
        updatedAt: Math.max(now, (existing?.updatedAt ?? 0) + 1),
        deleted: false,
        ...patch,
      };
      return write([next]);
    },
    [write],
  );

  const remove = useCallback(
    (key: string) => {
      const existing = entriesRef.current.find((e) => e.key === key);
      if (!existing || existing.deleted) return Promise.resolve();
      return write([{ ...existing, deleted: true, updatedAt: Math.max(Date.now(), existing.updatedAt + 1) }]);
    },
    [write],
  );

  /**
   * Save or unsave explicitly. The caller passes what the button showed, so a
   * sync landing a moment before the tap can't flip "Save" into "remove".
   */
  const setFavourite = useCallback(
    (place: SavedPlaceSnapshot, on: boolean) =>
      on ? upsert(favouriteKey(place.id), "favourite", place) : remove(favouriteKey(place.id)),
    [remove, upsert],
  );

  const setLabel = useCallback(
    (kind: "home" | "work", place: SavedPlaceSnapshot | null) =>
      place ? upsert(kind, kind, place, { note: null }) : remove(kind),
    [remove, upsert],
  );

  /** Saves a route from Directions; returns its key. */
  const saveRoute = useCallback(
    async (route: SavedRoute, id: string = crypto.randomUUID()) => {
      const key = routeKey(id);
      await upsert(key, "route", route.to, { route });
      return key;
    },
    [upsert],
  );

  const setNote = useCallback(
    (key: string, note: string) => {
      const existing = entriesRef.current.find((e) => e.key === key && !e.deleted);
      if (!existing) return Promise.resolve();
      const trimmed = note.trim().slice(0, 500);
      return write([
        { ...existing, note: trimmed || null, updatedAt: Math.max(Date.now(), existing.updatedAt + 1) },
      ]);
    },
    [write],
  );

  return {
    loaded,
    /** Every record, including deletions (for sync). */
    all: entries,
    favourites,
    routes,
    saveRoute,
    home,
    work,
    revision,
    isFavourite,
    setFavourite,
    setLabel,
    setNote,
    remove,
    /** Apply records that came from the cloud (doesn't trigger another sync). */
    applyRemote: (changed: SavedEntry[]) => write(changed, true),
  };
}

export type SavedApi = ReturnType<typeof useSaved>;
