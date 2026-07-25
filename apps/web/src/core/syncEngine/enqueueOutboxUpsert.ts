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

import { notifyOutboxEnqueued } from "./outboxNudge.js";
import { isSyncableUserId } from "./syncableUserId.js";

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

export interface EnqueueOutboxUpsertResult {
  /** `sync_op_outbox.id`, або `null` коли рядок свідомо не писався. */
  readonly id: number | null;
  /** `true` лише коли цей виклик вставив новий рядок. */
  readonly inserted: boolean;
  /**
   * Причина, з якої рядок не потрапив у чергу, або `null` коли потрапив
   * (чи вже там лежав). `'non-syncable-user'` — синтетичний локальний id
   * (анонім / демо), чиї операції нікуди не поїдуть; див.
   * `syncableUserId.ts`.
   */
  readonly skipped: "non-syncable-user" | null;
}

/**
 * Durably append an upsert/delete op to the client-side sync_op_outbox.
 * Idempotent on idempotencyKey — a pre-existing row with the same key
 * is returned as-is (inserted: false).
 *
 * Ops belonging to a synthetic local user id (anonymous / demo) are NOT
 * written: `drainSyncOpOutbox` scopes on the Better Auth session id, so
 * such a row could never be pushed nor purged. The call resolves with
 * `skipped: 'non-syncable-user'` instead.
 *
 * On a fresh insert the writer-runtime is nudged via
 * `notifyOutboxEnqueued()` so the push does not wait for the periodic tick.
 *
 * Never throws on idempotency-key collision; SQL / disk errors propagate
 * to the caller unchanged.
 */
export async function enqueueOutboxUpsert(
  client: SqliteMigrationClient,
  input: OutboxUpsertInput,
): Promise<EnqueueOutboxUpsertResult> {
  const { userId, table, op, row, clientTs, idempotencyKey } = input;

  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error(
      "enqueueOutboxUpsert: userId is required (NOT NULL column).",
    );
  }

  // Синтетичний локальний id (анонім / демо) → рядок дренувати нікому:
  // `drainSyncOpOutbox` фільтрує по id сесії Better Auth. Не пишемо його
  // взагалі, інакше `pending` росте без межі — див. `syncableUserId.ts`.
  // Локальний SQLite-запис уже стався вище по стеку і не залежить від цього.
  if (!isSyncableUserId(userId)) {
    return { id: null, inserted: false, skipped: "non-syncable-user" };
  }

  // Pre-check idempotency — mirrors enqueueOutboxIncrement semantics.
  const existing = await client.all<{ id: number }>(
    `SELECT id FROM sync_op_outbox WHERE idempotency_key = ?`,
    [idempotencyKey],
  );
  const existingRow = existing[0];
  if (existingRow !== undefined) {
    return { id: existingRow.id, inserted: false, skipped: null };
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

  // Свіжий рядок у черзі — штовхаємо writer-runtime, щоб push не чекав
  // до ~36 с наступного тіку інтервалу. Дедуп in-flight тіків живе в
  // самому scheduler-і, тож пачка з N операцій дає один-два push-и.
  notifyOutboxEnqueued();

  return { id: afterRow.id, inserted: true, skipped: null };
}
