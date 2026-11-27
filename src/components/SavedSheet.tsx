import { useState } from "react";
import {
  Briefcase,
  Home,
  MapPin,
  Star,
  Cloud,
  CloudOff,
  Car,
  Bike,
  Footprints,
  Navigation,
  Trash2,
} from "lucide-react";
import type { SavedEntry } from "../types/saved";
import { haversine } from "../utils/geo";

interface SavedSheetProps {
  home: SavedEntry | null;
  work: SavedEntry | null;
  favourites: SavedEntry[];
  /** routes saved from Directions */
  routes: SavedEntry[];
  userPosition: [number, number] | null;
  showOnMap: boolean;
  syncStatus: {
    signedIn: boolean;
    state: "idle" | "syncing" | "synced" | "error";
    error: string | null;
  };
  onToggleShowOnMap: () => void;
  onOpen: (entry: SavedEntry) => void;
  onRemove: (entry: SavedEntry) => void;
}

function distance(e: SavedEntry, me: [number, number] | null): number | null {
  return me
    ? haversine(
        { lat: me[0], lng: me[1] },
        { lat: e.place.lat, lng: e.place.lng },
      )
    : null;
}

const fmt = (m: number) =>
  m < 1000
    ? `${Math.round(m / 10) * 10} m`
    : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;

function Row({
  icon: Icon,
  title,
  sub,
  note,
  dist,
  onOpen,
  action,
}: {
  icon: typeof Home;
  title: string;
  sub: string | null;
  note?: string | null;
  dist: number | null;
  onOpen: () => void;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-3 py-3 text-left"
      >
        <Icon
          aria-hidden
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-500"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate font-medium text-gray-900">{title}</span>
            {dist != null && (
              <span className="flex-shrink-0 text-sm text-gray-500 tabular-nums">
                {fmt(dist)}
              </span>
            )}
          </span>
          {sub && (
            <span className="block truncate text-sm text-gray-500">{sub}</span>
          )}
          {note && (
            <span className="block text-sm italic text-gray-600">“{note}”</span>
          )}
        </span>
      </button>
      {action}
    </li>
  );
}

export function SavedSheet(props: SavedSheetProps) {
  const { home, work, favourites, userPosition: me } = props;
  // Two kinds of things: places (Home, Work, Favourites) and routes from Directions.
  const [tab, setTab] = useState<"places" | "routes">("places");
  const placeCount = favourites.length + (home ? 1 : 0) + (work ? 1 : 0);
  const sorted = [...favourites].sort((a, b) => {
    const da = distance(a, me);
    const db = distance(b, me);
    return da != null && db != null ? da - db : b.createdAt - a.createdAt;
  });

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Saved</h2>
        {tab === "places" && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={props.showOnMap}
              onChange={props.onToggleShowOnMap}
              className="h-4 w-4"
            />
            Show on map
          </label>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Saved"
        className="flex gap-1 rounded-xl bg-gray-100 p-1"
      >
        {(
          [
            ["places", "Places", placeCount, MapPin],
            ["routes", "Routes", props.routes.length, Navigation],
          ] as const
        ).map(([id, label, count, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium ${
              tab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"
            }`}
          >
            <Icon aria-hidden className="h-4 w-4" />
            {label}
            <span className="text-xs font-normal text-gray-500">{count}</span>
          </button>
        ))}
      </div>

      {tab === "places" && (
        <>
          <ul className="divide-y divide-gray-100 rounded-xl bg-gray-50 px-3">
            {home ? (
              <Row
                icon={Home}
                title="Home"
                sub={home.place.name ?? home.place.address}
                dist={distance(home, me)}
                onOpen={() => props.onOpen(home)}
              />
            ) : (
              <li className="py-3 text-sm text-gray-500">
                <Home aria-hidden className="mr-2 inline h-4 w-4" />
                No Home set. Open any place, tap More details, then Set as Home.
              </li>
            )}
            {work ? (
              <Row
                icon={Briefcase}
                title="Work"
                sub={work.place.name ?? work.place.address}
                dist={distance(work, me)}
                onOpen={() => props.onOpen(work)}
              />
            ) : (
              <li className="py-3 text-sm text-gray-500">
                <Briefcase aria-hidden className="mr-2 inline h-4 w-4" />
                No Work set. Open any place, tap More details, then Set as Work.
              </li>
            )}
          </ul>

          <section>
            <h3 className="mb-1 flex items-center gap-2 font-medium text-gray-800">
              <Star
                aria-hidden
                className="h-4 w-4 fill-amber-500 text-amber-500"
              />{" "}
              Favourites
              <span className="text-sm font-normal text-gray-500">
                {favourites.length}
              </span>
            </h3>
            {sorted.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                No favourites yet. Tap Save on any place to keep it here.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {sorted.map((e) => (
                  <Row
                    key={e.key}
                    icon={MapPin}
                    title={e.place.name ?? "Dropped pin"}
                    sub={[
                      e.place.category,
                      e.place.address?.split(",").slice(0, 2).join(","),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    note={e.note}
                    dist={distance(e, me)}
                    onOpen={() => props.onOpen(e)}
                    action={
                      <button
                        type="button"
                        onClick={() => props.onRemove(e)}
                        aria-label={`Remove ${e.place.name ?? "this place"} from Favourites`}
                        className="mt-2 rounded-full p-2 text-amber-500 hover:bg-gray-100"
                      >
                        <Star aria-hidden className="h-5 w-5 fill-current" />
                      </button>
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {tab === "routes" && (
        <section>
          {props.routes.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              No routes yet. Plan one in Directions and tap Save route.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {props.routes.map((e) => {
                const r = e.route!;
                const Icon =
                  r.mode === "bike"
                    ? Bike
                    : r.mode === "foot"
                      ? Footprints
                      : Car;
                const facts = [
                  r.mode === "bike"
                    ? "Bike"
                    : r.mode === "foot"
                      ? "Walk"
                      : "Car",
                  r.distanceM != null ? fmt(r.distanceM) : null,
                  r.durationS != null
                    ? `${Math.max(1, Math.round(r.durationS / 60))} min`
                    : null,
                ].filter(Boolean);
                return (
                  <Row
                    key={e.key}
                    icon={Icon}
                    title={r.name}
                    sub={facts.join(" · ")}
                    dist={null}
                    onOpen={() => props.onOpen(e)}
                    action={
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Remove the route “${r.name}”?`))
                            props.onRemove(e);
                        }}
                        aria-label={`Remove route ${r.name}`}
                        className="mt-2 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      >
                        <Trash2 aria-hidden className="h-5 w-5" />
                      </button>
                    }
                  />
                );
              })}
            </ul>
          )}
        </section>
      )}

      <p className="flex items-center gap-2 text-xs text-gray-500">
        {props.syncStatus.signedIn ? (
          <Cloud aria-hidden className="h-4 w-4" />
        ) : (
          <CloudOff aria-hidden className="h-4 w-4" />
        )}
        {!props.syncStatus.signedIn
          ? "Saved on this device. Sign in to keep them on all your devices."
          : props.syncStatus.state === "syncing"
            ? "Syncing…"
            : props.syncStatus.state === "error"
              ? `Couldn't sync: ${props.syncStatus.error ?? "try again later"}. Your places are safe on this device.`
              : "Synced to your account."}
      </p>
    </div>
  );
}
