/**
 * PostgreSQL database connection and helpers.
 * Uses a connection pool for efficient query handling.
 */

import "dotenv/config";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

// ─── Config ─────────────────────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the shared connection pool. Prefer using `query` for one-off queries; use the pool directly when you need a transaction client.
 */
export function getPool(): Pool {
  return pool;
}

/**
 * Run a parameterized query and return all rows.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<T[]> {
  const { rows } = await pool.query<T>(text, values);
  return rows;
}

/**
 * Get a client from the pool for transactions. Remember to release it
 * (e.g. with try/finally client.release()).
 */
export async function getClient(): Promise<PoolClient> {
  const client = await pool.connect();
  return client;
}

/**
 * Close the pool and all its clients. Call on app shutdown.
 */
export async function close(): Promise<void> {
  await pool.end();
}
