import { useEffect, useState } from "react";
import { Check, Flame, Medal, Trophy, Users } from "lucide-react";
import type { Trip } from "../types/trip";
import { badgesFor, monthOf, progressFor, streakOf, type ChallengeProgress, type Streak, type TripFact } from "../../api/_lib/challenges";
import { cellsOfTrack } from "../../api/_lib/explored";
import { track } from "../services/usage";

interface Data {
  month: string;
  challenges: ChallengeProgress[];
  streak: Streak;
  badges: { month: string; id: string; title: string }[];
  sharing?: boolean;
  friends?: { userId: string; name: string; done: number; progress: ChallengeProgress[]; streak: number }[];
}

const TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
})();

/** Signed out: the same rules, from the trips on this phone. */
function localData(trips: Trip[]): Data {
  const facts: TripFact[] = trips.map((t) => ({
    createdAt: t.createdAt,
    distanceM: t.distanceM,
    kind: t.kind,
    imported: t.imported,
    media: t.photos?.length ?? 0,
    cells: t.track ? cellsOfTrack(t.track) : [],
  }));
  const now = Date.now();
  const month = monthOf(now, TZ);
  return { month, challenges: progressFor(facts, month, TZ), streak: streakOf(facts, now, TZ), badges: badgesFor(facts, now, TZ) };
}

const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString([], { month: "long", year: "numeric" });

interface ChallengesSheetProps {
  trips: Trip[];
  signedIn: boolean;
}

/** Weekly streak, this month's challenges, people you follow, and badges. */
export function ChallengesSheet({ trips, signedIn }: ChallengesSheetProps) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => track("challenges_opened"), []);
  useEffect(() => {
    if (!signedIn) return setData(localData(trips));
    fetch(`/api/social?challenges=1&tz=${encodeURIComponent(TZ)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Couldn't load challenges");
        setData(await r.json());
      })
      .catch(() => {
        // Offline: what this phone knows.
        setData(localData(trips));
        setError("Offline: counting the trips on this phone.");
      });
  }, [signedIn, trips]);

  if (!data) return <p className="py-6 text-sm text-gray-500">Loading…</p>;
  const { streak } = data;
  const now = new Date();
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();

  return (
    <div className="flex flex-col gap-4 pb-20">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
        <Trophy aria-hidden className="h-5 w-5 text-amber-500" /> Challenges
      </h2>
      {error && <p className="text-xs text-gray-500">{error}</p>}

      <section aria-label="Weekly streak" className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 p-4">
        <Flame aria-hidden className={`h-10 w-10 ${streak.current ? "text-orange-500" : "text-gray-300"}`} />
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold text-gray-900">
            {streak.current} {streak.current === 1 ? "week" : "weeks"} in a row
          </div>
          <div className="text-sm text-gray-600">
            {streak.thisWeek
              ? "This week is done."
              : streak.current
                ? "Record a trip (1 km or more) this week to keep it going."
                : "Record a trip (1 km or more) this week to start a streak."}
            {streak.best > streak.current && ` Best: ${streak.best}.`}
          </div>
        </div>
      </section>

      <section aria-label="This month's challenges">
        <div className="flex items-baseline justify-between">
          <h3 className="font-medium text-gray-800">{monthName(data.month)}</h3>
          <span className="text-xs text-gray-500">
            {daysLeft} {daysLeft === 1 ? "day" : "days"} left
          </span>
        </div>
        <ul className="mt-2 space-y-2">
          {data.challenges.map((c) => (
            <li key={c.id} className={`rounded-xl p-3 ${c.done ? "bg-green-50" : "bg-gray-50"}`}>
              <div className="flex items-center gap-2">
                <span className="flex-1 font-medium text-gray-900">{c.title}</span>
                {c.done ? (
                  <span className="flex items-center gap-1 text-sm font-semibold text-green-700">
                    <Check aria-hidden className="h-4 w-4" /> Done
                  </span>
                ) : (
                  <span className="text-sm tabular-nums text-gray-600">
                    {c.progress} / {c.target} {c.unit}
                  </span>
                )}
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200"
                role="progressbar"
                aria-label={c.title}
                aria-valuemin={0}
                aria-valuemax={c.target}
                aria-valuenow={c.progress}
              >
                <div className={`h-full rounded-full ${c.done ? "bg-green-600" : "bg-highway"}`} style={{ width: `${(c.progress / c.target) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-gray-500">Trips recorded in the app, 1 km or more, count. New challenges every month.</p>
      </section>

      {signedIn && data.friends && (
        <section aria-label="People you follow">
          <h3 className="flex items-center gap-2 font-medium text-gray-800">
            <Users aria-hidden className="h-4 w-4" /> People you follow
          </h3>
          {data.friends.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">Nobody you follow shares their challenges yet (it's part of joining the leaderboard).</p>
          ) : (
            <ul className="mt-1 divide-y divide-gray-100">
              {data.friends.map((f) => (
                <li key={f.userId} className="flex items-center gap-2 py-2 text-sm">
                  <a href={`/u/${f.userId}`} className="flex-1 font-medium text-gray-900">
                    {f.name}
                  </a>
                  <span className="text-gray-600">{f.done}/3 done</span>
                  {f.streak > 0 && (
                    <span className="flex items-center gap-0.5 text-orange-600">
                      <Flame aria-hidden className="h-3.5 w-3.5" /> {f.streak}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!data.sharing && (
            <p className="mt-1 text-xs text-gray-500">
              Yours are private. Join the leaderboard (on your profile) to share your progress with people who follow you.
            </p>
          )}
        </section>
      )}

      {data.badges.length > 0 && (
        <section aria-label="Badges">
          <h3 className="flex items-center gap-2 font-medium text-gray-800">
            <Medal aria-hidden className="h-4 w-4 text-amber-500" /> Badges
          </h3>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {data.badges.map((b) => (
              <li key={`${b.month}-${b.id}`} className="rounded-xl bg-amber-50 p-2.5 text-sm">
                <div className="font-medium text-gray-900">{b.title}</div>
                <div className="text-xs text-gray-500">{monthName(b.month)}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!signedIn && <p className="text-xs text-gray-500">Counting the trips on this phone. Sign in to include your other devices and see people you follow.</p>}
    </div>
  );
}
