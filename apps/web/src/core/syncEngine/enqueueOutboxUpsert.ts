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
 * Additionally deduplicated on **content** (see {@link findDuplicatePending}):
 * every caller in this codebase mints a fresh `crypto.randomUUID()` for
 * `idempotencyKey` on every call, so the idempotency-key precheck alone
 * never catches a genuine double-submit (double-click, retry-after-offline,
 * a `popstate`-vs-submit race) — each attempt gets its own key. The content
 * check compares against the single most-recent still-`pending` row for the
 * same `(user_id, table_name, op)`; once a row is pushed it is `DELETE`-d
 * (`markOutboxSuccess`), so a later *legitimate* repeat of the same content
 * is never blocked by history. Limiting the comparison to the most recent
 * pending row (not any older one) keeps rapid, genuinely different writes to
 * the same op-shape (e.g. toggling a preference on/off/on again before the
 * first push drains) from being coalesced into a stale earlier op — see
 * `docs/90-work/planning/specs/beta-input-boundaries.md` § «Ризики».
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

  // Content-level dedup — see the doc comment above for rationale. Runs
  // before the idempotency-key precheck since a hit here means we never
  // touch the key path at all (the duplicate submit gets the *original*
  // row's id back verbatim).
  const duplicate = await findDuplicatePending(client, {
    userId,
    table,
    op,
    row,
    clientTs,
  });
  if (duplicate !== null) {
    return { id: duplicate, inserted: false, skipped: null };
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

/**
 * Looks up the most recent still-`pending` outbox row for the same
 * `(user_id, table_name, op)` and returns its id if its content matches
 * `row` — `null` when there is no such row or its content differs.
 *
 * "Content matches" ignores any field whose value equals that op's own
 * `clientTs`: write paths commonly echo the call-time timestamp into
 * columns like `completed_at` / `created_at`, and two truly duplicate
 * submits fired milliseconds apart each mint their own `clientTs`, which
 * would otherwise defeat an exact-JSON compare.
 */
async function findDuplicatePending(
  client: SqliteMigrationClient,
  args: {
    userId: string;
    table: string;
    op: OutboxUpsertOpKind;
    row: Readonly<Record<string, unknown>>;
    clientTs: string;
  },
): Promise<number | null> {
  const { userId, table, op, row, clientTs } = args;

  const rows = await client.all<{
    id: number;
    row: string;
    client_ts: string;
  }>(
    `SELECT id, row, client_ts FROM sync_op_outbox
       WHERE user_id = ? AND table_name = ? AND op = ? AND status = 'pending'
       ORDER BY id DESC
       LIMIT 1`,
    [userId, table, op],
  );
  const lastPending = rows[0];
  if (lastPending === undefined) return null;

  let parsedRow: unknown;
  try {
    parsedRow = JSON.parse(lastPending.row);
  } catch {
    return null;
  }
  if (typeof parsedRow !== "object" || parsedRow === null) return null;

  const isMatch =
    canonicalizeRowForDedup(
      parsedRow as Record<string, unknown>,
      lastPending.client_ts,
    ) === canonicalizeRowForDedup(row, clientTs);

  return isMatch ? lastPending.id : null;
}

/**
 * Deterministic, sorted-key string form of `row` with any field whose
 * value equals `clientTs` stripped out. Used only for the in-process
 * content-dedup compare above — never persisted.
 */
function canonicalizeRowForDedup(
  row: Readonly<Record<string, unknown>>,
  clientTs: string,
): string {
  const keys = Object.keys(row).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const value = row[key];
    if (value === clientTs) continue;
    parts.push(`${JSON.stringify(key)}:${JSON.stringify(value)}`);
  }
  return `{${parts.join(",")}}`;
}
