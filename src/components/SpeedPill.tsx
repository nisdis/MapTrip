import { useEffect, useRef, useState } from "react";
import { Navigation2 } from "lucide-react";
import type { LocationData } from "../hooks/useLocationTracking";

const SHOW_KMH = 3; // appear once you're actually moving
const HIDE_AFTER_MS = 5000; // stay up through short stops (traffic lights) instead of blinking
const DETAILS_MS = 6000;

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (deg: number) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

/** A small speed readout that only appears while you're moving. Tap for heading and altitude. */
export function SpeedPill({ locationData }: { locationData: LocationData | null }) {
  const kmh = locationData ? Math.round(locationData.speed * 3.6) : 0;
  const [visible, setVisible] = useState(false);
  const [details, setDetails] = useState(false);
  const lastMoving = useRef(0);

  useEffect(() => {
    if (kmh >= SHOW_KMH) {
      lastMoving.current = Date.now();
      setVisible(true);
      return;
    }
    if (!visible) return;
    const t = setTimeout(() => {
      if (Date.now() - lastMoving.current >= HIDE_AFTER_MS) setVisible(false);
    }, HIDE_AFTER_MS);
    return () => clearTimeout(t);
  }, [kmh, visible]);

  useEffect(() => {
    if (!details) return;
    const t = setTimeout(() => setDetails(false), DETAILS_MS);
    return () => clearTimeout(t);
  }, [details]);

  if (!visible || !locationData) return null;
  const { heading, altitude } = locationData;

  return (
    <button
      type="button"
      onClick={() => setDetails((d) => !d)}
      aria-label={`Speed ${kmh} kilometres per hour. ${details ? "Hide" : "Show"} heading and altitude`}
      className="fixed bottom-[5.75rem] left-3 z-20 flex items-center gap-3 rounded-2xl bg-paper/95 px-3 py-2 font-hud text-asphalt shadow-lg backdrop-blur-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt"
    >
      <span className="flex items-baseline gap-1">
        <span className="min-w-[2ch] text-right text-2xl font-bold tabular-nums leading-none">{kmh}</span>
        <span className="text-xs text-asphalt/60">km/h</span>
      </span>
      {details && (
        <span className="flex items-center gap-3 border-l border-asphalt/15 pl-3 text-sm tabular-nums">
          <span className="flex items-center gap-1">
            <Navigation2
              aria-hidden
              className="h-4 w-4"
              style={{ transform: `rotate(${heading ?? 0}deg)`, opacity: heading == null ? 0.3 : 1 }}
            />
            {heading == null ? "–" : `${compass(heading)} ${Math.round(heading)}°`}
          </span>
          <span>{altitude == null ? "– m" : `${Math.round(altitude)} m`}</span>
        </span>
      )}
    </button>
  );
}
