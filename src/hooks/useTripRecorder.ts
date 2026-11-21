import { useCallback, useEffect, useRef, useState } from "react";
import type { LocationData } from "./useLocationTracking";
import type { TrackPoint } from "../types/trip";
import { haversine } from "../utils/geo";

const MIN_MOVE_M = 5; // ignore GPS jitter
const MAX_ACCURACY_M = 50; // ignore poor fixes

export function useTripRecorder(locationData: LocationData | null) {
  const [isRecording, setIsRecording] = useState(false);
  const [track, setTrack] = useState<TrackPoint[]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [elapsedS, setElapsedS] = useState(0);
  const startedAt = useRef(0);
  const lastPoint = useRef<TrackPoint | null>(null);
  const lastFixTs = useRef(0);

  useEffect(() => {
    if (!isRecording || !locationData) return;
    // Only react to a new GPS fix, not to unrelated re-renders.
    if (locationData.timestamp === lastFixTs.current) return;
    lastFixTs.current = locationData.timestamp;
    if (locationData.accuracy > MAX_ACCURACY_M) return;

    const point: TrackPoint = {
      lat: locationData.position[0],
      lng: locationData.position[1],
      t: locationData.timestamp,
      speed: locationData.speed,
    };
    const prev = lastPoint.current;
    if (prev) {
      const d = haversine(prev, point);
      if (d < MIN_MOVE_M) return;
      setDistanceM((total) => total + d);
    }
    lastPoint.current = point;
    setTrack((pts) => [...pts, point]);
  }, [isRecording, locationData]);

  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(
      () => setElapsedS(Math.round((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [isRecording]);

  const start = useCallback(() => {
    startedAt.current = Date.now();
    lastPoint.current = null;
    lastFixTs.current = 0;
    setTrack([]);
    setDistanceM(0);
    setElapsedS(0);
    setIsRecording(true);
  }, []);

  /** Stops recording and returns what was captured. */
  const stop = useCallback(() => {
    setIsRecording(false);
    const durationS = Math.round((Date.now() - startedAt.current) / 1000);
    return { track, distanceM, durationS, startedAt: startedAt.current };
  }, [track, distanceM]);

  const discard = useCallback(() => {
    setIsRecording(false);
    setTrack([]);
    setDistanceM(0);
    setElapsedS(0);
  }, []);

  return { isRecording, track, distanceM, elapsedS, start, stop, discard };
}
