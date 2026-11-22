import { useCallback, useEffect, useRef, useState } from "react";
import type { SavedEntry } from "../types/saved";
import type { SavedApi } from "./useSaved";

export type SyncState = "idle" | "syncing" | "synced" | "error";

/**
 * Keeps Favourites/Home/Work in step with the signed-in account: syncs on
 * sign-in, shortly after each change, and when the connection comes back.
 */
export function useSavedSync(saved: SavedApi, userId: string | null) {
  const [state, setState] = useState<SyncState>("idle");
  const [error, setError] = useState<string | null>(null);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const running = useRef(false);
  const again = useRef(false);

  const sync = useCallback(async () => {
    if (!userId || !savedRef.current.loaded) return;
    if (running.current) {
      again.current = true; // a change arrived mid-sync: run once more after
      return;
    }
    running.current = true;
    setState("syncing");
    try {
      const res = await fetch("/api/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: savedRef.current.all }),
      });
      if (res.status === 401) throw new Error("signed out");
      if (!res.ok) throw new Error(`server ${res.status}`);
      const body = (await res.json()) as { entries: SavedEntry[] };
      const local = new Map(savedRef.current.all.map((e) => [e.key, e]));
      const newer = body.entries.filter((r) => !local.has(r.key) || r.updatedAt > local.get(r.key)!.updatedAt);
      await savedRef.current.applyRemote(newer);
      setState("synced");
      setError(null);
    } catch (e) {
      setState("error");
      setError(navigator.onLine ? (e instanceof Error ? e.message : "unknown error") : "you're offline");
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        void sync();
      }
    }
  }, [userId]);

  // On sign-in and once local data has loaded (merges anything saved before signing in).
  useEffect(() => {
    if (!userId) {
      setState("idle");
      return;
    }
    if (saved.loaded) void sync();
  }, [userId, saved.loaded, sync]);

  // Shortly after local changes.
  useEffect(() => {
    if (!userId || saved.revision === 0) return;
    const t = setTimeout(() => void sync(), 1500);
    return () => clearTimeout(t);
  }, [saved.revision, userId, sync]);

  // When the connection returns, or the app comes back to the foreground.
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

  return { state, error, sync };
}
