/**
 * PostgreSQL database connection and helpers.
 * Uses Bun's built-in SQL client with connection pooling.
 *
 * Call `close()` on app shutdown (e.g. in Fastify's onClose hook or before process exit).
 * Requires Bun runtime (bun run).
 */

/// <reference types="bun-types" />
import "dotenv/config";
import { SQL } from "bun";

// ─── Config ─────────────────────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL ?? "";

const sql = new SQL(connectionString, {
  max: 20,
  idleTimeout: 30,
  connectionTimeout: 5,
  onclose: (err) => {
    if (!err) return;
    // Expected when we call close(): each pool connection emits "Connection closed"
    if (closed && err.message === "Connection closed") return;
    if (!closeErrorLogged) {
      closeErrorLogged = true;
      console.error("[db] connection closed with error:", err.message);
    }
  },
});

/** True after close() has been called (and possibly still in progress). */
let closed = false;

/** Only log the first close-with-error to avoid spamming when the pool closes many connections. */
let closeErrorLogged = false;

/** Resolves when the first close() completes. Reused for idempotent close. */
let closePromise: Promise<void> | null = null;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the shared SQL instance (connection pool). Prefer using `query` for one-off queries;
 * use `sql.begin()` for transactions or `getClient()` for a reserved connection.
 * Do not use after close() has been called.
 */
export function getPool(): SQL {
  return sql;
}

/**
 * Whether the pool has been closed (or is closing). Use to avoid using the pool after shutdown.
 */
export function isClosed(): boolean {
  return closed;
}

/**
 * Run a parameterized query and return all rows.
 * Uses $1, $2, ... placeholders. Rejects if the pool has already been closed.
 */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  values?: unknown[]
): Promise<T[]> {
  if (closed) {
    throw new Error("Database pool is closed; cannot run query");
  }
  const result = await sql.unsafe(text, values ?? []);
  return result as T[];
}

/**
 * Reserve a connection from the pool for exclusive use.
 * Call `release()` when done (e.g. in a try/finally block).
 * The returned client supports tagged template queries: client`SELECT ...`.
 * Rejects if the pool has already been closed.
 */
export async function getClient(): Promise<{ release(): void }> {
  if (closed) {
    throw new Error("Database pool is closed; cannot get client");
  }
  return sql.reserve();
}

/**
 * Close the pool and all its connections. Call on app shutdown (e.g. Fastify onClose).
 * Safe to call multiple times: subsequent calls wait for the same shutdown and resolve without error.
 */
export async function close(): Promise<void> {
  if (closed) {
    return closePromise ?? Promise.resolve();
  }
  closed = true;
  closePromise = (async () => {
    try {
      await sql.close();
    } catch (err) {
      console.error("[db] error closing pool:", err instanceof Error ? err.message : err);
      throw err;
    }
  })();
  return closePromise;
}
