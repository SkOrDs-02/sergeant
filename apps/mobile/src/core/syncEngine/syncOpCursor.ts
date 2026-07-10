import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { SYNC_OP_CURSOR_PULL_SINCE } from "@sergeant/db-schema/sqlite";

/** Read the durable `/v2/sync/pull?since=` cursor (defaults to 0). */
export async function readPullSinceCursor(
  client: SqliteMigrationClient,
): Promise<number> {
  const rows = await client.all<{ value_int: number }>(
    `SELECT value_int FROM sync_op_cursor WHERE key = ?`,
    [SYNC_OP_CURSOR_PULL_SINCE],
  );
  const row = rows[0];
  return row?.value_int ?? 0;
}

/** Persist the pull cursor after a successful apply batch. */
export async function writePullSinceCursor(
  client: SqliteMigrationClient,
  value: number,
): Promise<void> {
  await client.run(
    `INSERT INTO sync_op_cursor (key, value_int, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE
       SET value_int = excluded.value_int,
           updated_at = excluded.updated_at`,
    [SYNC_OP_CURSOR_PULL_SINCE, value],
  );
}
