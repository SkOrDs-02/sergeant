import type { SqliteMigrationClient } from "../migrate/adapters/sqlite.js";

import { SYNC_OP_OUTBOX_STATUSES, type SyncOpOutboxStatus } from "./routine.js";

/**
 * TTL maintenance purge for the client-side `sync_op_outbox`.
 *
 * Closes the unbounded-growth gap flagged in
 * `docs/audits/2026-08-XX-sync-engine-roast.md` § "DLQ-row TTL note":
 * terminal rows (`'rejected'`, `'dead_letter'`, `'quarantined'`) are
 * **never** removed by the existing helpers. {@link recoverDeadLetter}
 * moves `'dead_letter'` → `'pending'` and {@link purgeSyncOpOutboxForUser}
 * only deletes `'pending'` rows on logout — terminal rows are kept on
 * purpose for forensic value in the dev panel. On a device that never
 * reconnects cleanly (or whose user never opens the dev panel to triage),
 * the dead-letter / rejected buckets accumulate forever.
 *
 * This helper is the missing periodic cleanup: a low-frequency
 * maintenance call (e.g. once per app boot, or on a daily timer wired in
 * the sync-engine singleton) that drops terminal rows older than a
 * retention window. It is the client-side analogue of the server's
 * 30-day `ai_usage_daily` purge.
 *
 * Safety contract (why this cannot wipe live work):
 *
 *  - **Terminal-only.** The default `statuses` set is every member of
 *    {@link SYNC_OP_OUTBOX_STATUSES} except `'pending'`. Passing
 *    `'pending'` explicitly is rejected — unflushed ops are never
 *    deleted by a TTL job, only by a successful push or an explicit
 *    logout purge.
 *  - **Age-gated.** `olderThanDays` must be a finite number `> 0`, so a
 *    caller cannot pass `0` and wipe every terminal row regardless of
 *    age. Age is computed with SQLite's `julianday()` on both sides, so
 *    the comparison is correct whether `created_at` is the column
 *    default (`datetime('now')`, UTC, space-separated) or the
 *    ISO-8601-with-offset value the repo writes (`…+03:00`). A
 *    `created_at` that `julianday()` cannot parse yields `NULL` and the
 *    row is **kept** — we never delete a row whose age we cannot prove.
 *  - **Optional user scope.** When `userId` is provided, the purge is
 *    restricted to that owner (mirrors {@link purgeSyncOpOutboxForUser}).
 *    Omit it for a device-wide sweep across all local users.
 *
 * Mutation contract:
 *
 *  - Counts the matching rows, then issues a single `DELETE` with the
 *    identical predicate, and returns the snapshot count as `purged`.
 *    The `client.run` shim does not surface SQLite's `changes()`, so the
 *    count is taken before the delete — same pattern as
 *    {@link recoverDeadLetter}. Under SQLite's single-writer model the
 *    only writer that could move a row out of the matched set between
 *    the count and the delete is {@link recoverDeadLetter} flipping a
 *    `'dead_letter'` row back to `'pending'`; that row then fails the
 *    `DELETE`'s status guard and is harmlessly excluded — the returned
 *    count may overcount by such races, which is acceptable for an
 *    informational maintenance metric.
 *  - Tx-free: a single `DELETE` is atomic under SQLite's single-writer
 *    model; callers that batch other maintenance work wrap their own
 *    transaction.
 */

/**
 * Default retention window for {@link purgeStaleTerminalOutbox}. Matches
 * the server-side `ai_usage_daily` 30-day purge convention.
 */
export const SYNC_OP_OUTBOX_STALE_TTL_DAYS = 30;

/**
 * Terminal statuses eligible for TTL purge — every status except
 * `'pending'`. Derived from {@link SYNC_OP_OUTBOX_STATUSES} so a future
 * status added to the tuple is treated as terminal-by-default (correct
 * for a cleanup job: anything that is not an in-flight `'pending'` op is
 * a finished row that the retention window may collect).
 */
export const SYNC_OP_OUTBOX_TERMINAL_STATUSES: readonly SyncOpOutboxStatus[] =
  SYNC_OP_OUTBOX_STATUSES.filter((status) => status !== "pending");

export interface PurgeStaleTerminalOutboxOptions {
  /** Delete terminal rows whose `created_at` is strictly older than this
   *  many days. Must be a finite number `> 0`. */
  readonly olderThanDays: number;
  /** Which statuses to collect. Defaults to
   *  {@link SYNC_OP_OUTBOX_TERMINAL_STATUSES}. `'pending'` is rejected. */
  readonly statuses?: readonly SyncOpOutboxStatus[];
  /** Restrict the purge to a single owner. Omit for a device-wide sweep. */
  readonly userId?: string;
}

export interface PurgeStaleTerminalOutboxResult {
  /** Number of rows that matched the predicate at snapshot time and were
   *  deleted. */
  readonly purged: number;
}

/**
 * Delete terminal `sync_op_outbox` rows older than a retention window.
 *
 * Throws on:
 *
 *   - `olderThanDays` not a finite number, or `<= 0` (would wipe all
 *     terminal rows regardless of age);
 *   - an empty `statuses` array;
 *   - `statuses` containing `'pending'` (never purge unflushed work) or
 *     a value not in {@link SYNC_OP_OUTBOX_STATUSES} (schema-invariant
 *     violation);
 *   - `userId` provided as an empty string (caller bug — pass a real
 *     owner id or omit the field for a device-wide sweep).
 *
 * @param client SQLite client (better-sqlite3 in tests; sqlite-wasm in
 *               `apps/web`; expo-sqlite in `apps/mobile`).
 * @param options Retention window + optional status/owner scope.
 */
export async function purgeStaleTerminalOutbox(
  client: SqliteMigrationClient,
  options: PurgeStaleTerminalOutboxOptions,
): Promise<PurgeStaleTerminalOutboxResult> {
  const { olderThanDays } = options;
  if (!Number.isFinite(olderThanDays) || olderThanDays <= 0) {
    throw new Error(
      `purgeStaleTerminalOutbox: olderThanDays must be a finite number > 0, ` +
        `got ${JSON.stringify(olderThanDays)}`,
    );
  }

  const statuses = options.statuses ?? SYNC_OP_OUTBOX_TERMINAL_STATUSES;
  if (statuses.length === 0) {
    throw new Error(
      `purgeStaleTerminalOutbox: statuses must be a non-empty array`,
    );
  }
  for (const status of statuses) {
    if (status === "pending") {
      throw new Error(
        `purgeStaleTerminalOutbox: refusing to purge 'pending' rows — ` +
          `unflushed ops are removed by a successful push or ` +
          `purgeSyncOpOutboxForUser on logout, never by a TTL job`,
      );
    }
    if (!KNOWN_STATUSES.has(status)) {
      throw new Error(
        `purgeStaleTerminalOutbox: unknown status=${JSON.stringify(status)}; ` +
          `expected one of ${JSON.stringify(SYNC_OP_OUTBOX_STATUSES)}`,
      );
    }
  }

  if (options.userId !== undefined && options.userId.length === 0) {
    throw new Error(
      `purgeStaleTerminalOutbox: userId, when provided, must be non-empty — ` +
        `omit it for a device-wide sweep instead of passing an empty string`,
    );
  }

  const statusPlaceholders = statuses.map(() => "?").join(", ");
  const userScope = options.userId !== undefined ? ` AND user_id = ?` : "";
  // `julianday('now') - julianday(created_at)` is the row age in days.
  // julianday() parses both the column default (`datetime('now')`) and
  // the ISO-8601-with-offset values the repo writes; an unparsable
  // created_at yields NULL → the row falls out of the predicate and is
  // kept (fail-safe).
  const where =
    `WHERE status IN (${statusPlaceholders})` +
    ` AND julianday('now') - julianday(created_at) > ?` +
    userScope;
  const params: unknown[] = [...statuses, olderThanDays];
  if (options.userId !== undefined) {
    params.push(options.userId);
  }

  const countRows = await client.all<{ count: number | bigint }>(
    `SELECT COUNT(*) AS count FROM sync_op_outbox ${where}`,
    params,
  );
  const purged = Number(countRows[0]?.count ?? 0);
  if (!Number.isFinite(purged) || !Number.isInteger(purged) || purged < 0) {
    throw new Error(
      `purgeStaleTerminalOutbox: COUNT(*) coerced to a non-integer ` +
        `${JSON.stringify(countRows[0]?.count)}`,
    );
  }

  if (purged > 0) {
    await client.run(`DELETE FROM sync_op_outbox ${where}`, params);
  }

  return { purged };
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set(SYNC_OP_OUTBOX_STATUSES);
