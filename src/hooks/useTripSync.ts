import { useCallback, useEffect, useRef, useState } from "react";
import type { Trip } from "../types/trip";
import {
  deleteCloudTrip,
  fetchCloudTrip,
  hasUnsyncedPhotos,
  listCloudTrips,
  pendingDeletes,
  renameCloudTrip,
  saveTripToCloud,
  unqueueDelete,
} from "../services/cloudTrips";

/** A trip that isn't (fully) in the account yet: never uploaded, new photos, or renamed here. */
export const needsSync = (t: Trip) =>
  !!t.renamed || (!t.summaryOnly && (!t.cloudSyncedAt || hasUnsyncedPhotos(t)));

/** Only the name is new: the account has everything else. */
const onlyRenamed = (t: Trip) => !!t.renamed && (!!t.summaryOnly || (!!t.cloudSyncedAt && !hasUnsyncedPhotos(t)));

/** Trips this account may upload: its own, and ones recorded while signed out. */
export const uploadsTo = (t: Trip, userId: string) => needsSync(t) && (!t.ownerId || t.ownerId === userId);

/** Renamed again while this copy was going up: keep that name (it goes up next). */
function keepNewerName(next: Trip, sent: Trip, current: Trip[]): Trip {
  const now = current.find((t) => t.id === sent.id);
  return now && now.name !== sent.name ? { ...next, name: now.name, renamed: true } : next;
}

export interface TripStoreOps {
  /** save without refreshing the list */
  save: (t: Trip) => Promise<void>;
  /** remove from this device (with its photos) without refreshing the list */
  remove: (t: Trip) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Signed in, the Trips list is the account's, on every device:
 * - up: trips on this device go to the account (private), with their photos;
 *   trips recorded while signed out join this account, but never trips
 *   recorded under another account;
 * - down: trips from other devices appear (as summaries; the track downloads
 *   when the trip is opened), and trips deleted elsewhere go;
 * - deletions made offline are sent.
 * Runs on sign-in, shortly after a trip is saved or a photo added, when the
 * connection comes back, and when the app is reopened. Offline it waits.
 */
export function useTripSync(trips: Trip[], userId: string | null, ops: TripStoreOps) {
  const [syncing, setSyncing] = useState(false);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const tripsRef = useRef(trips);
  tripsRef.current = trips;
  const opsRef = useRef(ops);
  opsRef.current = ops;
  const running = useRef(false);
  const again = useRef(false);

  const sync = useCallback(async () => {
    if (!userId || !navigator.onLine) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setSyncing(true);
    const { save, remove, refresh } = opsRef.current;
    let changed = false;
    try {
      // 1. Deletions made offline.
      for (const id of pendingDeletes()) {
        try {
          await deleteCloudTrip(id);
          unqueueDelete(id);
        } catch {
          break; // try again next time
        }
      }

      // 2. Up: oldest first, one at a time (photos can be large).
      const pending = tripsRef.current.filter((t) => uploadsTo(t, userId)).sort((a, b) => a.createdAt - b.createdAt);
      for (const trip of pending) {
        if (!navigator.onLine) break;
        try {
          if (onlyRenamed(trip)) {
            const at = await renameCloudTrip(trip.id, trip.name);
            const next: Trip = { ...trip, ownerId: userId };
            delete next.renamed;
            if (at != null) next.cloudSyncedAt = at;
            else if (!trip.summaryOnly) delete next.cloudSyncedAt; // gone from the account: upload it again next
            await save(keepNewerName(next, trip, tripsRef.current));
          } else {
            const saved = await saveTripToCloud(trip, userId);
            await save(keepNewerName({ ...saved, ownerId: userId }, trip, tripsRef.current));
          }
          changed = true;
          setFailed((f) => {
            if (!(trip.id in f)) return f;
            const next = { ...f };
            delete next[trip.id];
            return next;
          });
        } catch (e) {
          setFailed((f) => ({ ...f, [trip.id]: e instanceof Error ? e.message : "Couldn't sync" }));
          if (!navigator.onLine) break;
        }
      }
      if (changed) await refresh();

      // 3. Down: what the account has that this device doesn't, and the reverse.
      const cloud = await listCloudTrips();
      const deleting = new Set(pendingDeletes());
      const inCloud = new Map(cloud.map((t) => [t.id, t]));
      const local = new Map(tripsRef.current.map((t) => [t.id, t]));
      for (const c of cloud) {
        if (deleting.has(c.id)) continue;
        const l = local.get(c.id);
        if (!l) {
          await save({ ...c, ownerId: userId });
          changed = true;
        } else if (needsSync(l)) {
          continue; // this device has newer changes; they go up next time
        } else if ((c.cloudSyncedAt ?? 0) > (l.cloudSyncedAt ?? 0)) {
          // Changed on another device (renamed, photos added): take that copy.
          await save(l.summaryOnly ? { ...c, ownerId: userId } : { ...(await fetchCloudTrip(c.id)), ownerId: userId });
          changed = true;
        } else if (l.ownerId !== userId) {
          await save({ ...l, ownerId: userId }); // uploaded before trips knew their account
          changed = true;
        }
      }
      for (const l of tripsRef.current) {
        // In this account, fully synced, and no longer in the cloud: deleted on another device.
        if (l.kind === "recorded" && l.ownerId === userId && l.cloudSyncedAt && !needsSync(l) && !inCloud.has(l.id)) {
          await remove(l);
          changed = true;
        }
      }
    } catch (e) {
      console.error("Trip sync failed:", e);
    } finally {
      if (changed) await refresh();
      running.current = false;
      setSyncing(false);
      if (again.current) {
        again.current = false;
        void sync();
      }
    }
  }, [userId]);

  // On sign-in, and shortly after trips change (a new trip, a new photo).
  const pendingCount = userId ? trips.filter((t) => uploadsTo(t, userId)).length : 0;
  useEffect(() => {
    if (!userId) return;
    const t = setTimeout(() => void sync(), pendingCount ? 1500 : 0);
    return () => clearTimeout(t);
  }, [userId, pendingCount, sync]);

  // Back online, or back in the app.
  useEffect(() => {
    if (!userId) return;
    const onOnline = () => void sync();
    const onVisible = () => document.visibilityState === "visible" && void sync();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, sync]);

  return { syncing, pendingCount, failed, sync };
}
