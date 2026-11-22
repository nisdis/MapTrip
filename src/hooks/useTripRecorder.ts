import { useCallback, useEffect, useRef, useState } from "react";
import type { LocationData } from "./useLocationTracking";
import type { TrackPoint } from "../types/trip";
import { haversine } from "../utils/geo";
import { clearDraft, loadDraft, saveDraft, type TripDraft } from "../services/draftStore";

export type RecorderStatus = "idle" | "recording" | "paused" | "review";

const MIN_MOVE_M = 5; // ignore GPS jitter while standing still
const MAX_ACCURACY_M = 50; // ignore poor fixes
const MAX_PLAUSIBLE_MS = 100; // 360 km/h: anything faster is a GPS glitch
const DRAFT_SAVE_EVERY_MS = 4000;

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

export function useTripRecorder(locationData: LocationData | null) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [track, setTrack] = useState<TrackPoint[]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [maxSpeedMs, setMaxSpeedMs] = useState(0);
  const [speedMs, setSpeedMs] = useState(0);
  const [altitudeM, setAltitudeM] = useState<number | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [draft, setDraft] = useState<TripDraft | null>(null);

  const lastPoint = useRef<TrackPoint | null>(null);
  const lastFixTs = useRef(0);
  const pendingGap = useRef(false);
  const accumulatedMs = useRef(0);
  const segmentStart = useRef(0);

  const readActiveSeconds = useCallback(() => {
    const live = status === "recording" ? Date.now() - segmentStart.current : 0;
    return Math.round((accumulatedMs.current + live) / 1000);
  }, [status]);

  // Offer to recover a trip that was never finished (closed tab, dead battery).
  useEffect(() => {
    loadDraft()
      .then((d) => d && d.track.length > 1 && setDraft(d))
      .catch(() => undefined);
  }, []);

  // Turn each new GPS fix into a trail point.
  useEffect(() => {
    if (!locationData) return;
    setAccuracyM(locationData.accuracy);
    if (status !== "recording") return;
    if (locationData.timestamp === lastFixTs.current) return;
    lastFixTs.current = locationData.timestamp;
    if (locationData.accuracy > MAX_ACCURACY_M) return;

    const [lat, lng] = locationData.position;
    const prev = lastPoint.current;
    const t = locationData.timestamp;
    const moved = prev ? haversine(prev, { lat, lng }) : 0;
    const dt = prev ? (t - prev.t) / 1000 : 0;
    // Smoothed speed from the location hook. It no longer reads 0 just because this
    // fix is close to the last trail point (that made slow travel show 0).
    const speed = locationData.speed;
    if (speed > MAX_PLAUSIBLE_MS || dt < 0) return;

    setSpeedMs(speed);
    setAltitudeM(locationData.altitude);
    if (prev && moved < MIN_MOVE_M) return; // standing still: don't pile up points

    const point: TrackPoint = {
      lat: round(lat, 6),
      lng: round(lng, 6),
      t,
      speed: round(speed, 1),
      alt: locationData.altitude != null ? round(locationData.altitude, 1) : null,
      ...(pendingGap.current && prev === null ? { gap: true } : {}),
    };
    pendingGap.current = false;
    lastPoint.current = point;
    if (prev) setDistanceM((d) => d + moved);
    setMaxSpeedMs((m) => Math.max(m, speed));
    setTrack((pts) => [...pts, point]);
  }, [locationData, status]);

  // Active-time clock (excludes paused time).
  useEffect(() => {
    if (status !== "recording") return;
    const id = setInterval(() => setActiveSeconds(readActiveSeconds()), 1000);
    return () => clearInterval(id);
  }, [status, readActiveSeconds]);

  // Keep the screen awake while recording, or the phone stops delivering GPS.
  useEffect(() => {
    if (status !== "recording" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const l = await navigator.wakeLock.request("screen");
        if (cancelled) l.release().catch(() => undefined);
        else lock = l;
      } catch {
        /* denied or unsupported: recording still works */
      }
    };
    void acquire();
    const onVisible = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => undefined);
    };
  }, [status]);

  // Autosave a draft every few seconds, and whenever the page is hidden.
  const persistDraft = useCallback(() => {
    if (track.length < 2) return;
    void saveDraft({
      startedAt,
      track,
      distanceM,
      maxSpeedMs,
      activeSeconds: readActiveSeconds(),
      savedAt: Date.now(),
    }).catch(() => undefined);
  }, [track, startedAt, distanceM, maxSpeedMs, readActiveSeconds]);

  const lastDraftSave = useRef(0);
  useEffect(() => {
    if (status !== "recording" && status !== "paused") return;
    // At most one write every few seconds, so a crash loses seconds, not minutes.
    if (Date.now() - lastDraftSave.current >= DRAFT_SAVE_EVERY_MS) {
      lastDraftSave.current = Date.now();
      persistDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.length, status]);

  useEffect(() => {
    if (status !== "recording" && status !== "paused") return;
    const onHide = () => document.visibilityState === "hidden" && persistDraft();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [status, persistDraft]);

  const resetState = useCallback(() => {
    setTrack([]);
    setDistanceM(0);
    setMaxSpeedMs(0);
    setSpeedMs(0);
    setAltitudeM(null);
    setActiveSeconds(0);
    lastPoint.current = null;
    lastFixTs.current = 0;
    pendingGap.current = false;
    accumulatedMs.current = 0;
  }, []);

  const start = useCallback(() => {
    resetState();
    setDraft(null);
    void clearDraft();
    const now = Date.now();
    setStartedAt(now);
    segmentStart.current = now;
    setStatus("recording");
  }, [resetState]);

  const pause = useCallback(() => {
    accumulatedMs.current += Date.now() - segmentStart.current;
    setActiveSeconds(Math.round(accumulatedMs.current / 1000));
    setSpeedMs(0);
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    segmentStart.current = Date.now();
    lastPoint.current = null; // don't count the ground covered while paused
    pendingGap.current = true;
    setStatus("recording");
  }, []);

  const finish = useCallback(() => {
    if (status === "recording") {
      accumulatedMs.current += Date.now() - segmentStart.current;
    }
    setActiveSeconds(Math.round(accumulatedMs.current / 1000));
    setSpeedMs(0);
    setStatus("review");
  }, [status]);

  /** Leave the review screen (after saving or discarding) and drop the draft. */
  const reset = useCallback(() => {
    resetState();
    setDraft(null);
    void clearDraft();
    setStatus("idle");
  }, [resetState]);

  const restoreDraft = useCallback(() => {
    if (!draft) return;
    setTrack(draft.track);
    setDistanceM(draft.distanceM);
    setMaxSpeedMs(draft.maxSpeedMs);
    setActiveSeconds(draft.activeSeconds);
    setStartedAt(draft.startedAt);
    accumulatedMs.current = draft.activeSeconds * 1000;
    setStatus("review");
  }, [draft]);

  return {
    status,
    track,
    distanceM,
    maxSpeedMs,
    speedMs,
    altitudeM,
    accuracyM,
    activeSeconds,
    startedAt,
    draft,
    start,
    pause,
    resume,
    finish,
    reset,
    restoreDraft,
  };
}
