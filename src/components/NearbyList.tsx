import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
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

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

export function NearbyList({ state, onSelect, onClose, onHeight }: NearbyListProps) {
  const ref = useReportHeight(onHeight);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [hours, setHours] = useState<Record<string, HoursInfo | null>>({});

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

  return (
    <section
      ref={ref}
      aria-label={`${label} nearby`}
      className="fixed left-3 right-3 bottom-[5.75rem] z-30 flex max-h-[45vh] flex-col rounded-2xl bg-paper font-hud text-asphalt shadow-[0_8px_32px_rgba(31,42,48,0.28)] md:left-auto md:right-4 md:w-[26rem]"
    >
      <header className="flex items-center gap-2 border-b border-asphalt/10 px-4 pb-2 pt-3">
        <h2 className="flex-1 text-lg font-bold">
          {label}
          {state.status === "ready" && (
            <span className="ml-2 text-sm font-normal text-asphalt/60">{state.results.length} in this area</span>
          )}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${label.toLowerCase()} list`}
          className="-mr-1 rounded-full p-2 hover:bg-asphalt/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-asphalt"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      {state.status === "ready" && state.results.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 text-sm">
          <button
            type="button"
            aria-pressed={openNowOnly}
            onClick={() => setOpenNowOnly((v) => !v)}
            className={`rounded-full px-3 py-1 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-asphalt ${
              openNowOnly ? "bg-highway text-white" : "border border-asphalt/25"
            }`}
          >
            Open now
          </button>
          <span className="text-xs text-asphalt/60">
            {listed} of {state.results.length} list their hours
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {state.status === "loading" && (
          <div role="status" className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-4 w-48 rounded bg-asphalt/10 motion-safe:animate-pulse" />
                <div className="h-3 w-32 rounded bg-asphalt/10 motion-safe:animate-pulse" />
              </div>
            ))}
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
          <p className="p-4 text-sm text-asphalt/70">
            None of the places that list their hours are open right now.
          </p>
        )}
        <ul className="divide-y divide-asphalt/10">
          {visible.map((r) => {
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
                  <div className="text-sm text-asphalt/70">
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
      </div>
    </section>
  );
}
