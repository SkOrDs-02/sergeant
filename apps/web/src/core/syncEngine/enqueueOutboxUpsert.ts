/**
 * General-purpose LWW upsert/delete enqueue helper for the client-side
 * sync_op_outbox. Mirrors `enqueueOutboxIncrement` from
 * `@sergeant/db-schema` but handles op='insert'|'update'|'delete' rather
 * than op='increment'.
 *
 * Scope: web layer only. Mobile can ship its own variant when needed.
 * Lives under `core/syncEngine/` so the routine dualWrite adapter can
 * import it without a circular-dependency issue (db-schema → web would
 * be a cycle; web → web is fine).
 *
 * Error policy: this helper propagates SQL errors to the caller. The
 * caller (routine dualWrite adapter) wraps every op in try/catch and
 * swallows errors so a sync-enqueue failure never breaks the local write.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

export type OutboxUpsertOpKind = "insert" | "update" | "delete";

export interface OutboxUpsertInput {
  /**
   * Authenticated user's opaque Better Auth id.
   * Must be non-empty — mirrors the NOT NULL constraint in the schema.
   */
  readonly userId: string;
  /** Target server table, e.g. 'routine_entries'. */
  readonly table: string;
  /** LWW op kind. 'insert'/'update' are both sent as upserts server-side. */
  readonly op: OutboxUpsertOpKind;
  /**
   * Row payload the server's apply-fn expects. Serialised verbatim via
   * JSON.stringify — callers must include all required server fields.
   */
  readonly row: Readonly<Record<string, unknown>>;
  /** ISO-8601 timestamp; written into client_ts. */
  readonly clientTs: string;
  /**
   * ULID or UUID — unique idempotency key. The server deduplicates on
   * (user_id, idempotency_key). Pass crypto.randomUUID() for fresh ops.
   */
  readonly idempotencyKey: string;
}

/**
 * Durably append an upsert/delete op to the client-side sync_op_outbox.
 * Idempotent on idempotencyKey — a pre-existing row with the same key
 * is returned as-is (inserted: false).
 *
 * Never throws on idempotency-key collision; SQL / disk errors propagate
 * to the caller unchanged.
 */
export async function enqueueOutboxUpsert(
  client: SqliteMigrationClient,
  input: OutboxUpsertInput,
): Promise<{ id: number; inserted: boolean }> {
  const { userId, table, op, row, clientTs, idempotencyKey } = input;

  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error(
      "enqueueOutboxUpsert: userId is required (NOT NULL column).",
    );
  }

  // Pre-check idempotency — mirrors enqueueOutboxIncrement semantics.
  const existing = await client.all<{ id: number }>(
    `SELECT id FROM sync_op_outbox WHERE idempotency_key = ?`,
    [idempotencyKey],
  );
  const existingRow = existing[0];
  if (existingRow !== undefined) {
    return { id: existingRow.id, inserted: false };
  }

  const rowJson = JSON.stringify(row);

  await client.run(
    `INSERT OR IGNORE INTO sync_op_outbox
       (user_id, table_name, op, row, client_ts, idempotency_key)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, table, op, rowJson, clientTs, idempotencyKey],
  );

  const after = await client.all<{ id: number }>(
    `SELECT id FROM sync_op_outbox WHERE idempotency_key = ?`,
    [idempotencyKey],
  );
  const afterRow = after[0];
  if (afterRow === undefined) {
    throw new Error(
      `enqueueOutboxUpsert: expected exactly one row for ` +
        `idempotency_key=${JSON.stringify(idempotencyKey)}, got ${after.length}`,
    );
  }
  return { id: afterRow.id, inserted: true };
}
