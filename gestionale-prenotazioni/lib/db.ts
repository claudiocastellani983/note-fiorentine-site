import { Pool } from "pg";
import type { Pool as PoolType } from "pg";

declare global {
  var __nfPool: PoolType | undefined;
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL non configurata");

export const db = global.__nfPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: true }
});

if (process.env.NODE_ENV !== "production") global.__nfPool = db;