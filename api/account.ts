import { del } from "@vercel/blob";
import { getAuth } from "./_lib/auth.js";
import { getPool } from "./_lib/db.js";
import { rejectForeignOrigin } from "./_lib/origin.js";

// Deleting your account: POST /api/account {action: "delete", password}.
//
// Always needs the password (also with a fresh session), so a phone left
// unlocked or a stolen session can't erase someone's history. Removes the
// account and everything that belongs to it: trips (and their views and
// reports), photos in the file store, saved places, live shares, the public
// name, reports made, and every signed-in session. The database removes the
// linked rows itself (on delete cascade); photos are deleted here first.

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const foreign = rejectForeignOrigin(request);
  if (foreign) return foreign;
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return json({ message: "Please sign in" }, 401);
    let body: { action?: unknown; password?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ message: "Invalid request" }, 400);
    }
    if (body.action !== "delete") return json({ message: "Unknown action" }, 400);
    if (typeof body.password !== "string" || !body.password || body.password.length > 200) {
      return json({ message: "Enter your password to delete your account" }, 400);
    }

    const userId = session.user.id;
    const ctx = await auth.$context;
    const account = await ctx.internalAdapter.findAccountByUserId(userId).then((as) => as.find((a) => a.providerId === "credential"));
    if (!account?.password || !(await ctx.password.verify({ hash: account.password, password: body.password }))) {
      return json({ message: "That password isn't right" }, 403);
    }

    const pool = getPool();
    // Photos live in the file store, outside the database.
    const { rows } = await pool.query<{ path: string }>(
      `select p->>'cloudPath' as path from trips t, jsonb_array_elements(coalesce(t.data->'photos', '[]'::jsonb)) p
       where t.user_id = $1 and p->>'cloudPath' like $2`,
      [userId, `trips/${userId}/%`],
    );
    const paths = rows.map((r) => r.path);
    if (paths.length) {
      try {
        await del(paths);
      } catch (e) {
        // Don't leave the account half-deleted over a file-store hiccup: ask to retry.
        console.error("Photo deletion failed:", e);
        return json({ message: "Couldn't delete your photos right now. Nothing was deleted; please try again." }, 503);
      }
    }
    await pool.query('delete from "user" where id = $1', [userId]);
    return json({ ok: true, deletedPhotos: paths.length });
  } catch (error) {
    console.error("Account deletion error:", error);
    return json({ message: "Account deletion is not available right now." }, 503);
  }
}
