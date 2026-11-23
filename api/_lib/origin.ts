import { trustedOrigins } from "./auth.js";

/**
 * Defence in depth for our own endpoints (Better Auth checks its own): a
 * state-changing request that says where it came from must come from us.
 * Browsers already don't send our SameSite=Lax cookie on cross-site POSTs.
 */
export function rejectForeignOrigin(request: Request): Response | null {
  if (request.method === "GET" || request.method === "HEAD") return null;
  const origin = request.headers.get("origin");
  if (!origin) return null; // non-browser clients; still need a valid session
  return trustedOrigins().includes(origin)
    ? null
    : Response.json({ message: "Invalid origin" }, { status: 403 });
}
