import { useEffect, useState } from "react";
import { BarChart3, X } from "lucide-react";

interface Stats {
  active: { d1: number; d7: number; d30: number };
  events: { name: string; d7: number; p7: number; d30: number; p30: number }[];
  daily: { day: string; people: number }[];
  totals: { accounts: number; new7: number; new30: number; trips: number; trips7: number; shared: number };
}

const LABELS: Record<string, string> = {
  app_open: "Opened the app",
  trip_recorded: "Recorded a trip",
  trip_shared: "Shared a trip",
  live_share_started: "Started a live share",
  media_added: "Added photos/videos",
  route_shown: "Showed a route",
  route_saved: "Saved a route",
  explore_opened: "Opened Explore",
  explored_opened: "Opened the Explored map",
  reaction_added: "Reacted to a trip",
  comment_added: "Commented on a trip",
  challenges_opened: "Opened Challenges",
  trip_renamed: "Renamed a trip",
};

/** Admins: how the app is used (anonymous counts; people = devices or accounts). */
export function StatsSheet({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/public?stats=1")
      .then(async (r) => {
        if (!r.ok) throw new Error("Couldn't load the numbers");
        setStats(await r.json());
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the numbers"));
  }, []);
  const peak = Math.max(1, ...(stats?.daily.map((d) => d.people) ?? []));

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/40" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Usage stats"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="h-5 w-5 text-blue-600" /> Usage stats
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {!stats && !error && <p className="mt-3 text-sm text-gray-500">Loading…</p>}
        {stats && (
          <>
            <h3 className="mt-4 text-sm font-medium text-gray-500">People using the app</h3>
            <dl className="mt-1 grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ["Today", stats.active.d1],
                  ["7 days", stats.active.d7],
                  ["30 days", stats.active.d30],
                ] as const
              ).map(([label, n]) => (
                <div key={label} className="rounded-xl bg-gray-50 p-3">
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="text-2xl font-bold tabular-nums">{n}</dd>
                </div>
              ))}
            </dl>
            {stats.daily.length > 0 && (
              <div className="mt-3 flex h-16 items-end gap-0.5" aria-label="People per day, last 30 days" role="img">
                {stats.daily.map((d) => (
                  <div
                    key={d.day}
                    title={`${d.day}: ${d.people}`}
                    className="flex-1 rounded-t bg-blue-500"
                    style={{ height: `${Math.max(4, (d.people / peak) * 100)}%` }}
                  />
                ))}
              </div>
            )}

            <h3 className="mt-5 text-sm font-medium text-gray-500">What people do</h3>
            <table className="mt-1 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="py-1 font-normal"></th>
                  <th className="py-1 text-right font-normal">7 days</th>
                  <th className="py-1 text-right font-normal">30 days</th>
                </tr>
              </thead>
              <tbody>
                {stats.events.map((e) => (
                  <tr key={e.name} className="border-t border-gray-100">
                    <td className="py-1.5">{LABELS[e.name] ?? e.name}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {e.d7} <span className="text-xs text-gray-500">({e.p7} people)</span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {e.d30} <span className="text-xs text-gray-500">({e.p30})</span>
                    </td>
                  </tr>
                ))}
                {stats.events.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-3 text-center text-gray-500">
                      Nothing counted yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <h3 className="mt-5 text-sm font-medium text-gray-500">All time</h3>
            <p className="mt-1 text-sm text-gray-700">
              {stats.totals.accounts} accounts ({stats.totals.new7} new this week, {stats.totals.new30} this month) ·{" "}
              {stats.totals.trips} trips in accounts ({stats.totals.trips7} this week) · {stats.totals.shared} shared
            </p>
            <p className="mt-3 text-xs text-gray-500">
              Anonymous: people are counted by a code that changes every month; no locations or trip details are kept.
              Trips only on someone's phone aren't in the all-time numbers.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
