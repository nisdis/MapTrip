// Creates/updates the Better Auth tables and the trips table.
// Runs before every Vercel build. It never fails the build: the app works
// without cloud save, so a missing/unreachable database only logs a warning.
import { Pool } from "pg";
import { getMigrations } from "better-auth/db/migration";

const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL)
  // Same sanitising as api/_lib/db.ts.
  ?.replace(/([?&])channel_binding=[^&]*&?/, "$1")
  .replace(/[?&]$/, "");
if (!url) {
  console.warn("[migrate] DATABASE_URL not set - skipping (cloud save disabled).");
  process.exit(0);
}

const pool = new Pool({ connectionString: url, max: 1 });
try {
  // Keep in sync with api/_lib/auth.ts (same plugins/fields => same tables).
  const { runMigrations, toBeCreated, toBeAdded } = await getMigrations({
    database: pool,
    emailAndPassword: { enabled: true },
  });
  await runMigrations();
  console.log(
    `[migrate] auth tables ok (created: ${toBeCreated.length}, altered: ${toBeAdded.length})`,
  );

  await pool.query(`
    create table if not exists trips (
      id uuid primary key,
      user_id text not null references "user" (id) on delete cascade,
      data jsonb not null,
      created_at timestamptz not null default now()
    );
    create index if not exists trips_user_created_idx on trips (user_id, created_at desc);
  `);
  console.log("[migrate] trips table ok");

  await pool.query(`
    create table if not exists saved_places (
      user_id text not null references "user" (id) on delete cascade,
      key text not null,
      data jsonb not null,
      updated_at bigint not null,
      primary key (user_id, key)
    );
  `);
  console.log("[migrate] saved_places table ok");

  // Live trip sharing. One row per share link; the location data is dropped as
  // soon as the share ends, and ended/expired rows are deleted after a day.
  await pool.query(`
    create table if not exists live_shares (
      token text primary key,
      user_id text not null references "user" (id) on delete cascade,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      ended_at timestamptz,
      trip_started_at bigint not null,
      status text not null default 'recording',
      stats jsonb not null default '{}'::jsonb,
      points jsonb not null default '[]'::jsonb,
      point_count integer not null default 0,
      trail_rev integer not null default 0,
      updated_at timestamptz not null default now()
    );
    create index if not exists live_shares_user_idx on live_shares (user_id);
    create index if not exists live_shares_expires_idx on live_shares (expires_at);
  `);
  console.log("[migrate] live_shares table ok");

  // Sharing finished trips: visibility per trip (private by default), public
  // names, unique daily views (hashed, kept 2 days) and reports.
  await pool.query(`
    alter table trips add column if not exists visibility text not null default 'private';
    alter table trips add column if not exists share jsonb not null default '{}'::jsonb;
    alter table trips add column if not exists published_at timestamptz;
    alter table trips add column if not exists min_lat double precision;
    alter table trips add column if not exists max_lat double precision;
    alter table trips add column if not exists min_lng double precision;
    alter table trips add column if not exists max_lng double precision;
    alter table trips add column if not exists views integer not null default 0;
    alter table trips add column if not exists hidden_at timestamptz;
    create index if not exists trips_explore_idx on trips (min_lat, max_lat, min_lng, max_lng)
      where visibility = 'public' and hidden_at is null;
    create table if not exists profiles (
      user_id text primary key references "user" (id) on delete cascade,
      display_name text not null,
      updated_at timestamptz not null default now()
    );
    create table if not exists trip_views (
      trip_id uuid not null references trips (id) on delete cascade,
      viewer text not null,
      day date not null default current_date,
      primary key (trip_id, viewer, day)
    );
    create table if not exists trip_reports (
      trip_id uuid not null references trips (id) on delete cascade,
      reporter_id text not null references "user" (id) on delete cascade,
      reason text not null,
      details text,
      created_at timestamptz not null default now(),
      resolved_at timestamptz,
      primary key (trip_id, reporter_id)
    );
  `);
  console.log("[migrate] trip sharing tables ok");

  // Social: follow requests (approved followers also see Unlisted trips),
  // blocks, and per-person choices for the leaderboard and achievements.
  await pool.query(`
    create table if not exists follows (
      follower_id text not null references "user" (id) on delete cascade,
      followee_id text not null references "user" (id) on delete cascade,
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      approved_at timestamptz,
      primary key (follower_id, followee_id),
      check (follower_id <> followee_id)
    );
    create index if not exists follows_followee_idx on follows (followee_id, status);
    create table if not exists blocks (
      blocker_id text not null references "user" (id) on delete cascade,
      blocked_id text not null references "user" (id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (blocker_id, blocked_id)
    );
    alter table profiles add column if not exists leaderboard boolean not null default false;
    alter table profiles add column if not exists show_achievements boolean not null default false;
  `);
  console.log("[migrate] social tables ok");

  // Anonymous usage counts (api/_lib/usage.ts).
  await pool.query(`
    create table if not exists usage_events (
      day date not null,
      name text not null,
      actor text not null,
      count int not null default 1,
      primary key (day, name, actor)
    );
    create index if not exists usage_events_name_day_idx on usage_events (name, day);
  `);
  console.log("[migrate] usage table ok");

  // Reactions, comments and the notifications about them (api/_lib/talk.ts).
  await pool.query(`
    create table if not exists trip_reactions (
      trip_id uuid not null references trips (id) on delete cascade,
      user_id text not null references "user" (id) on delete cascade,
      emoji text not null,
      created_at timestamptz not null default now(),
      primary key (trip_id, user_id)
    );
    create table if not exists trip_comments (
      id uuid primary key default gen_random_uuid(),
      trip_id uuid not null references trips (id) on delete cascade,
      user_id text not null references "user" (id) on delete cascade,
      body text not null,
      created_at timestamptz not null default now()
    );
    create index if not exists trip_comments_trip_idx on trip_comments (trip_id, created_at);
    create index if not exists trip_comments_user_idx on trip_comments (user_id, created_at);
    create table if not exists comment_reports (
      comment_id uuid not null references trip_comments (id) on delete cascade,
      reporter_id text not null references "user" (id) on delete cascade,
      reason text not null,
      created_at timestamptz not null default now(),
      resolved_at timestamptz,
      primary key (comment_id, reporter_id)
    );
    create table if not exists notifications (
      id uuid primary key default gen_random_uuid(),
      user_id text not null references "user" (id) on delete cascade,
      kind text not null,
      actor_id text not null references "user" (id) on delete cascade,
      trip_id uuid not null references trips (id) on delete cascade,
      comment_id uuid references trip_comments (id) on delete cascade,
      emoji text,
      created_at timestamptz not null default now(),
      read_at timestamptz
    );
    create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
    create unique index if not exists notifications_reaction_once on notifications (user_id, actor_id, trip_id) where kind = 'reaction';
  `);
  console.log("[migrate] reactions and comments ok");

  // Tracks stored as a table of points (api/_lib/trackFormat.ts), and the
  // finished route as encoded polylines. Converts trips saved in the old format.
  await pool.query("alter table trips add column if not exists polyline jsonb");
  await pool.query("alter table trips add column if not exists share_polyline jsonb");
  await pool.query("alter table trips add column if not exists cells jsonb");
  await pool.query("alter table trips add column if not exists share_cells jsonb");
  await pool.query("alter table profiles add column if not exists show_explored boolean not null default false");
  // Time zone (IANA name), for weeks and months in streaks and challenges.
  await pool.query("alter table profiles add column if not exists tz text");
  try {
    const { register } = await import("tsx/esm/api");
    register();
    const { convertStoredTracks } = await import("../api/_lib/storedTrip.ts");
    const n = await convertStoredTracks(pool);
    console.log(`[migrate] track format ok (converted ${n} trips)`);
    const { convertPlannedTrips } = await import("../api/_lib/storedTrip.ts");
    console.log(`[migrate] planned trips moved to saved routes: ${await convertPlannedTrips(pool)}`);
    const { backfillCells } = await import("../api/_lib/storedTrip.ts");
    console.log(`[migrate] explored squares filled for ${await backfillCells(pool)} trips`);
    const { backfillShareGeometry } = await import("../api/_lib/shareGeometry.ts");
    console.log(`[migrate] share lines ok (filled ${await backfillShareGeometry(pool)})`);
  } catch (error) {
    console.error("[migrate] track conversion skipped:", error);
  }
} catch (error) {
  console.error("[migrate] FAILED - cloud save may not work:", error);
} finally {
  await pool.end();
}
