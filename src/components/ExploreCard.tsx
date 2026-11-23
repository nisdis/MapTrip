import { ArrowRight, Eye, List, X } from "lucide-react";
import type { ExploreTrip } from "../services/publicTrips";
import { formatClock, formatKm } from "../utils/tripStats";

interface ExploreCardProps {
  trip: ExploreTrip;
  onOpen: () => void;
  onList: () => void;
  onClose: () => void;
}

/** The trip picked on the map, just above the bottom navigation. */
export function ExploreCard({ trip, onOpen, onList, onClose }: ExploreCardProps) {
  return (
    <section
      aria-label="Selected trip"
      className="fixed inset-x-3 z-30 rounded-2xl bg-white p-3 shadow-xl bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:left-auto md:right-4 md:w-96"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold text-gray-900">
            {trip.title}
            {trip.imported && <span className="ml-1.5 rounded bg-gray-200 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase text-gray-600">Imported</span>}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {trip.author && trip.authorId ? (
              <>
                <a href={`/u/${trip.authorId}`} className="font-medium text-highway underline">
                  {trip.author}
                </a>
                {" · "}
              </>
            ) : trip.author ? (
              `${trip.author} · `
            ) : (
              ""
            )}
            {formatKm(trip.stats.distanceM)} km · {formatClock(trip.stats.durationS)} ·{" "}
            {new Date(`${trip.stats.date}T12:00:00Z`).toLocaleDateString([], { day: "numeric", month: "short" })}
            <span className="ml-2 inline-flex items-center gap-0.5">
              <Eye className="h-3 w-3" /> {trip.views}
            </span>
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close trip card" className="-mr-1 -mt-1 rounded-full p-1.5 text-gray-500 hover:bg-gray-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-highway text-sm font-bold text-white"
        >
          Open trip <ArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onList}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-gray-300 px-3 text-sm font-medium text-gray-700"
        >
          <List className="h-4 w-4" /> All trips here
        </button>
      </div>
    </section>
  );
}
