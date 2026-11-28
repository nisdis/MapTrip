import { createHash } from "node:crypto";
import type { Pool } from "pg";

// Usage counts, anonymous: which things happen, how often, and by how many
// people. No locations, no names, no trip ids. A person (account, or the
// device when signed out) is a hash with a secret that changes every month,
// so people can be counted within a month but not followed over time.

export const EVENTS = [
  "app_open",
  "trip_recorded",
  "trip_shared",
  "live_share_started",
  "media_added",
  "route_shown",
  "route_saved",
  "explore_opened",
  "explored_opened",
  "reaction_added",
  "comment_added",
  "challenges_opened",
  "trip_renamed",
] as const;
export type UsageEvent = (typeof EVENTS)[number];

/** Counts per person per event per day stop here (a stuck loop can't inflate them). */
const MAX_PER_DAY = 500;

export function actorKey(id: string, month: string, secret = process.env.BETTER_AUTH_SECRET ?? "") {
  return createHash("sha256").update(`usage|${secret}|${month}|${id}`).digest("base64url").slice(0, 22);
}

export async function recordEvent(pool: Pool, name: UsageEvent, actorId: string, now = new Date()): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  await pool.query(
    `insert into usage_events (day, name, actor, count) values ($1, $2, $3, 1)
     on conflict (day, name, actor) do update set count = least(usage_events.count + 1, ${MAX_PER_DAY})`,
    [day, name, actorKey(actorId, day.slice(0, 7))],
  );
  // Keep about a year.
  if (Math.random() < 0.01) await pool.query("delete from usage_events where day < current_date - 400");
}

/** For the admin Stats page. */
export async function usageStats(pool: Pool) {
  const active = await pool.query<{ d1: number; d7: number; d30: number }>(
    `select count(distinct actor) filter (where day = current_date)::int as d1,
            count(distinct actor) filter (where day > current_date - 7)::int as d7,
            count(distinct actor) filter (where day > current_date - 30)::int as d30
     from usage_events where name = 'app_open' and day > current_date - 30`,
  );
  const events = await pool.query<{ name: string; d7: number; p7: number; d30: number; p30: number }>(
    `select name,
            coalesce(sum(count) filter (where day > current_date - 7), 0)::int as d7,
            count(distinct actor) filter (where day > current_date - 7)::int as p7,
            sum(count)::int as d30,
            count(distinct actor)::int as p30
     from usage_events where day > current_date - 30 group by name order by name`,
  );
  const daily = await pool.query<{ day: string; people: number }>(
    `select to_char(day, 'YYYY-MM-DD') as day, count(distinct actor)::int as people
     from usage_events where name = 'app_open' and day > current_date - 30 group by day order by day`,
  );
  // From the data itself (exact, all time).
  const totals = await pool.query<{ accounts: number; new7: number; new30: number; trips: number; trips7: number; shared: number }>(
    `select (select count(*) from "user")::int as accounts,
            (select count(*) from "user" where "createdAt" > now() - interval '7 days')::int as new7,
            (select count(*) from "user" where "createdAt" > now() - interval '30 days')::int as new30,
            (select count(*) from trips)::int as trips,
            (select count(*) from trips where created_at > now() - interval '7 days')::int as trips7,
            (select count(*) from trips where visibility in ('public', 'unlisted'))::int as shared`,
  );
  return { active: active.rows[0], events: events.rows, daily: daily.rows, totals: totals.rows[0] };
}
