import { Compass, Eye, Loader2, RefreshCw } from "lucide-react";
import type { ExploreTrip, NearestTrip } from "../services/publicTrips";
import { MapPin } from "lucide-react";
import { formatClock, formatKm } from "../utils/tripStats";

interface ExploreSheetProps {
  trips: ExploreTrip[] | null;
  loading: boolean;
  error: string | null;
  /** the map was moved since this list was loaded */
  stale: boolean;
  selectedId: string | null;
  onRefresh: () => void;
  onSelect: (trip: ExploreTrip) => void;
  /** nothing in view: the closest public trips */
  nearest: NearestTrip[];
  onGoTo: (trip: NearestTrip) => void;
}

/** Public trips that pass through the area on the map, most viewed (recently) first. */
export function ExploreSheet({ trips, loading, error, stale, selectedId, onRefresh, onSelect, nearest, onGoTo }: ExploreSheetProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Compass className="h-5 w-5 text-highway" />
        <h2 className="flex-1 text-lg font-semibold text-gray-800">Explore trips</h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${
            stale ? "bg-highway text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {stale ? "Search this area" : "Refresh"}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Public trips through the area on the map. Their starts and ends are hidden.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {trips && trips.length === 0 && !loading && (
        <div className="py-2">
          <p className="text-sm text-gray-600">No public trips in this area yet.</p>
          {nearest.length > 0 && (
            <>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-500">Nearest public trips</p>
              <ul className="mt-1.5 space-y-2">
                {nearest.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onGoTo(t)}
                      className="flex w-full items-center gap-3 rounded-xl bg-gray-50 p-3 text-left"
                    >
                      <MapPin className="h-4 w-4 flex-shrink-0 text-highway" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-gray-900">{t.title}</span>
                        <span className="block text-xs text-gray-500">
                          {t.author ? `${t.author} · ` : ""}
                          {t.distanceKm < 1 ? "under 1" : t.distanceKm.toLocaleString()} km away
                        </span>
                      </span>
                      <span className="text-xs font-bold text-highway">Go</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <ul className="space-y-2 pb-20">
        {(trips ?? []).map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onSelect(t)}
              className={`w-full rounded-xl border-2 p-3 text-left ${selectedId === t.id ? "border-highway bg-highway/5" : "border-transparent bg-gray-50"}`}
            >
              <div className="truncate font-medium text-gray-900">{t.title}</div>
              <div className="mt-0.5 text-xs text-gray-500">
                {t.author ? `${t.author} · ` : ""}
                {formatKm(t.stats.distanceM)} km · {formatClock(t.stats.durationS)} ·{" "}
                {new Date(`${t.stats.date}T12:00:00Z`).toLocaleDateString([], { day: "numeric", month: "short" })}
                <span className="ml-2 inline-flex items-center gap-0.5">
                  <Eye className="h-3 w-3" /> {t.views}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
