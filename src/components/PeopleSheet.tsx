import { useCallback, useEffect, useState } from "react";
import { Check, Trophy, UserRound, Users, X } from "lucide-react";
import {
  getFeed,
  getLeaderboard,
  getPeople,
  removeFollower,
  respond,
  saveSocialSettings,
  unblock,
  unfollow,
  type Leaderboard,
  type People,
  type Person,
  type TripCard,
} from "../services/social";
import { formatClock, formatKm } from "../utils/tripStats";

type Tab = "feed" | "leaderboard" | "people";

interface PeopleSheetProps {
  signedIn: boolean;
  /** pending follow requests changed (for the badge) */
  onRequestsChanged: (n: number) => void;
}

const name = (p: { displayName: string | null }) => p.displayName ?? "Someone";

/** More › People: trips from people you follow, the leaderboard, requests and who's who. */
export function PeopleSheet({ signedIn, onRequestsChanged }: PeopleSheetProps) {
  const [tab, setTab] = useState<Tab>("feed");
  const [people, setPeople] = useState<People | null>(null);
  const [feed, setFeed] = useState<TripCard[] | null>(null);
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPeople = useCallback(
    () =>
      getPeople()
        .then((p) => {
          setPeople(p);
          onRequestsChanged(p.requests.length);
          if (p.requests.length) setTab((t) => (t === "feed" ? "people" : t));
        })
        .catch((e) => setError(e.message)),
    [onRequestsChanged],
  );
  useEffect(() => {
    if (!signedIn) return;
    void loadPeople();
    getFeed()
      .then((f) => setFeed(f.trips))
      .catch((e) => setError(e.message));
  }, [signedIn, loadPeople]);
  useEffect(() => {
    if (!signedIn || tab !== "leaderboard") return;
    getLeaderboard(period)
      .then(setBoard)
      .catch((e) => setError(e.message));
  }, [signedIn, tab, period]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await loadPeople();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  if (!signedIn) {
    return (
      <div className="flex flex-col gap-2 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
          <Users className="h-5 w-5 text-highway" /> People
        </h2>
        <p className="text-sm text-gray-600">Sign in (Account) to follow people and see their trips.</p>
      </div>
    );
  }

  const row = (p: Person, actions: React.ReactNode) => (
    <li key={p.userId} className="flex items-center gap-2 rounded-xl bg-gray-50 p-2.5">
      <a href={`/u/${p.userId}`} className="flex min-w-0 flex-1 items-center gap-2">
        <span aria-hidden className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-highway text-sm font-bold text-white">
          {name(p).slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate text-sm font-medium text-gray-900">{name(p)}</span>
      </a>
      {actions}
    </li>
  );

  return (
    <div className="flex flex-col gap-3 pb-20">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-highway" />
        <h2 className="flex-1 text-lg font-semibold text-gray-800">People</h2>
        {people?.me.displayName && (
          <a href={`/u/${people.me.userId}`} className="flex items-center gap-1 text-xs font-medium text-highway">
            <UserRound className="h-3.5 w-3.5" /> My profile
          </a>
        )}
      </div>

      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
        {(
          [
            ["feed", "Following"],
            ["leaderboard", "Leaderboard"],
            ["people", `People${people?.requests.length ? ` (${people.requests.length})` : ""}`],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-md py-1.5 text-xs font-medium ${tab === id ? "bg-white text-gray-900 shadow" : "text-gray-600"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {people && !people.me.displayName && (
        <p className="rounded-lg bg-blue-50 p-2 text-xs text-gray-700">
          Choose a public name to follow people: share any trip (Trips › Share) and you'll be asked for one.
        </p>
      )}

      {tab === "feed" && (
        <ul className="space-y-2" aria-label="Trips from people you follow">
          {feed?.length === 0 && (
            <li className="py-6 text-center text-sm text-gray-500">
              Nothing yet. Follow people from their trips in Explore or from a trip they shared with you.
            </li>
          )}
          {feed?.map((t) => (
            <li key={t.id}>
              <a href={`/t/${t.id}`} className="block rounded-xl bg-gray-50 p-3">
                <div className="truncate font-medium text-gray-900">{t.title}</div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {t.author ?? "Someone"} · {formatKm(t.stats.distanceM)} km · {formatClock(t.stats.durationS)} ·{" "}
                  {new Date(`${t.stats.date}T12:00:00Z`).toLocaleDateString([], { day: "numeric", month: "short" })}
                  {t.visibility === "unlisted" ? " · for followers" : ""}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      {tab === "leaderboard" && (
        <div>
          <div className="mb-2 flex gap-1">
            {(["week", "month"] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${period === p ? "bg-highway text-white" : "bg-gray-100 text-gray-700"}`}
              >
                {p === "week" ? "Last 7 days" : "Last 30 days"}
              </button>
            ))}
          </div>
          {board && !board.optedIn && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-gray-50 p-2.5 text-xs text-gray-600">
              <Trophy className="h-4 w-4 flex-shrink-0 text-[#9a6700]" />
              <span className="flex-1">You're not on it. Join to compare your distance with people you follow (only they see it).</span>
              <button
                type="button"
                disabled={!people?.me.displayName}
                onClick={() =>
                  void saveSocialSettings({ leaderboard: true })
                    .then(() => getLeaderboard(period).then(setBoard))
                    .catch((e) => setError(e.message))
                }
                className="rounded-lg bg-highway px-2.5 py-1 font-bold text-white disabled:opacity-50"
              >
                Join
              </button>
            </div>
          )}
          <ol className="space-y-1" aria-label="Leaderboard">
            {board?.rows.map((r) => (
              <li key={r.userId} className={`flex items-center gap-3 rounded-lg p-2.5 ${r.isMe ? "bg-highway/10" : "bg-gray-50"}`}>
                <span className="w-6 text-right text-sm font-bold text-gray-500">{r.rank}</span>
                <a href={`/u/${r.userId}`} className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                  {r.displayName}
                  {r.isMe ? " (you)" : ""}
                </a>
                <span className="text-sm font-bold tabular-nums text-gray-900">{r.km.toLocaleString()} km</span>
                <span className="w-14 text-right text-xs text-gray-500">{r.trips} trip{r.trips === 1 ? "" : "s"}</span>
              </li>
            ))}
            {board && board.rows.length === 0 && board.optedIn && (
              <li className="py-4 text-center text-sm text-gray-500">No trips in this period yet.</li>
            )}
          </ol>
          <p className="mt-2 text-[11px] text-gray-500">Trips recorded in the app; imported files don't count.</p>
        </div>
      )}

      {tab === "people" && people && (
        <div className="space-y-4">
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">Requests to follow you</h3>
            <ul className="mt-1.5 space-y-1.5" aria-label="Follow requests">
              {people.requests.length === 0 && <li className="text-sm text-gray-500">None.</li>}
              {people.requests.map((p) =>
                row(
                  p,
                  <>
                    <button type="button" onClick={() => void act(() => respond(p.userId, true))} aria-label={`Approve ${name(p)}`} className="flex items-center gap-1 rounded-lg bg-highway px-2.5 py-1.5 text-xs font-bold text-white">
                      <Check className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button type="button" onClick={() => void act(() => respond(p.userId, false))} aria-label={`Decline ${name(p)}`} className="rounded-lg p-1.5 text-gray-500">
                      <X className="h-4 w-4" />
                    </button>
                  </>,
                ),
              )}
            </ul>
            <p className="mt-1 text-[11px] text-gray-500">Approved followers see your public and unlisted trips, never private ones.</p>
          </section>
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">Following ({people.following.length})</h3>
            <ul className="mt-1.5 space-y-1.5">
              {people.following.map((p) =>
                row(p, <button type="button" onClick={() => void act(() => unfollow(p.userId))} className="text-xs text-gray-500 underline">Unfollow</button>),
              )}
              {people.sent.map((p) =>
                row(p, <button type="button" onClick={() => void act(() => unfollow(p.userId))} className="text-xs text-gray-500 underline">Cancel request</button>),
              )}
            </ul>
          </section>
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">Followers ({people.followers.length})</h3>
            <ul className="mt-1.5 space-y-1.5">
              {people.followers.map((p) =>
                row(
                  p,
                  <button
                    type="button"
                    onClick={() => window.confirm(`Remove ${name(p)} from your followers?`) && void act(() => removeFollower(p.userId))}
                    className="text-xs text-gray-500 underline"
                  >
                    Remove
                  </button>,
                ),
              )}
            </ul>
          </section>
          {people.blocked.length > 0 && (
            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">Blocked</h3>
              <ul className="mt-1.5 space-y-1.5">
                {people.blocked.map((p) =>
                  row(p, <button type="button" onClick={() => void act(() => unblock(p.userId))} className="text-xs text-gray-500 underline">Unblock</button>),
                )}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
