import { betterAuth } from "better-auth";
import { getPool } from "./db.js";

function trustedOrigins(): string[] {
  const origins = new Set<string>([
    "https://map.recordmytrip.com",
    "https://mapx-iota.vercel.app",
  ]);
  // Preview deployments and any explicitly configured URL.
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
    if (host) origins.add(`https://${host}`);
  }
  if (process.env.BETTER_AUTH_URL) origins.add(process.env.BETTER_AUTH_URL);
  return [...origins];
}

let instance: ReturnType<typeof createAuth> | undefined;

function createAuth() {
  return betterAuth({
    database: getPool(),
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(),
    // Email + password: no email provider needed. Accounts are only used for
    // saving trips to the cloud; the rest of the app needs no login.
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
  });
}

/** Created lazily so a missing DATABASE_URL gives a clear error at request time. */
export function getAuth() {
  instance ??= createAuth();
  return instance;
}
