import { getAuth } from "./_lib/auth.js";
import { getPool } from "./_lib/db.js";
import { rejectForeignOrigin } from "./_lib/origin.js";
import { achievementsFor, factsOf } from "./_lib/achievements.js";
import { statsOf, pointsOf } from "./_lib/publicTrip.js";
import { cellCenter } from "./_lib/explored.js";
import { haversineM } from "./_lib/live.js";
import { addComment, deleteComment, markAllRead, notificationsFor, react, reportComment, talkFor } from "./_lib/talk.js";
import { badgesFor, monthOf, progressFor, streakOf, type TripFact } from "./_lib/challenges.js";

/** Explored squares this close to someone's Home or Work never show on their profile. */
const EXPLORED_HIDE_M = 1500;

// Following, blocking, profiles, the Following feed, the leaderboard and
// achievements.
//
//   GET  ?profile=<userId>        a person's profile (public; more if you're an approved follower)
//   GET  ?people=1                my requests, followers, following, blocks, settings
//   GET  ?feed=1                  trips from people I follow (public + unlisted)
//   GET  ?leaderboard=week|month  distance among me and the people I follow who opted in
//   POST {action: follow | unfollow | respond | removeFollower | block | unblock | settings, user?, ...}
//
// Rules: following needs the other person's approval; approved followers see
// Public and Unlisted trips, others only Public; private trips are never shown.
// A block removes follows both ways and stops new requests either way.

const json = (body: unknown, status = 200, cache = "no-store") =>
  Response.json(body, { status, headers: { "Cache-Control": cache } });

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FEED_LIMIT = 40;

type Rel = "none" | "pending" | "approved";

async function sessionUser(request: Request) {
  const s = await getAuth().api.getSession({ headers: request.headers });
  return s?.user ?? null;
}

async function relation(me: string | null, other: string) {
  if (!me || me === other) return { following: "none" as Rel, followsMe: "none" as Rel, blockedByMe: false, blockedMe: false };
  const pool = getPool();
  const { rows } = await pool.query<{ follower_id: string; status: Rel }>(
    "select follower_id, status from follows where (follower_id = $1 and followee_id = $2) or (follower_id = $2 and followee_id = $1)",
    [me, other],
  );
  const b = await pool.query<{ blocker_id: string }>(
    "select blocker_id from blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1)",
    [me, other],
  );
  return {
    following: rows.find((r) => r.follower_id === me)?.status ?? ("none" as Rel),
    followsMe: rows.find((r) => r.follower_id === other)?.status ?? ("none" as Rel),
    blockedByMe: b.rows.some((r) => r.blocker_id === me),
    blockedMe: b.rows.some((r) => r.blocker_id === other),
  };
}

type CardRow = {
  id: string;
  data: Record<string, unknown>;
  visibility: string;
  views: number;
  share_polyline: string[] | null;
  reactions?: number;
  comments?: number;
};

/** For trip cards: how many reactions and comments (select list fragment; `t` is the trip). */
const TALK_COUNTS = `(select count(*) from trip_reactions r where r.trip_id = t.id)::int as reactions,
  (select count(*) from trip_comments c where c.trip_id = t.id)::int as comments`;

const tripCard = (r: CardRow) => {
  const pts = pointsOf(r.data);
  return {
    id: r.id,
    title: typeof r.data.name === "string" ? r.data.name.slice(0, 120) : "Trip",
    visibility: r.visibility,
    imported: r.data.imported === true,
    stats: statsOf(r.data, pts),
    views: r.views,
    /** the visible (trimmed) route as encoded polylines, for drawing on the card */
    line: r.share_polyline ?? [],
    reactions: r.reactions ?? 0,
    comments: r.comments ?? 0,
  };
};

// ---------------------------------------------------------------- reading

async function profile(request: Request, userId: string): Promise<Response> {
  const me = (await sessionUser(request))?.id ?? null;
  const pool = getPool();
  const { rows } = await pool.query<{ display_name: string; show_achievements: boolean; leaderboard: boolean; show_explored: boolean }>(
    "select display_name, show_achievements, leaderboard, show_explored from profiles where user_id = $1",
    [userId],
  );
  const p = rows[0];
  // People without a public name have no profile.
  if (!p) return json({ message: "No such profile" }, 404);
  const rel = await relation(me, userId);
  if (rel.blockedMe) return json({ message: "No such profile" }, 404);
  const isMe = me === userId;
  const canSeeUnlisted = isMe || rel.following === "approved";
  const counts = await pool.query<{ followers: number; following: number }>(
    `select (select count(*)::int from follows where followee_id = $1 and status = 'approved') as followers,
            (select count(*)::int from follows where follower_id = $1 and status = 'approved') as following`,
    [userId],
  );
  const trips = await pool.query<CardRow>(
    `select t.id, t.data, t.visibility, t.views, t.share_polyline, ${TALK_COUNTS} from trips t
     where user_id = $1 and (visibility = 'public' or (visibility = 'unlisted' and $2::boolean) or ($3::boolean and visibility <> 'private'))
       and (hidden_at is null or visibility <> 'public' or $3::boolean)
     order by created_at desc limit 100`,
    [userId, canSeeUnlisted, isMe],
  );
  let achievements = null;
  let badges: ReturnType<typeof badgesFor> | null = null;
  if (isMe || p.show_achievements) {
    const all = await pool.query<{ data: Record<string, unknown> }>("select data from trips where user_id = $1 and data->>'kind' = 'recorded'", [userId]);
    achievements = achievementsFor(all.rows.map((r) => factsOf(r.data)));
    if (!isMe) achievements = achievements.filter((a) => a.earned);
    const tz = (await pool.query<{ tz: string | null }>("select tz from profiles where user_id = $1", [userId])).rows[0]?.tz;
    badges = badgesFor((await factsFor([userId])).get(userId) ?? [], Date.now(), tz);
  }
  // Explored map, if they chose to show it: only from trips this viewer may
  // see, as shared (start and end trimmed), never near their Home or Work.
  let explored: string[] | null = null;
  if (p.show_explored) {
    const cells = await pool.query<{ cell: string }>(
      `select distinct jsonb_array_elements_text(share_cells) as cell from trips
       where user_id = $1 and share_cells is not null and data->>'kind' = 'recorded'
         and (visibility = 'public' or (visibility = 'unlisted' and $2::boolean))
         and (hidden_at is null or visibility <> 'public')`,
      [userId, canSeeUnlisted],
    );
    const homes = await pool.query<{ lat: number; lng: number }>(
      `select (data->'place'->>'lat')::float as lat, (data->'place'->>'lng')::float as lng from saved_places
       where user_id = $1 and key in ('home', 'work') and coalesce((data->>'deleted')::boolean, false) = false`,
      [userId],
    );
    explored = cells.rows
      .map((r) => r.cell)
      .filter((c) => !homes.rows.some((h) => haversineM(cellCenter(c), [h.lat, h.lng]) < EXPLORED_HIDE_M));
  }
  return json({
    userId,
    displayName: p.display_name,
    explored,
    isMe,
    followers: counts.rows[0].followers,
    following: counts.rows[0].following,
    relationship: rel,
    trips: trips.rows.map(tripCard),
    achievements,
    /** monthly challenges completed (shown with achievements) */
    badges,
    settings: isMe ? { leaderboard: p.leaderboard, showAchievements: p.show_achievements, showExplored: p.show_explored } : undefined,
  });
}

async function people(me: string): Promise<Response> {
  const pool = getPool();
  const list = async (sql: string) =>
    (await pool.query<{ user_id: string; display_name: string | null; at: Date }>(sql, [me])).rows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      at: r.at.getTime(),
    }));
  const [requests, followers, following, sent, blocked] = await Promise.all([
    list(`select f.follower_id as user_id, p.display_name, f.created_at as at from follows f left join profiles p on p.user_id = f.follower_id
          where f.followee_id = $1 and f.status = 'pending' order by f.created_at desc`),
    list(`select f.follower_id as user_id, p.display_name, f.approved_at as at from follows f left join profiles p on p.user_id = f.follower_id
          where f.followee_id = $1 and f.status = 'approved' order by p.display_name`),
    list(`select f.followee_id as user_id, p.display_name, f.approved_at as at from follows f left join profiles p on p.user_id = f.followee_id
          where f.follower_id = $1 and f.status = 'approved' order by p.display_name`),
    list(`select f.followee_id as user_id, p.display_name, f.created_at as at from follows f left join profiles p on p.user_id = f.followee_id
          where f.follower_id = $1 and f.status = 'pending' order by f.created_at desc`),
    list(`select b.blocked_id as user_id, p.display_name, b.created_at as at from blocks b left join profiles p on p.user_id = b.blocked_id
          where b.blocker_id = $1 order by b.created_at desc`),
  ]);
  const { rows } = await pool.query<{ display_name: string; leaderboard: boolean; show_achievements: boolean; show_explored: boolean }>(
    "select display_name, leaderboard, show_achievements, show_explored from profiles where user_id = $1",
    [me],
  );
  return json({
    me: { userId: me, displayName: rows[0]?.display_name ?? null, leaderboard: rows[0]?.leaderboard ?? false, showAchievements: rows[0]?.show_achievements ?? false, showExplored: rows[0]?.show_explored ?? false },
    requests,
    /** unread reactions and comments on your trips */
    unread: (await pool.query<{ n: number }>("select count(*)::int as n from notifications where user_id = $1 and read_at is null", [me])).rows[0].n,
    followers,
    following,
    sent,
    blocked,
  });
}

async function feed(me: string): Promise<Response> {
  const { rows } = await getPool().query<CardRow & { user_id: string; display_name: string | null }>(
    `select t.id, t.data, t.visibility, t.views, t.share_polyline, t.user_id, p.display_name, ${TALK_COUNTS}
     from follows f join trips t on t.user_id = f.followee_id left join profiles p on p.user_id = t.user_id
     where f.follower_id = $1 and f.status = 'approved' and t.visibility in ('public', 'unlisted')
       and not exists (select 1 from blocks b where (b.blocker_id = $1 and b.blocked_id = t.user_id) or (b.blocker_id = t.user_id and b.blocked_id = $1))
     order by t.created_at desc limit ${FEED_LIMIT}`,
    [me],
  );
  return json({ trips: rows.map((r) => ({ ...tripCard(r), authorId: r.user_id, author: r.display_name })) });
}

/** Trips as the streak and challenge rules need them. */
async function factsFor(userIds: string[]) {
  const { rows } = await getPool().query<{ user_id: string; created_at: Date; distance: number | null; kind: string | null; imported: boolean | null; media: number; cells: string[] | null }>(
    `select user_id, created_at, (data->>'distanceM')::float as distance, data->>'kind' as kind,
            (data->>'imported')::boolean as imported, coalesce(jsonb_array_length(data->'photos'), 0) as media, cells
     from trips where user_id = any($1)`,
    [userIds],
  );
  const by = new Map<string, TripFact[]>();
  for (const r of rows) {
    const f: TripFact = { createdAt: r.created_at.getTime(), distanceM: r.distance ?? 0, kind: r.kind ?? "recorded", imported: !!r.imported, media: r.media, cells: r.cells ?? [] };
    by.set(r.user_id, [...(by.get(r.user_id) ?? []), f]);
  }
  return by;
}

const validTz = (tz: unknown): string | null => {
  if (typeof tz !== "string" || tz.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
};

/** Your streak, this month's challenges, earlier badges; and people you follow who joined the leaderboard. */
async function challenges(me: string, tzParam: unknown): Promise<Response> {
  const pool = getPool();
  const tz = validTz(tzParam);
  if (tz) await pool.query("update profiles set tz = $2 where user_id = $1 and tz is distinct from $2", [me, tz]);
  const now = Date.now();
  const month = monthOf(now, tz);
  const mine = (await factsFor([me])).get(me) ?? [];
  const p = (await pool.query<{ leaderboard: boolean }>("select leaderboard from profiles where user_id = $1", [me])).rows[0];
  const friendsRows = (
    await pool.query<{ user_id: string; display_name: string; tz: string | null }>(
      `select p.user_id, p.display_name, p.tz from follows f join profiles p on p.user_id = f.followee_id
       where f.follower_id = $1 and f.status = 'approved' and p.leaderboard`,
      [me],
    )
  ).rows;
  const theirs = await factsFor(friendsRows.map((f) => f.user_id));
  const friends = friendsRows.map((f) => {
    const t = theirs.get(f.user_id) ?? [];
    const progress = progressFor(t, month, f.tz);
    return { userId: f.user_id, name: f.display_name, done: progress.filter((x) => x.done).length, progress, streak: streakOf(t, now, f.tz).current };
  });
  return json({
    month,
    challenges: progressFor(mine, month, tz),
    streak: streakOf(mine, now, tz),
    badges: badgesFor(mine, now, tz),
    /** your own progress is shown to followers only if you joined the leaderboard */
    sharing: p?.leaderboard ?? false,
    friends: friends.sort((a, b) => b.done - a.done || b.streak - a.streak),
  });
}

async function leaderboard(me: string, period: string): Promise<Response> {
  const days = period === "month" ? 30 : 7;
  const pool = getPool();
  const mine = await pool.query<{ leaderboard: boolean }>("select leaderboard from profiles where user_id = $1", [me]);
  const { rows } = await pool.query<{ user_id: string; display_name: string; km: number; trips: number }>(
    `select p.user_id, p.display_name,
            coalesce(sum((t.data->>'distanceM')::float), 0) / 1000 as km,
            count(t.id)::int as trips
     from profiles p
     left join trips t on t.user_id = p.user_id and t.data->>'kind' = 'recorded'
       and coalesce((t.data->>'imported')::boolean, false) = false
       and t.created_at > now() - make_interval(days => $2)
     where p.leaderboard and (p.user_id = $1 or p.user_id in (select followee_id from follows where follower_id = $1 and status = 'approved'))
     group by p.user_id, p.display_name
     order by km desc, p.display_name
     limit 100`,
    [me, days],
  );
  return json({
    period: days === 30 ? "month" : "week",
    optedIn: mine.rows[0]?.leaderboard ?? false,
    rows: rows.map((r, i) => ({ rank: i + 1, userId: r.user_id, displayName: r.display_name, km: Math.round(r.km * 10) / 10, trips: r.trips, isMe: r.user_id === me })),
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  try {
    const p = url.searchParams.get("profile");
    if (p != null) return ID_RE.test(p) ? await profile(request, p) : json({ message: "No such profile" }, 404);
    // Reactions and comments on a shared trip: anyone who can see it can read them.
    const talk = url.searchParams.get("talk");
    if (talk != null) {
      if (!UUID_RE.test(talk)) return json({ message: "Trip not found" }, 404);
      const viewer = request.headers.get("cookie") ? (await sessionUser(request))?.id ?? null : null;
      const t = await talkFor(getPool(), talk, viewer);
      return t ? json(t) : json({ message: "Trip not found" }, 404);
    }
    const me = await sessionUser(request);
    if (!me) return json({ message: "Please sign in" }, 401);
    if (url.searchParams.has("notifications")) return json(await notificationsFor(getPool(), me.id));
    if (url.searchParams.has("challenges")) return await challenges(me.id, url.searchParams.get("tz"));
    if (url.searchParams.has("people")) return await people(me.id);
    if (url.searchParams.has("feed")) return await feed(me.id);
    const lb = url.searchParams.get("leaderboard");
    if (lb != null) return await leaderboard(me.id, lb);
    return json({ message: "Not found" }, 404);
  } catch (error) {
    console.error("Social error:", error);
    return json({ message: "Not available right now." }, 503);
  }
}

// ---------------------------------------------------------------- writing

export async function POST(request: Request): Promise<Response> {
  const foreign = rejectForeignOrigin(request);
  if (foreign) return foreign;
  try {
    const me = await sessionUser(request);
    if (!me) return json({ message: "Please sign in" }, 401);
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return json({ message: "Invalid request" }, 400);
    }
    const pool = getPool();

    // Reactions and comments.
    const fail = (e: { status: number; message: string } | null) => (e ? json({ message: e.message }, e.status) : json({ ok: true }));
    const tripId = typeof body.trip === "string" && UUID_RE.test(body.trip) ? body.trip : null;
    const commentId = typeof body.comment === "string" && UUID_RE.test(body.comment) ? body.comment : null;
    if (body.action === "react") return tripId ? fail(await react(pool, me.id, tripId, body.emoji ?? null)) : json({ message: "Trip not found" }, 404);
    if (body.action === "comment") {
      if (!tripId) return json({ message: "Trip not found" }, 404);
      const r = await addComment(pool, me.id, tripId, body.body);
      return "error" in r && r.error ? fail(r.error) : json({ ok: true, id: (r as { id: string }).id });
    }
    if (body.action === "deleteComment") return commentId ? fail(await deleteComment(pool, me.id, commentId)) : json({ message: "Comment not found" }, 404);
    if (body.action === "reportComment") return commentId ? fail(await reportComment(pool, me.id, commentId, body.reason)) : json({ message: "Comment not found" }, 404);
    if (body.action === "readNotifications") {
      await markAllRead(pool, me.id);
      return json({ ok: true });
    }

    if (body.action === "settings") {
      const has = await pool.query("select 1 from profiles where user_id = $1", [me.id]);
      if (!has.rowCount) return json({ message: "Choose a public name first", needsName: true }, 409);
      if (typeof body.leaderboard === "boolean") {
        await pool.query("update profiles set leaderboard = $2 where user_id = $1", [me.id, body.leaderboard]);
      }
      if (typeof body.showAchievements === "boolean") {
        await pool.query("update profiles set show_achievements = $2 where user_id = $1", [me.id, body.showAchievements]);
      }
      if (typeof body.showExplored === "boolean") {
        await pool.query("update profiles set show_explored = $2 where user_id = $1", [me.id, body.showExplored]);
      }
      return json({ ok: true });
    }

    const other = typeof body.user === "string" && ID_RE.test(body.user) ? body.user : null;
    if (!other || other === me.id) return json({ message: "Invalid person" }, 400);
    const rel = await relation(me.id, other);

    switch (body.action) {
      case "follow": {
        // A block either way looks like "no such person" (it doesn't reveal the block).
        const exists = await pool.query("select 1 from profiles where user_id = $1", [other]);
        if (!exists.rowCount || rel.blockedMe || rel.blockedByMe) return json({ message: "No such profile" }, 404);
        const mine = await pool.query("select 1 from profiles where user_id = $1", [me.id]);
        if (!mine.rowCount) return json({ message: "Choose a public name first", needsName: true }, 409);
        await pool.query(
          "insert into follows (follower_id, followee_id) values ($1, $2) on conflict do nothing",
          [me.id, other],
        );
        return json({ ok: true, following: rel.following === "approved" ? "approved" : "pending" });
      }
      case "unfollow": // also cancels a pending request
        await pool.query("delete from follows where follower_id = $1 and followee_id = $2", [me.id, other]);
        return json({ ok: true });
      case "respond":
        if (body.accept === true) {
          await pool.query(
            "update follows set status = 'approved', approved_at = now() where follower_id = $2 and followee_id = $1 and status = 'pending'",
            [me.id, other],
          );
        } else {
          await pool.query("delete from follows where follower_id = $2 and followee_id = $1 and status = 'pending'", [me.id, other]);
        }
        return json({ ok: true });
      case "removeFollower":
        await pool.query("delete from follows where follower_id = $2 and followee_id = $1", [me.id, other]);
        return json({ ok: true });
      case "block":
        await pool.query("insert into blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing", [me.id, other]);
        await pool.query(
          "delete from follows where (follower_id = $1 and followee_id = $2) or (follower_id = $2 and followee_id = $1)",
          [me.id, other],
        );
        return json({ ok: true });
      case "unblock":
        await pool.query("delete from blocks where blocker_id = $1 and blocked_id = $2", [me.id, other]);
        return json({ ok: true });
    }
    return json({ message: "Unknown action" }, 400);
  } catch (error) {
    console.error("Social error:", error);
    return json({ message: "Not available right now." }, 503);
  }
}
