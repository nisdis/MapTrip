import { useCallback, useEffect, useRef, useState } from "react";
import type { Trip } from "../types/trip";
import { hasUnsyncedPhotos, saveTripToCloud } from "../services/cloudTrips";

/** A trip that isn't (fully) in the account yet: never uploaded, or has new photos. */
export const needsSync = (t: Trip) => !t.cloudSyncedAt || hasUnsyncedPhotos(t);

/**
 * Signed in: every trip on this device goes to the account by itself (private),
 * with its photos. Runs on sign-in, shortly after a trip is saved or a photo
 * added, when the connection comes back, and when the app is reopened.
 * Offline it simply waits; nothing is lost.
 */
export function useTripSync(trips: Trip[], userId: string | null, persist: (t: Trip) => Promise<void>) {
  const [syncing, setSyncing] = useState(false);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const tripsRef = useRef(trips);
  tripsRef.current = trips;
  const persistRef = useRef(persist);
  persistRef.current = persist;
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
    try {
      // Oldest first, one at a time (photos can be large).
      const pending = tripsRef.current.filter(needsSync).sort((a, b) => a.createdAt - b.createdAt);
      for (const trip of pending) {
        if (!navigator.onLine) break;
        try {
          const saved = await saveTripToCloud(trip, userId);
          await persistRef.current(saved);
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
    } finally {
      running.current = false;
      setSyncing(false);
      if (again.current) {
        again.current = false;
        void sync();
      }
    }
  }, [userId]);

  // On sign-in, and shortly after trips change (a new trip, a new photo).
  const pendingCount = trips.filter(needsSync).length;
  useEffect(() => {
    if (!userId || pendingCount === 0) return;
    const t = setTimeout(() => void sync(), 1500);
    return () => clearTimeout(t);
  }, [userId, pendingCount, trips, sync]);

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

  return { syncing, pendingCount: userId ? pendingCount : 0, failed, sync };
}
