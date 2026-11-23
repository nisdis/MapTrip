import { useCallback, useEffect, useRef, useState } from "react";
import type { TrackPoint } from "../types/trip";
import type { RecorderStatus } from "./useTripRecorder";
import {
  LiveShareError,
  MAX_POINTS_PER_UPDATE,
  extendLiveShare,
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
  const sent = useRef(0); // points the server has accepted
  const inFlight = useRef(false);
  const shareRef = useRef<ActiveShare | null>(null);
  shareRef.current = share;

  const end = useCallback((notice: string | null) => {
    setShare(null);
    remember(null);
    sent.current = 0;
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
      do {
        const batch = t.slice(sent.current, sent.current + MAX_POINTS_PER_UPDATE).map(toLivePoint);
        const res = await sendLiveUpdate(current.token, sent.current, batch, s === "paused" ? "paused" : "recording", st);
        sent.current = res.count;
      } while (sent.current < t.length && shareRef.current?.token === current.token);
      setLastSyncAt(Date.now());
      setProblem(null);
    } catch (e) {
      if (e instanceof LiveShareError && e.status === 409 && typeof e.body.count === "number") {
        sent.current = e.body.count; // resend from what the server has
      } else if (e instanceof LiveShareError && e.status === 410) {
        end("Your live share has ended. The link no longer works.");
      } else {
        setProblem(e instanceof Error ? e.message : "Live update failed");
      }
    } finally {
      inFlight.current = false;
    }
  }, [end]);

  // Upload on a timer while sharing.
  useEffect(() => {
    if (!share) return;
    void sync();
    const id = setInterval(() => void sync(), LIVE_UPDATE_MS);
    return () => clearInterval(id);
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
      sent.current = 0;
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

  return {
    share,
    lastSyncAt,
    problem,
    endedNotice,
    dismissNotice: () => setEndedNotice(null),
    start,
    extend,
    stop,
  };
}
