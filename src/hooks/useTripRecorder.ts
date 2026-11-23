import { useCallback, useEffect, useRef, useState } from "react";
import type { FixListener, LocationData } from "./useLocationTracking";
import type { TrackGap, TrackPoint } from "../types/trip";
import { routePath } from "../services/routeService";
import { haversine } from "../utils/geo";
import { clearDraft, loadDraft, saveDraft, type TripDraft } from "../services/draftStore";
import { isInApp } from "../services/appBridge";

export type RecorderStatus = "idle" | "recording" | "paused" | "review";

const MIN_MOVE_M = 5; // ignore GPS jitter while standing still
const MAX_ACCURACY_M = 50; // ignore poor fixes
const MAX_PLAUSIBLE_MS = 100; // 360 km/h: anything faster is a GPS glitch
const DRAFT_SAVE_EVERY_MS = 4000;
// No fixes for this long, then a jump of at least GAP_MIN_M, means tracking was
// paused (screen off / app in background) rather than you standing still.
const GAP_MS = 15000;
const GAP_MIN_M = 50;

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

export function useTripRecorder(subscribe: (listener: FixListener) => () => void) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [track, setTrack] = useState<TrackPoint[]>([]);
  const [gaps, setGaps] = useState<TrackGap[]>([]);
  const lastSeenFixAt = useRef(0);
  const [distanceM, setDistanceM] = useState(0);
  const [maxSpeedMs, setMaxSpeedMs] = useState(0);
  const [speedMs, setSpeedMs] = useState(0);
  const [altitudeM, setAltitudeM] = useState<number | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [draft, setDraft] = useState<TripDraft | null>(null);

  const statusRef = useRef(status);
  statusRef.current = status;
  // Track length as of the last fix processed (ahead of the state during a batch).
  const trackLen = useRef(0);
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

  // Turn GPS fixes into trail points. Fixes come in batches: usually one, but
  // in the app a whole stretch recorded while the phone was locked arrives at once.
  const lastKnown = useRef<LocationData | null>(null);
  const ingest = useCallback((batch: LocationData[]) => {
    lastKnown.current = batch[batch.length - 1];
    setAccuracyM(lastKnown.current.accuracy);
    if (statusRef.current !== "recording") return;

    const points: TrackPoint[] = [];
    const newGaps: { gap: TrackGap; from: TrackPoint; to: TrackPoint }[] = [];
    let addedM = 0;
    let maxSpeed = 0;
    let latest: LocationData | null = null;

    for (const fix of batch) {
      if (fix.timestamp <= lastFixTs.current) continue; // seen it (or out of order)
      lastFixTs.current = fix.timestamp;
      // Every fix counts as "still tracking" (including standing still), so only
      // a real silence (screen off, app paused) looks like a gap.
      const sinceLastFix = lastSeenFixAt.current ? fix.timestamp - lastSeenFixAt.current : 0;
      lastSeenFixAt.current = fix.timestamp;
      if (fix.accuracy > MAX_ACCURACY_M) continue;

      const [lat, lng] = fix.position;
      const prev = lastPoint.current;
      const t = fix.timestamp;
      const moved = prev ? haversine(prev, { lat, lng }) : 0;
      const dt = prev ? (t - prev.t) / 1000 : 0;
      // Smoothed speed from the location hook. It no longer reads 0 just because this
      // fix is close to the last trail point (that made slow travel show 0).
      const speed = fix.speed;
      if (speed > MAX_PLAUSIBLE_MS || dt < 0) continue;

      latest = fix;
      if (prev && moved < MIN_MOVE_M) continue; // standing still: don't pile up points

      // Was tracking paused? (no fixes for a while, and we've moved on since)
      const isGap = !!prev && sinceLastFix > GAP_MS && moved > GAP_MIN_M;

      const point: TrackPoint = {
        lat: round(lat, 6),
        lng: round(lng, 6),
        t,
        speed: round(speed, 1),
        alt: fix.altitude != null ? round(fix.altitude, 1) : null,
        ...((pendingGap.current && prev === null) || isGap ? { gap: true } : {}),
      };
      pendingGap.current = false;
      lastPoint.current = point;
      if (prev && !isGap) addedM += moved;
      if (isGap && prev) {
        // Don't draw (or count) a straight line across the gap. Ask for the likely
        // road route instead, and keep its distance separate as an estimate.
        newGaps.push({
          gap: {
            index: trackLen.current, // the point appended below
            startedAt: prev.t,
            endedAt: t,
            straightM: moved,
            routeM: null,
            path: null,
          },
          from: prev,
          to: point,
        });
      }
      maxSpeed = Math.max(maxSpeed, speed);
      points.push(point);
      trackLen.current += 1;
    }

    if (latest) {
      setSpeedMs(latest.speed);
      setAltitudeM(latest.altitude);
    }
    if (!points.length) return;
    if (addedM) setDistanceM((d) => d + addedM);
    setMaxSpeedMs((m) => Math.max(m, maxSpeed));
    setTrack((pts) => pts.concat(points));
    if (newGaps.length) {
      setGaps((g) => g.concat(newGaps.map((n) => n.gap)));
      for (const { gap, from, to } of newGaps) {
        void routePath(from, to).then((r) => {
          if (!r) return;
          setGaps((g) => g.map((x) => (x.index === gap.index ? { ...x, routeM: r.distanceM, path: r.path } : x)));
        });
      }
    }
  }, []);

  useEffect(() => subscribe(ingest), [subscribe, ingest]);

  // Starting (or resuming) uses where you are right now as the first point,
  // rather than waiting for the next fix.
  useEffect(() => {
    if (status === "recording" && lastKnown.current) ingest([lastKnown.current]);
  }, [status, ingest]);

  // Active-time clock (excludes paused time).
  useEffect(() => {
    if (status !== "recording") return;
    const id = setInterval(() => setActiveSeconds(readActiveSeconds()), 1000);
    return () => clearInterval(id);
  }, [status, readActiveSeconds]);

  // Keep the screen awake while recording, or the phone stops delivering GPS.
  // (Not in the app: it records with the screen off.)
  useEffect(() => {
    if (status !== "recording" || !("wakeLock" in navigator) || isInApp()) return;
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
      gaps,
      distanceM,
      maxSpeedMs,
      activeSeconds: readActiveSeconds(),
      savedAt: Date.now(),
    }).catch(() => undefined);
  }, [track, gaps, startedAt, distanceM, maxSpeedMs, readActiveSeconds]);

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
    setGaps([]);
    lastSeenFixAt.current = 0;
    setDistanceM(0);
    setMaxSpeedMs(0);
    setSpeedMs(0);
    setAltitudeM(null);
    setActiveSeconds(0);
    lastPoint.current = null;
    lastFixTs.current = 0;
    trackLen.current = 0;
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
    lastSeenFixAt.current = 0; // a deliberate pause isn't a tracking gap
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
    setGaps(draft.gaps ?? []);
    setDistanceM(draft.distanceM);
    setMaxSpeedMs(draft.maxSpeedMs);
    setActiveSeconds(draft.activeSeconds);
    setStartedAt(draft.startedAt);
    accumulatedMs.current = draft.activeSeconds * 1000;
    setStatus("review");
  }, [draft]);

  /**
   * App only: the page was reloaded while the app kept recording. Pick the trip
   * up from its draft and carry on; the app then replays the fixes since.
   */
  const continueDraft = useCallback((d: TripDraft, state: "recording" | "paused") => {
    const last = d.track[d.track.length - 1] ?? null;
    setTrack(d.track);
    trackLen.current = d.track.length;
    setGaps(d.gaps ?? []);
    setDistanceM(d.distanceM);
    setMaxSpeedMs(d.maxSpeedMs);
    setStartedAt(d.startedAt);
    // Recording carried on while the page was gone, so that time counts.
    accumulatedMs.current = d.activeSeconds * 1000 + (state === "recording" ? Math.max(0, Date.now() - d.savedAt) : 0);
    setActiveSeconds(Math.round(accumulatedMs.current / 1000));
    segmentStart.current = Date.now();
    lastPoint.current = last;
    lastFixTs.current = last?.t ?? 0;
    lastSeenFixAt.current = last?.t ?? 0;
    pendingGap.current = false;
    statusRef.current = state; // so fixes replayed right after this are used
    setDraft(null);
    setStatus(state);
  }, []);

  return {
    status,
    track,
    gaps,
    /** The most recent gap (current copy, including its route once it arrives) */
    lastGap: gaps.length ? gaps[gaps.length - 1] : null,
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
    continueDraft,
  };
}
