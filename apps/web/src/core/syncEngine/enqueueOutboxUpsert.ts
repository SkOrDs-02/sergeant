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

import { trackOutboxWrite } from "./outboxCheckpoint.js";
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
 * same `(user_id, table_name)` — **whatever its op** — and treats the call as
 * a duplicate only when that row has the same `op` AND the same canonical
 * content. Once a row is pushed it is `DELETE`-d (`markOutboxSuccess`), so a
 * later *legitimate* repeat of the same content is never blocked by history.
 *
 * Why the newest row is taken regardless of `op` (data-14): a toggle
 * on/off/on (insert → delete → insert, hide → unhide → hide) must reach the
 * server as three ops. If the lookup were scoped to `op`, the third call
 * would be compared with the *first* row (the delete in between is invisible
 * to it), match, and be swallowed — leaving the server and every other
 * device in the opposite state to what the user last chose. With an op of a
 * different kind in between, the newest pending row has another `op`, so the
 * new op is always queued. The cost is conservative: a double-submit
 * separated by an unrelated write to the same table is queued twice, which
 * is harmless (LWW makes the repeat idempotent server-side).
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
 *
 * **Concurrency:** the (content-dedup lookup → INSERT) pair below is not
 * atomic by itself — two concurrent calls for the same
 * `(user_id, table_name)` content can both run `findDuplicatePending`
 * before either has inserted, both see "nothing pending yet", and both
 * insert (CodeRabbit PR #627). The browser's single JS thread makes a
 * plain module-level promise-chain mutex sufficient (no real lock
 * needed): every call is queued onto {@link enqueueChain}, so the whole
 * lookup-then-insert critical section for one call always finishes before
 * the next one starts.
 */
let enqueueChain: Promise<unknown> = Promise.resolve();

export function enqueueOutboxUpsert(
  client: SqliteMigrationClient,
  input: OutboxUpsertInput,
): Promise<EnqueueOutboxUpsertResult> {
  const run = () => enqueueOutboxUpsertLocked(client, input);
  // Chained onto the tail regardless of whether the previous call
  // resolved or rejected (`run` is both the fulfilled- and
  // rejected-handler) — one caller's failure must never wedge every
  // later caller waiting on the shared chain.
  const chained = enqueueChain.then(run, run);
  // Keep the module-held reference always "handled" so an ignored
  // rejection here (e.g. a fire-and-forget caller that never awaits) does
  // not surface as an unhandled-rejection warning; the real error still
  // propagates to THIS call's own caller via `chained`, returned below.
  enqueueChain = chained.then(
    () => undefined,
    () => undefined,
  );
  trackOutboxWrite(chained);
  return chained;
}

async function enqueueOutboxUpsertLocked(
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

  // Модуль (Фінік, Їжа, Фізрук) може писати в чергу раніше, ніж хтось довів
  // її схему на цій партиції до кінця — і тоді `INSERT` падає на
  // `no such column: user_id` (див. `outboxSchema.ts`). Чекаємо на спільний
  // мігратор; після першого успіху це no-op. Динамічно: цей файл лежить на
  // eager-шляху, а міграції, раннер і адаптер — ні (`check-eager-bundle`).
  const { ensureOutboxSchema } = await import("./outboxSchema.js");
  await ensureOutboxSchema(client);

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
 * `(user_id, table_name)` — regardless of `op` — and returns its id only
 * if it has the same `op` and its content matches `row`. Returns `null`
 * when there is no such row, when its `op` differs (an opposite action
 * sits between the repeats, so the new op must be queued) or when its
 * content differs.
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
    op: string;
    row: string;
    client_ts: string;
  }>(
    `SELECT id, op, row, client_ts FROM sync_op_outbox
       WHERE user_id = ? AND table_name = ? AND status = 'pending'
       ORDER BY id DESC
       LIMIT 1`,
    [userId, table],
  );
  const lastPending = rows[0];
  if (lastPending === undefined) return null;
  // Newest pending row is a different kind of op → not a repeat of it.
  if (lastPending.op !== op) return null;

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
