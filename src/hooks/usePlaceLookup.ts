import { useCallback, useRef, useState } from "react";
import { lookupPlace, type PlaceDetails, type PoiHint } from "../services/placeService";

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

  const close = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setTarget(null);
    setPlace(null);
    setError(null);
    setStatus("idle");
  }, []);

  return { target, place, status, error, open, close };
}
