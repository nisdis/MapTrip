import type { Pool } from "pg";

// Reactions and comments on shared trips, and the notifications they make.
//
// Reading: anyone who can see the trip (public, or unlisted with its link).
// Writing: signed in, with a public name, and able to see it as a person:
// public trips, or unlisted ones for their owner and approved followers.
// Never between people who have blocked each other.

export const REACTIONS = ["clap", "heart", "wow", "laugh", "fire"] as const;
export type Reaction = (typeof REACTIONS)[number];

const MAX_COMMENT = 500;
const MAX_COMMENTS_PER_HOUR = 20;

interface TripAccess {
  owner: string;
  title: string;
  visibility: string;
}

async function tripFor(pool: Pool, tripId: string): Promise<TripAccess | null> {
  const { rows } = await pool.query<{ user_id: string; title: string | null; visibility: string; hidden_at: Date | null }>(
    "select user_id, data->>'name' as title, visibility, hidden_at from trips where id = $1",
    [tripId],
  );
  const t = rows[0];
  if (!t || t.visibility === "private" || (t.visibility === "public" && t.hidden_at)) return null;
  return { owner: t.user_id, title: t.title ?? "Trip", visibility: t.visibility };
}

const blocked = async (pool: Pool, a: string, b: string) =>
  !!(
    await pool.query(
      "select 1 from blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1)",
      [a, b],
    )
  ).rowCount;

/** Why `me` can't react or comment on this trip (null: they can). */
export async function cannotTalk(pool: Pool, me: string, tripId: string): Promise<{ status: number; message: string } | null> {
  const t = await tripFor(pool, tripId);
  if (!t) return { status: 404, message: "Trip not found" };
  if (t.owner === me) return null;
  const name = await pool.query("select 1 from profiles where user_id = $1", [me]);
  if (!name.rowCount) return { status: 409, message: "Choose a public name first" };
  if (await blocked(pool, me, t.owner)) return { status: 404, message: "Trip not found" };
  if (t.visibility === "unlisted") {
    const f = await pool.query("select 1 from follows where follower_id = $1 and followee_id = $2 and status = 'approved'", [me, t.owner]);
    if (!f.rowCount) return { status: 403, message: "Only their followers can react to this trip" };
  }
  return null;
}

/** Reactions and comments on a trip, as `viewer` (null: signed out) sees them. */
export async function talkFor(pool: Pool, tripId: string, viewer: string | null) {
  const t = await tripFor(pool, tripId);
  if (!t) return null;
  const hiddenFor = viewer
    ? (await pool.query<{ id: string }>(
        "select case when blocker_id = $1 then blocked_id else blocker_id end as id from blocks where blocker_id = $1 or blocked_id = $1",
        [viewer],
      )).rows.map((r) => r.id)
    : [];
  const reactions = await pool.query<{ emoji: string; user_id: string; display_name: string | null }>(
    `select r.emoji, r.user_id, p.display_name from trip_reactions r left join profiles p on p.user_id = r.user_id
     where r.trip_id = $1 order by r.created_at desc`,
    [tripId],
  );
  const comments = await pool.query<{ id: string; user_id: string; display_name: string | null; body: string; created_at: Date }>(
    `select c.id, c.user_id, p.display_name, c.body, c.created_at from trip_comments c left join profiles p on p.user_id = c.user_id
     where c.trip_id = $1 order by c.created_at asc limit 200`,
    [tripId],
  );
  const visible = <T extends { user_id: string }>(rows: T[]) => rows.filter((r) => !hiddenFor.includes(r.user_id));
  const counts = Object.fromEntries(REACTIONS.map((e) => [e, 0])) as Record<Reaction, number>;
  for (const r of visible(reactions.rows)) if (r.emoji in counts) counts[r.emoji as Reaction] += 1;
  const canTalk = viewer ? !(await cannotTalk(pool, viewer, tripId)) : false;
  return {
    counts,
    mine: (viewer && reactions.rows.find((r) => r.user_id === viewer)?.emoji) || null,
    /** who reacted, newest first (names only) */
    people: visible(reactions.rows)
      .slice(0, 30)
      .map((r) => ({ userId: r.user_id, name: r.display_name ?? "Someone", emoji: r.emoji })),
    comments: visible(comments.rows).map((c) => ({
      id: c.id,
      author: { id: c.user_id, name: c.display_name ?? "Someone" },
      body: c.body,
      createdAt: c.created_at.getTime(),
      canDelete: !!viewer && (viewer === c.user_id || viewer === t.owner),
    })),
    canTalk,
    isOwner: viewer === t.owner,
  };
}

async function notify(pool: Pool, owner: string, actor: string, tripId: string, kind: "reaction" | "comment", extra: { emoji?: string; commentId?: string }) {
  if (owner === actor) return;
  if (kind === "reaction") {
    // One per person per trip: changing your reaction updates it (and it shows as new again).
    await pool.query(
      `insert into notifications (user_id, kind, actor_id, trip_id, emoji) values ($1, 'reaction', $2, $3, $4)
       on conflict (user_id, actor_id, trip_id) where kind = 'reaction'
       do update set emoji = excluded.emoji, created_at = now(), read_at = null`,
      [owner, actor, tripId, extra.emoji],
    );
  } else {
    await pool.query(
      "insert into notifications (user_id, kind, actor_id, trip_id, comment_id) values ($1, 'comment', $2, $3, $4)",
      [owner, actor, tripId, extra.commentId],
    );
  }
  // Keep each person's list short.
  if (Math.random() < 0.05) {
    await pool.query(
      `delete from notifications where user_id = $1 and id not in
       (select id from notifications where user_id = $1 order by created_at desc limit 200)`,
      [owner],
    );
  }
}

/** Sets (or, with null, removes) `me`'s reaction. */
export async function react(pool: Pool, me: string, tripId: string, emoji: unknown) {
  const why = await cannotTalk(pool, me, tripId);
  if (why) return why;
  const t = (await tripFor(pool, tripId))!;
  if (emoji === null) {
    await pool.query("delete from trip_reactions where trip_id = $1 and user_id = $2", [tripId, me]);
    await pool.query("delete from notifications where kind = 'reaction' and actor_id = $1 and trip_id = $2", [me, tripId]);
    return null;
  }
  if (typeof emoji !== "string" || !(REACTIONS as readonly string[]).includes(emoji)) return { status: 400, message: "Unknown reaction" };
  await pool.query(
    `insert into trip_reactions (trip_id, user_id, emoji) values ($1, $2, $3)
     on conflict (trip_id, user_id) do update set emoji = excluded.emoji`,
    [tripId, me, emoji],
  );
  await notify(pool, t.owner, me, tripId, "reaction", { emoji });
  return null;
}

/** Tidies a comment: trimmed, at most 500 characters and a few lines. Null if empty. */
export function cleanComment(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const lines = raw.replace(/\r/g, "").split("\n").map((l) => l.trimEnd());
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_COMMENT);
  return text.length ? text : null;
}

export async function addComment(pool: Pool, me: string, tripId: string, raw: unknown) {
  const why = await cannotTalk(pool, me, tripId);
  if (why) return { error: why };
  const body = cleanComment(raw);
  if (!body) return { error: { status: 400, message: "Write something first" } };
  const recent = await pool.query("select 1 from trip_comments where user_id = $1 and created_at > now() - interval '1 hour'", [me]);
  if ((recent.rowCount ?? 0) >= MAX_COMMENTS_PER_HOUR) return { error: { status: 429, message: "That's a lot of comments. Try again later." } };
  const t = (await tripFor(pool, tripId))!;
  const { rows } = await pool.query<{ id: string }>(
    "insert into trip_comments (trip_id, user_id, body) values ($1, $2, $3) returning id",
    [tripId, me, body],
  );
  await notify(pool, t.owner, me, tripId, "comment", { commentId: rows[0].id });
  return { id: rows[0].id };
}

/** Its author, or the trip's owner, may delete a comment. */
export async function deleteComment(pool: Pool, me: string, commentId: string) {
  const { rowCount } = await pool.query(
    `delete from trip_comments c using trips t
     where c.id = $1 and t.id = c.trip_id and (c.user_id = $2 or t.user_id = $2)`,
    [commentId, me],
  );
  return rowCount ? null : { status: 404, message: "Comment not found" };
}

export const COMMENT_REPORT_REASONS = ["spam", "harassment", "inappropriate", "other"];

export async function reportComment(pool: Pool, me: string, commentId: string, reason: unknown) {
  if (typeof reason !== "string" || !COMMENT_REPORT_REASONS.includes(reason)) return { status: 400, message: "Choose a reason" };
  const c = await pool.query<{ trip_id: string; user_id: string }>("select trip_id, user_id from trip_comments where id = $1", [commentId]);
  if (!c.rows[0] || !(await tripFor(pool, c.rows[0].trip_id))) return { status: 404, message: "Comment not found" };
  if (c.rows[0].user_id === me) return { status: 400, message: "That's your own comment" };
  await pool.query(
    "insert into comment_reports (comment_id, reporter_id, reason) values ($1, $2, $3) on conflict do nothing",
    [commentId, me, reason],
  );
  return null;
}

/** For the admin Reports page. */
export async function reportedComments(pool: Pool) {
  const { rows } = await pool.query(
    `select c.id, c.trip_id, c.body, p.display_name as author, count(r.*)::int as count,
            array_agg(r.reason order by r.created_at) as reasons, max(r.created_at) as last_at
     from comment_reports r join trip_comments c on c.id = r.comment_id left join profiles p on p.user_id = c.user_id
     where r.resolved_at is null group by c.id, p.display_name order by max(r.created_at) desc`,
  );
  return rows;
}

export async function moderateComment(pool: Pool, commentId: string, decision: unknown) {
  if (decision === "remove") await pool.query("delete from trip_comments where id = $1", [commentId]);
  else if (decision === "keep") await pool.query("update comment_reports set resolved_at = now() where comment_id = $1", [commentId]);
  else return { status: 400, message: "Invalid decision" };
  return null;
}

/** `me`'s notifications, newest first, and how many are unread. */
export async function notificationsFor(pool: Pool, me: string) {
  const { rows } = await pool.query<{
    id: string; kind: string; actor_id: string; actor: string | null; trip_id: string; title: string | null;
    emoji: string | null; comment: string | null; created_at: Date; read_at: Date | null;
  }>(
    `select n.id, n.kind, n.actor_id, p.display_name as actor, n.trip_id, t.data->>'name' as title, n.emoji,
            left(c.body, 140) as comment, n.created_at, n.read_at
     from notifications n
     join trips t on t.id = n.trip_id
     left join profiles p on p.user_id = n.actor_id
     left join trip_comments c on c.id = n.comment_id
     where n.user_id = $1 and (n.kind <> 'comment' or c.id is not null)
       and not exists (select 1 from blocks b where (b.blocker_id = $1 and b.blocked_id = n.actor_id) or (b.blocker_id = n.actor_id and b.blocked_id = $1))
     order by n.created_at desc limit 50`,
    [me],
  );
  return {
    unread: rows.filter((r) => !r.read_at).length,
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      actor: { id: r.actor_id, name: r.actor ?? "Someone" },
      trip: { id: r.trip_id, title: r.title ?? "Trip" },
      emoji: r.emoji,
      comment: r.comment,
      at: r.created_at.getTime(),
      read: !!r.read_at,
    })),
  };
}

export const markAllRead = (pool: Pool, me: string) =>
  pool.query("update notifications set read_at = now() where user_id = $1 and read_at is null", [me]);
