import { Bike, Bookmark, BookmarkCheck, Car, Footprints, ListOrdered, X } from "lucide-react";
import type { SearchResult } from "../services/searchService";
import type { TravelMode } from "../services/travelMode";
import type { FoundRoute } from "../services/savedRoutes";
import { formatDriveTime } from "../services/routeService";

interface RouteBarProps {
  origin: SearchResult;
  destination: SearchResult;
  mode: TravelMode;
  /** null while the route is being worked out (or couldn't be) */
  found: FoundRoute | null;
  stepsShown: boolean;
  onToggleSteps: () => void;
  onClear: () => void;
  /** this route (ends and mode) is in Saved › Routes */
  isSaved: boolean;
  onSave: () => void;
}

const km = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);

/** The route on the map: where from and to, how long, its steps, and Clear. */
export function RouteBar({ origin, destination, mode, found, stepsShown, onToggleSteps, onClear, isSaved, onSave }: RouteBarProps) {
  const Icon = mode === "bike" ? Bike : mode === "foot" ? Footprints : Car;
  return (
    <section
      aria-label="Route"
      className="absolute bottom-[calc(7.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[500] rounded-2xl bg-white/95 p-3 shadow-lg backdrop-blur-sm md:left-auto md:w-96 dark:bg-[#1c2429]/95"
    >
      <div className="flex items-center gap-2">
        <Icon aria-hidden className="h-5 w-5 flex-shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
          {origin.name} → {destination.name}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 text-sm text-gray-600 dark:text-gray-300">
          {found ? (
            <>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{formatDriveTime(found.durationS)}</span> ·{" "}
              {km(found.distanceM)}
            </>
          ) : (
            "Finding the route…"
          )}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaved}
          aria-label={isSaved ? "Route saved" : "Save route"}
          title={isSaved ? "In Saved › Routes" : "Save route"}
          className="rounded-full border border-gray-300 p-2 text-blue-600 disabled:border-green-600 disabled:text-green-700 dark:border-gray-600"
        >
          {isSaved ? <BookmarkCheck aria-hidden className="h-4 w-4" /> : <Bookmark aria-hidden className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onToggleSteps}
          aria-pressed={stepsShown}
          aria-label="Steps"
          title="Turn-by-turn steps"
          className="rounded-full border border-gray-300 p-2 text-gray-700 dark:border-gray-600 dark:text-gray-200"
        >
          <ListOrdered aria-hidden className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 rounded-full bg-gray-900 px-3 py-2 text-xs font-medium text-white dark:bg-gray-100 dark:text-gray-900"
        >
          <X aria-hidden className="h-4 w-4" /> Clear route
        </button>
      </div>
    </section>
  );
}
