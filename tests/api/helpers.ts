import { execFileSync } from "node:child_process";
import { Pool } from "pg";

export const hasDb = !!process.env.DATABASE_URL;
const ORIGIN = "http://localhost:5173";

/** Create tables (same script Vercel runs on deploy) and empty them. */
export async function resetDb() {
  execFileSync("node", ["scripts/migrate.mjs"], { stdio: "ignore", env: process.env });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  await pool.query('truncate follows, blocks, trip_reports, trip_views, profiles, live_shares, trips, saved_places, session, account, verification, "user" cascade');
  await pool.end();
}

type Handler = (req: Request) => Promise<Response>;

export function call(handler: Handler, method: string, path: string, body?: unknown, cookie?: string) {
  return handler(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

/** Sign up through the real /api/auth handler; returns the session cookie. */
export async function signUp(authHandler: Handler, email: string): Promise<string> {
  const res = await call(authHandler, "POST", "/api/auth/sign-up/email", { email, password: "password123", name: email });
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
