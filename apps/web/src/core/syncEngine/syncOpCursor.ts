import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { SYNC_OP_CURSOR_PULL_SINCE } from "@sergeant/db-schema/sqlite";

/**
 * `sync_op_cursor` has no `user_id` column — on OPFS that is fine, because
 * each account gets its own DB file. On the kvvfs fallback (which is what
 * every Chrome main-thread session actually runs: the OPFS-SAH pool needs
 * `createSyncAccessHandle`, and that is worker-only) all partitions share
 * one physical store, so a single bare `pull_since` row is global across
 * accounts. `sync_op_log.id` is server-global too, so account B's session
 * advanced the cursor past account A's own ops — and when A signed back in
 * on a device whose rows logout had wiped, `pull?since=<B's high water>`
 * returned nothing and A's data never came back (measured 2026-08-06).
 *
 * Namespacing the key by user id is enough; no schema migration, since
 * `key` is already the text primary key.
 *
 * Note the legacy bare key is deliberately NOT read as a fallback: for the
 * users this bug hit, that value is exactly the poison. A missing
 * namespaced key means cursor 0, i.e. one full re-pull — idempotent under
 * the LWW upserts in `applyPullOp`, and it heals a stuck cursor.
 */
function pullSinceKey(userId: string): string {
  return `${SYNC_OP_CURSOR_PULL_SINCE}:${userId}`;
}

/** Read the durable `/v2/sync/pull?since=` cursor (defaults to 0). */
export async function readPullSinceCursor(
  client: SqliteMigrationClient,
  userId: string,
): Promise<number> {
  const rows = await client.all<{ value_int: number }>(
    `SELECT value_int FROM sync_op_cursor WHERE key = ?`,
    [pullSinceKey(userId)],
  );
  const row = rows[0];
  return row?.value_int ?? 0;
}

/** Persist the pull cursor after a successful apply batch. */
export async function writePullSinceCursor(
  client: SqliteMigrationClient,
  userId: string,
  value: number,
): Promise<void> {
  await client.run(
    `INSERT INTO sync_op_cursor (key, value_int, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE
       SET value_int = excluded.value_int,
           updated_at = excluded.updated_at`,
    [pullSinceKey(userId), value],
  );
}
