import { useCallback, useState } from "react";
import type { TripPhoto } from "../types/trip";

const KEY = "recordingMedia";

function load(): TripPhoto[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Photos and videos added to the trip being recorded. Their files are already
 * on the device (photo store); this list is kept too, so a reload mid-trip
 * (the recording itself comes back from its draft) doesn't lose them.
 */
export function useRecordingMedia() {
  const [media, setMediaState] = useState<TripPhoto[]>(load);
  const setMedia = useCallback((next: TripPhoto[] | ((m: TripPhoto[]) => TripPhoto[])) => {
    setMediaState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      try {
        if (value.length) localStorage.setItem(KEY, JSON.stringify(value));
        else localStorage.removeItem(KEY);
      } catch {
        /* storage unavailable: kept for this session only */
      }
      return value;
    });
  }, []);
  return [media, setMedia] as const;
}
