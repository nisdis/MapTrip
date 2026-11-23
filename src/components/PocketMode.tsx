import { useEffect, useRef, useState } from "react";
import { formatClock, formatKm } from "../utils/tripStats";

interface PocketModeProps {
  distanceM: number;
  activeSeconds: number;
  onWake: () => void;
}

const HOLD_MS = 1000;

/**
 * Black screen while recording. The screen stays on (so the browser keeps
 * tracking) but an OLED screen showing black uses almost no power. Wake with a
 * deliberate 1-second hold, so pocket touches don't wake it. The dim readout
 * drifts every minute to avoid burn-in.
 */
export function PocketMode({ distanceM, activeSeconds, onWake }: PocketModeProps) {
  const [holding, setHolding] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The parent re-renders every second; keep the latest callback without
  // re-running effects (which would cancel a hold in progress).
  const wake = useRef(onWake);
  wake.current = onWake;

  useEffect(() => {
    const id = setInterval(
      () => setOffset({ x: Math.round((Math.random() - 0.5) * 120), y: Math.round((Math.random() - 0.5) * 240) }),
      60000,
    );
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && wake.current();
    document.addEventListener("keydown", onKey);
    return () => {
      clearInterval(id);
      document.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Pocket mode: recording continues. Press and hold to wake."
      className="fixed inset-0 z-[70] flex select-none items-center justify-center bg-black touch-none"
      onPointerDown={() => {
        setHolding(true);
        timer.current = setTimeout(() => {
          cancel();
          wake.current();
        }, HOLD_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="text-center font-hud text-[#5a5a5a]"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <div className="flex items-center justify-center gap-2 text-sm">
          <span aria-hidden className="h-2 w-2 rounded-full bg-[#7a1a24]" />
          Recording
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums">{formatKm(distanceM)} km</div>
        <div className="text-sm tabular-nums">{formatClock(activeSeconds)}</div>
        <div className="mt-6 text-xs text-[#3a3a3a]">{holding ? "Keep holding…" : "Press and hold to wake"}</div>
      </div>
    </div>
  );
}
