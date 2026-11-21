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
} catch (error) {
  console.error("[migrate] FAILED - cloud save may not work:", error);
} finally {
  await pool.end();
}
