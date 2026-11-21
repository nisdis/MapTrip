import { Pool } from "pg";

const globalForPool = globalThis as unknown as { __pgPool?: Pool };

export function getConnectionString(): string | undefined {
  // The Neon integration on Vercel sets DATABASE_URL (and POSTGRES_URL).
  return process.env.DATABASE_URL || process.env.POSTGRES_URL;
}

/** One small pool per function instance (serverless-friendly). */
export function getPool(): Pool {
  const connectionString = getConnectionString();
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  globalForPool.__pgPool ??= new Pool({ connectionString, max: 3 });
  return globalForPool.__pgPool;
}
