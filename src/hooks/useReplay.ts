import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultRate, stateAt, type ReplayState, type Timeline } from "../utils/replay";

export interface Replay {
  /** trip time, ms from the start */
  ms: number;
  playing: boolean;
  /** play or a seek has happened: show live readouts and the moving dot */
  started: boolean;
  /** times faster than real life */
  rate: number;
  state: ReplayState | null;
  /** the map keeps the dot in view */
  follow: boolean;
  play: () => void;
  pause: () => void;
  seek: (ms: number) => void;
  setRate: (rate: number) => void;
  setFollow: (follow: boolean) => void;
}

/** Plays a timeline on the screen's clock: `rate` ms of trip per ms of real time. */
export function useReplay(tl: Timeline | null): Replay {
  const [ms, setMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [rate, setRate] = useState(() => defaultRate(tl?.durationMs ?? 0));
  const [follow, setFollow] = useState(true);
  const msRef = useRef(0);
  msRef.current = ms;

  // A different trip: start over.
  useEffect(() => {
    setMs(0);
    setPlaying(false);
    setStarted(false);
    setFollow(true);
    setRate(defaultRate(tl?.durationMs ?? 0));
  }, [tl]);

  useEffect(() => {
    if (!playing || !tl) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const next = Math.min(tl.durationMs, msRef.current + (now - last) * rate);
      last = now;
      msRef.current = next;
      setMs(next);
      if (next >= tl.durationMs) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, rate, tl]);

  const play = useCallback(() => {
    if (!tl || tl.durationMs <= 0) return;
    if (msRef.current >= tl.durationMs) {
      msRef.current = 0;
      setMs(0);
    }
    setStarted(true);
    setFollow(true);
    setPlaying(true);
  }, [tl]);

  const pause = useCallback(() => setPlaying(false), []);

  const seek = useCallback(
    (to: number) => {
      if (!tl) return;
      const v = Math.max(0, Math.min(tl.durationMs, to));
      msRef.current = v;
      setMs(v);
      setStarted(true);
    },
    [tl],
  );

  const state = useMemo(() => (tl && tl.points.length ? stateAt(tl, ms) : null), [tl, ms]);

  return { ms, playing, started, rate, state, follow, play, pause, seek, setRate, setFollow };
}
