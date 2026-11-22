import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { categoryStyle } from "../utils/categoryStyle";
import type { NearbyResult } from "../services/placeService";
import type { NearbyState } from "../hooks/useNearby";
import { describeHours, type HoursInfo } from "../utils/openingHours";
import { useReportHeight } from "../hooks/useReportHeight";

interface NearbyListProps {
  state: NearbyState;
  onSelect: (result: NearbyResult) => void;
  onClose: () => void;
  onHeight: (px: number) => void;
}

const STATE_TEXT = { open: "text-highway", closed: "text-signal", unknown: "text-asphalt/70" } as const;

// Peek keeps the map visible; half and full show more of the list.
type Snap = "peek" | "half" | "full";
const ORDER: Snap[] = ["peek", "half", "full"];
const SNAP_HEIGHT: Record<Snap, string> = { peek: "", half: "max-h-[48vh]", full: "max-h-[calc(100vh-11rem)]" };

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

export function NearbyList({ state, onSelect, onClose, onHeight }: NearbyListProps) {
  const ref = useReportHeight(onHeight);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [hours, setHours] = useState<Record<string, HoursInfo | null>>({});
  const [snap, setSnap] = useState<Snap>("peek");
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);

  // Each new category starts as a peek, so the pins on the map stay visible.
  useEffect(() => setSnap("peek"), [state.category.id]);

  const step = (dir: 1 | -1) =>
    setSnap((s) => ORDER[Math.min(ORDER.length - 1, Math.max(0, ORDER.indexOf(s) + dir))]);

  // Work out open/closed for every result that lists hours.
  useEffect(() => {
    setHours({});
    let cancelled = false;
    const withHours = state.results.filter((r) => r.place.openingHours);
    Promise.all(
      withHours.map(async (r) => {
        const info = await describeHours(r.place.openingHours!, {
          lat: r.place.lat,
          lng: r.place.lng,
          countryCode: r.place.countryCode ?? undefined,
        }).catch(() => null);
        return [r.place.id, info] as const;
      }),
    ).then((pairs) => !cancelled && setHours(Object.fromEntries(pairs)));
    return () => {
      cancelled = true;
    };
  }, [state.results]);

  const listed = state.results.filter((r) => r.place.openingHours).length;
  const visible = useMemo(
    () => (openNowOnly ? state.results.filter((r) => hours[r.place.id]?.state === "open") : state.results),
    [openNowOnly, state.results, hours],
  );
  const label = state.category.label;

  const { color, Icon } = categoryStyle(state.category.id);
  const peek = snap === "peek";
  const shown = peek ? visible.slice(0, 1) : visible;

  return (
    <section
      ref={ref}
      aria-label={`${label} nearby`}
      className={`fixed left-3 right-3 bottom-[5.75rem] z-30 flex flex-col rounded-2xl bg-paper font-hud text-asphalt shadow-[0_8px_32px_rgba(31,42,48,0.28)] transition-[max-height] duration-300 md:left-auto md:right-4 md:w-[26rem] ${SNAP_HEIGHT[snap]}`}
    >
      {/* Handle: tap to grow/shrink, or drag up and down. */}
      <button
        type="button"
        aria-label={peek ? `Show ${label.toLowerCase()} list` : snap === "full" ? "Show less" : "Show full list"}
        onClick={() => {
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          setSnap(peek ? "half" : snap === "half" ? "full" : "peek");
        }}
        onPointerDown={(e) => {
          dragStart.current = e.clientY;
          dragged.current = false;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          if (dragStart.current == null) return;
          const dy = e.clientY - dragStart.current;
          dragStart.current = null;
          if (Math.abs(dy) <= 30) return;
          dragged.current = true;
          step(dy < 0 ? 1 : -1);
        }}
        onPointerCancel={() => (dragStart.current = null)}
        className="flex h-6 w-full flex-shrink-0 touch-none items-center justify-center rounded-t-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-asphalt"
      >
        <span className="h-1 w-10 rounded-full bg-asphalt/25" />
      </button>

      <header className="flex items-center gap-2 px-4 pb-2">
        <span
          aria-hidden
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: color }}
        >
          <Icon className="h-4 w-4" strokeWidth={2.4} />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-base font-bold">
          {label}
          {state.status === "ready" && (
            <span className="ml-2 text-sm font-normal text-asphalt/60">{state.results.length} here</span>
          )}
        </h2>
        {state.status === "ready" && state.results.length > 0 && (
          <button
            type="button"
            aria-pressed={openNowOnly}
            onClick={() => setOpenNowOnly((v) => !v)}
            className={`flex-shrink-0 rounded-full px-3 py-1 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-asphalt ${
              openNowOnly ? "bg-highway text-white" : "border border-asphalt/25"
            }`}
          >
            Open now
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${label.toLowerCase()} list`}
          className="-mr-1 flex-shrink-0 rounded-full p-1.5 hover:bg-asphalt/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-asphalt"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      {!peek && state.status === "ready" && state.results.length > 0 && (
        <p className="px-4 pb-1 text-xs text-asphalt/60">
          {listed} of {state.results.length} list their hours
        </p>
      )}

      <div className={`border-t border-asphalt/10 ${peek ? "" : "flex-1 overflow-y-auto"}`}>
        {state.status === "loading" && (
          <div role="status" className="space-y-1.5 p-4">
            <div className="h-4 w-48 rounded bg-asphalt/10 motion-safe:animate-pulse" />
            <div className="h-3 w-32 rounded bg-asphalt/10 motion-safe:animate-pulse" />
          </div>
        )}
        {state.status === "error" && <p className="p-4 text-sm text-signal">{state.error}</p>}
        {state.status === "ready" && state.results.length === 0 && (
          <p className="p-4 text-sm text-asphalt/70">
            No {label.toLowerCase()} found in this part of the map. Zoom out or move the map, then search this
            area.
          </p>
        )}
        {state.status === "ready" && state.results.length > 0 && visible.length === 0 && (
          <p className="p-4 text-sm text-asphalt/70">None of the places that list their hours are open right now.</p>
        )}
        <ul className="divide-y divide-asphalt/10">
          {shown.map((r) => {
            const h = hours[r.place.id];
            return (
              <li key={r.place.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r)}
                  className="w-full px-4 py-3 text-left hover:bg-asphalt/5 focus-visible:bg-asphalt/5 focus-visible:outline-none"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-bold">{r.place.name ?? "Unnamed"}</span>
                    <span className="flex-shrink-0 text-sm text-asphalt/60 tabular-nums">
                      {formatDistance(r.distanceM)}
                    </span>
                  </div>
                  <div className="truncate text-sm text-asphalt/70">
                    {[r.place.cuisine ?? r.place.category, r.place.address?.split(",").slice(0, 2).join(",")]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <div className={`text-sm ${h ? `font-bold ${STATE_TEXT[h.state]}` : "text-asphalt/50"}`}>
                    {h ? h.summary : r.place.openingHours || !r.place.expectsHours ? "" : "Hours not listed"}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        {peek && visible.length > 1 && (
          <button
            type="button"
            onClick={() => setSnap("half")}
            className="w-full border-t border-asphalt/10 px-4 py-2 text-left text-sm font-bold text-highway focus-visible:outline-none focus-visible:bg-asphalt/5"
          >
            See all {visible.length}
          </button>
        )}
      </div>
    </section>
  );
}
