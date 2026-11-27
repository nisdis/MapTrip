import { useCallback, useEffect, useState } from "react";
import type { Trip } from "../types/trip";
import { accountCells, localCells, summarize, type Explored } from "../services/explored";

/**
 * The Explored map's data, worked out when asked for (opening it): squares
 * from this device's trips, plus the account's (other devices) when signed in.
 */
export function useExplored(trips: Trip[], signedIn: boolean, active: boolean) {
  const [data, setData] = useState<Explored | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const local = localCells(trips);
      const remote = signedIn ? await accountCells() : null;
      const all = remote ? [...new Set([...local, ...remote])] : local;
      setData(await summarize(all));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't work out your map");
    } finally {
      setLoading(false);
    }
  }, [trips, signedIn]);

  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  return { data, error, loading, refresh };
}
