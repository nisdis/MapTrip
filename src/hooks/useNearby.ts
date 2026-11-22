import { useCallback, useRef, useState } from "react";
import {
  searchNearby,
  type Bounds,
  type NearbyCategory,
  type NearbyResult,
} from "../services/placeService";

type Status = "loading" | "ready" | "error";

export interface NearbyState {
  category: NearbyCategory;
  status: Status;
  results: NearbyResult[];
  error: string | null;
}

/** "Cafes near here" style listings for the visible map. */
export function useNearby() {
  const [state, setState] = useState<NearbyState | null>(null);
  const controller = useRef<AbortController | null>(null);

  const search = useCallback(
    (category: NearbyCategory, bounds: Bounds, from: { lat: number; lng: number }) => {
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      setState({ category, status: "loading", results: [], error: null });
      searchNearby(category, bounds, from, ctrl.signal)
        .then((results) => {
          if (!ctrl.signal.aborted) setState({ category, status: "ready", results, error: null });
        })
        .catch(() => {
          if (ctrl.signal.aborted) return;
          setState({
            category,
            status: "error",
            results: [],
            error: navigator.onLine
              ? `Couldn't load ${category.label.toLowerCase()} here. Try again.`
              : "You're offline, so places can't load.",
          });
        });
    },
    [],
  );

  const clear = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState(null);
  }, []);

  return { state, search, clear };
}
