import { useEffect, useState } from "react";
import { getPeople, saveSocialSettings } from "../services/social";
import { ChevronDown, ChevronRight, Grid3x3, Lock, Map as MapIcon } from "lucide-react";
import type { Explored } from "../services/explored";
import { cellsToKm2 } from "../../api/_lib/explored";

interface ExploredSheetProps {
  data: Explored | null;
  loading: boolean;
  error: string | null;
  signedIn: boolean;
  onShowOnMap: () => void;
}

/** Everywhere your trips have taken you: squares, countries and regions. */
export function ExploredSheet({ data, loading, error, signedIn, onShowOnMap }: ExploredSheetProps) {
  const [open, setOpen] = useState<string | null>(null);
  // Signed in with a public name: the "show on my profile" switch (off by default).
  const [me, setMe] = useState<{ hasName: boolean; shown: boolean } | null>(null);
  useEffect(() => {
    if (!signedIn) return setMe(null);
    getPeople()
      .then((p) => setMe({ hasName: !!p.me.displayName, shown: p.me.showExplored }))
      .catch(() => setMe(null));
  }, [signedIn]);
  const profile =
    me?.hasName
      ? {
          shown: me.shown,
          onChange: (shown: boolean) => {
            setMe({ ...me, shown });
            void saveSocialSettings({ showExplored: shown }).catch(() => setMe({ ...me, shown: !shown }));
          },
        }
      : null;
  const squares = data?.cells.length ?? 0;
  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
          <Grid3x3 aria-hidden className="h-5 w-5 text-highway" /> Explored map
        </h2>
        {squares > 0 && (
          <button
            type="button"
            onClick={onShowOnMap}
            className="flex items-center gap-1.5 rounded-full bg-highway px-3 py-1.5 text-sm font-medium text-white"
          >
            <MapIcon aria-hidden className="h-4 w-4" /> Show on map
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && loading && (
        <p className="text-sm text-gray-500">Working out your map… The first time, this downloads world borders (about 1.4 MB).</p>
      )}

      {data && (
        <>
          <dl className="grid grid-cols-3 gap-2 text-center" aria-label="Explored">
            {(
              [
                ["Squares", squares, `~${cellsToKm2(squares).toLocaleString()} km²`],
                ["Countries", data.countries.length, null],
                ["Regions", data.regionCount, "states, provinces"],
              ] as const
            ).map(([label, n, sub]) => (
              <div key={label} className="rounded-xl bg-gray-50 p-3">
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="text-2xl font-bold tabular-nums text-gray-900">{n.toLocaleString()}</dd>
                {sub && <dd className="text-[11px] text-gray-500">{sub}</dd>}
              </div>
            ))}
          </dl>

          {squares === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              Record a trip to start uncovering the map. Every ~1 km square your route passes through lights up.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100" aria-label="Countries">
              {data.countries.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => setOpen(open === c.code ? null : c.code)}
                    aria-expanded={open === c.code}
                    className="flex w-full items-center gap-2 py-2.5 text-left"
                  >
                    {open === c.code ? <ChevronDown aria-hidden className="h-4 w-4 text-gray-400" /> : <ChevronRight aria-hidden className="h-4 w-4 text-gray-400" />}
                    <span className="flex-1 font-medium text-gray-900">{c.name}</span>
                    <span className="text-sm text-gray-500 tabular-nums">
                      {c.regions.length} {c.regions.length === 1 ? "region" : "regions"} · {c.squares.toLocaleString()} sq
                    </span>
                  </button>
                  {open === c.code && (
                    <ul className="mb-2 ml-6 space-y-1 text-sm text-gray-700">
                      {c.regions.map((r) => (
                        <li key={r.code} className="flex justify-between">
                          <span>{r.name}</span>
                          <span className="tabular-nums text-gray-500">{r.squares.toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
            <p className="flex items-center gap-2 font-medium text-gray-800">
              <Lock aria-hidden className="h-4 w-4" /> {profile?.shown ? "Shown on your profile" : "Only you can see this"}
            </p>
            {profile ? (
              <label className="mt-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={profile.shown}
                  onChange={(e) => profile.onChange(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  Show my explored map on my profile: only squares from trips you've shared, without their hidden
                  start and end, and never near your Home or Work.
                </span>
              </label>
            ) : (
              <p className="mt-1">
                {signedIn
                  ? "Set a public name on your profile to be able to show it there."
                  : "Sign in to include trips from your other devices."}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-500">
              Stretches without GPS and flights don't count. Waterfront squares count as the land next to them.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
