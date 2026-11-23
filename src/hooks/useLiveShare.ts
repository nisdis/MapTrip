import { useCallback, useEffect, useRef, useState } from "react";
import type { TrackPoint } from "../types/trip";
import type { RecorderStatus } from "./useTripRecorder";
import { callApp, isInApp } from "../services/appBridge";
import {
  LiveShareError,
  MAX_POINTS_PER_UPDATE,
  extendLiveShare,
  firstAfter,
  liveUrl,
  sendLiveUpdate,
  startLiveShare,
  stopLiveShare,
  toLivePoint,
  type LiveStats,
  type ShareDuration,
} from "../services/liveShare";

/** How often the trail and stats are uploaded while sharing. */
export const LIVE_UPDATE_MS = 20_000;
const STORAGE_KEY = "liveShareToken";

export interface ActiveShare {
  token: string;
  url: string;
  expiresAt: number;
  /** +1 h is no longer possible (24 h limit) */
  atLimit: boolean;
}

interface Inputs {
  status: RecorderStatus;
  startedAt: number;
  track: TrackPoint[];
  stats: LiveStats;
}

const remember = (token: string | null) => {
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* only used to clean up after a closed tab */
  }
};

/**
 * Shares the trip being recorded through a live link. New trail points and the
 * current stats go up every 20 s (and straight away on pause/resume). Whatever
 * hasn't been accepted yet is simply sent again next time, so a dead zone or a
 * failed request loses nothing. The share ends when the trip does.
 */
export function useLiveShare({ status, startedAt, track, stats }: Inputs) {
  const [share, setShare] = useState<ActiveShare | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** Shown once after a share ends by itself (time ran out) */
  const [endedNotice, setEndedNotice] = useState<string | null>(null);

  // Latest values for the timer, without restarting it on every GPS fix.
  const latest = useRef({ status, track, stats });
  latest.current = { status, track, stats };
  const sentT = useRef(-Infinity); // time of the newest point the server has
  const inFlight = useRef(false);
  const shareRef = useRef<ActiveShare | null>(null);
  shareRef.current = share;

  const handOff = useCallback(
    (current: ActiveShare, s: RecorderStatus, st: LiveStats, t: TrackPoint[]) => {
      if (!isInApp()) return;
      const last = t[t.length - 1];
      void callApp({
        type: "share",
        share: {
          token: current.token,
          expiresAt: current.expiresAt,
          lastT: Number.isFinite(sentT.current) ? sentT.current : null,
          status: s === "paused" ? "paused" : "recording",
          stats: st,
          last: last ? { lat: last.lat, lng: last.lng, t: last.t } : null,
          at: Date.now(),
        },
      });
    },
    [],
  );

  const end = useCallback((notice: string | null) => {
    if (isInApp()) void callApp({ type: "share", share: null });
    setShare(null);
    remember(null);
    sentT.current = -Infinity;
    setProblem(null);
    setLastSyncAt(null);
    setEndedNotice(notice);
  }, []);

  const sync = useCallback(async () => {
    const current = shareRef.current;
    if (!current || inFlight.current) return;
    inFlight.current = true;
    try {
      const { status: s, track: t, stats: st } = latest.current;
      // At least one request (stats/status may have changed), more if there's a backlog.
      let from = firstAfter(t, sentT.current);
      do {
        const batch = t.slice(from, from + MAX_POINTS_PER_UPDATE).map(toLivePoint);
        const res = await sendLiveUpdate(current.token, batch, s === "paused" ? "paused" : "recording", st);
        if (res.lastT != null) sentT.current = res.lastT;
        const next = firstAfter(t, sentT.current);
        if (next <= from) break; // nothing accepted (bad points): don't loop
        from = next;
      } while (from < t.length && shareRef.current?.token === current.token);
      setLastSyncAt(Date.now());
      setProblem(null);
      // In the app: keep it up to date, so it can carry on while the phone is locked.
      handOff(current, s, st, t);
    } catch (e) {
      if (e instanceof LiveShareError && e.status === 410) {
        end("Your live share has ended. The link no longer works.");
      } else {
        setProblem(e instanceof Error ? e.message : "Live update failed");
      }
    } finally {
      inFlight.current = false;
    }
  }, [end, handOff]);

  // Upload on a timer while sharing.
  useEffect(() => {
    if (!share) return;
    void sync();
    const id = setInterval(() => void sync(), LIVE_UPDATE_MS);
    return () => clearInterval(id);
  }, [share, sync]);

  // Back from the background (phone unlocked): catch up straight away.
  useEffect(() => {
    if (!share) return;
    const onVisible = () => document.visibilityState === "visible" && void sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [share, sync]);

  // Viewers should see "Paused" (or recording again) without waiting for the timer.
  useEffect(() => {
    if (shareRef.current && (status === "recording" || status === "paused")) void sync();
  }, [status, sync]);

  // The trip ended (finished, discarded, or a new one started): end the link.
  useEffect(() => {
    if (status === "recording" || status === "paused") return;
    const current = shareRef.current;
    if (current) {
      void stopLiveShare(current.token).catch(() => undefined);
      end(null);
    }
  }, [status, end]);

  // This tab was reloaded mid-share (the recording is gone): stop that share.
  // Per tab (sessionStorage), so another open tab can never stop this one.
  useEffect(() => {
    if (isInApp()) return; // the app may still be sharing it: see adoptOrCleanUp
    let leftover: string | null = null;
    try {
      leftover = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      /* nothing to clean up */
    }
    if (leftover && !shareRef.current) {
      remember(null);
      void stopLiveShare(leftover).catch(() => undefined);
    }
  }, []);

  const start = useCallback(
    async (duration: ShareDuration) => {
      setEndedNotice(null);
      const res = await startLiveShare(duration, startedAt);
      sentT.current = -Infinity;
      remember(res.token);
      setShare({ token: res.token, url: liveUrl(res.token), expiresAt: res.expiresAt, atLimit: false });
    },
    [startedAt],
  );

  const extend = useCallback(async () => {
    const current = shareRef.current;
    if (!current) return;
    try {
      const res = await extendLiveShare(current.token);
      setShare((s) => (s && s.token === current.token ? { ...s, expiresAt: res.expiresAt, atLimit: res.atLimit } : s));
    } catch (e) {
      if (e instanceof LiveShareError && e.status === 410) end("Your live share has ended. The link no longer works.");
      else throw e;
    }
  }, [end]);

  const stop = useCallback(async () => {
    const current = shareRef.current;
    if (!current) return;
    end(null);
    await stopLiveShare(current.token);
  }, [end]);

  // The server ends the link at its expiry time; reflect that here too.
  useEffect(() => {
    if (!share) return;
    const ms = share.expiresAt - Date.now();
    const id = setTimeout(() => end("Your live share has ended. The link no longer works."), Math.max(ms, 0));
    return () => clearTimeout(id);
  }, [share, end]);

  /**
   * App only, after a reload mid-trip: carry on with the share the app kept
   * going, or stop the one this tab had started if the app no longer has it.
   */
  const adoptOrCleanUp = useCallback((fromApp: { token: string; expiresAt: number } | null) => {
    let leftover: string | null = null;
    try {
      leftover = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      /* nothing to clean up */
    }
    if (fromApp && fromApp.expiresAt > Date.now()) {
      sentT.current = -Infinity; // the server skips what it already has
      remember(fromApp.token);
      setShare({ token: fromApp.token, url: liveUrl(fromApp.token), expiresAt: fromApp.expiresAt, atLimit: false });
      return;
    }
    if (leftover) {
      remember(null);
      void stopLiveShare(leftover).catch(() => undefined);
    }
  }, []);

  return {
    share,
    adoptOrCleanUp,
    lastSyncAt,
    problem,
    endedNotice,
    dismissNotice: () => setEndedNotice(null),
    start,
    extend,
    stop,
  };
}
