import { useCallback, useRef, useState } from "react";
import { lookupById, lookupPlace, type PlaceDetails, type PoiHint } from "../services/placeService";
import type { SavedPlaceSnapshot } from "../types/saved";

type Status = "idle" | "loading" | "ready" | "error";

/** Looks up details for a tapped spot. A newer tap cancels the one before it. */
export function usePlaceLookup() {
  const [target, setTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [place, setPlace] = useState<PlaceDetails | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const open = useCallback((lat: number, lng: number, hint: PoiHint | null, toleranceM: number) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setTarget({ lat: hint?.lat ?? lat, lng: hint?.lng ?? lng });
    setPlace(null);
    setError(null);
    setStatus("loading");
    lookupPlace(lat, lng, hint, toleranceM, ctrl.signal)
      .then((details) => {
        if (ctrl.signal.aborted) return;
        setPlace(details);
        setTarget({ lat: details.lat, lng: details.lng });
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted && !(e instanceof DOMException && e.name === "TimeoutError")) return;
        setError(
          navigator.onLine
            ? "Couldn't load details for this spot."
            : "You're offline, so details can't load.",
        );
        setStatus("error");
      });
  }, []);

  /**
   * Open a saved or shared place: show the stored copy at once (works offline),
   * then swap in fresh details (hours etc.) when they arrive.
   */
  const openKnown = useCallback((snap: SavedPlaceSnapshot) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const stored: PlaceDetails = {
      ...snap,
      cuisine: null,
      openingHours: null,
      phones: [],
      website: null,
      email: null,
      social: [],
      info: [],
      features: [],
      osmUrl: /^(node|way|relation)\//.test(snap.id) ? `https://www.openstreetmap.org/${snap.id}` : null,
      wikipedia: null,
      wikidata: null,
      expectsHours: false, // don't claim "Hours not listed" before the fresh lookup
    };
    setTarget({ lat: snap.lat, lng: snap.lng });
    setPlace(stored);
    setError(null);
    setStatus("ready");
    const fresh = /^(node|way|relation)\//.test(snap.id)
      ? lookupById(snap.id, ctrl.signal)
      : Promise.resolve(null);
    fresh
      .then((details) => {
        if (ctrl.signal.aborted || !details) return;
        // Keep the saved id so Save/Home/Work still match this place.
        setPlace({ ...details, id: snap.id });
      })
      .catch(() => undefined); // offline: the stored copy stays
  }, []);

  /** Show a place whose details are already known (e.g. from a nearby list). */
  const show = useCallback((details: PlaceDetails) => {
    controller.current?.abort();
    controller.current = null;
    setTarget({ lat: details.lat, lng: details.lng });
    setPlace(details);
    setError(null);
    setStatus("ready");
  }, []);

  const close = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setTarget(null);
    setPlace(null);
    setError(null);
    setStatus("idle");
  }, []);

  return { target, place, status, error, open, show, openKnown, close };
}
