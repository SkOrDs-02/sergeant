/**
 * Status: Active.
 * Canonical per-user consent check for server-side AI memory reads and writes.
 */

import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool | PoolClient, "query">;

/**
 * A missing preferences row keeps the existing product default (`aiMemory=true`).
 * Any persisted value must be explicitly true; malformed/null values fail closed.
 */
export async function hasAiMemoryConsent(
  db: Queryable,
  userId: string,
): Promise<boolean> {
  const result = await db.query<{ ai_memory: boolean | null }>(
    `SELECT ai_memory
       FROM user_preferences
      WHERE user_id = $1`,
    [userId],
  );

  if (result.rows.length === 0) return true;
  return result.rows[0]?.ai_memory === true;
}
