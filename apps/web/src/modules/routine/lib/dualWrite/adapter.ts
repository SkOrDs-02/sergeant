import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { buildCompletionRowId, type RoutineDualWriteOp } from "./diff.js";

/**
 * Async SQLite-side adapter for the routine dual-write layer.
 *
 * Stage 4 PR #024 of `docs/planning/storage-roadmap.md`. Takes the
 * `RoutineDualWriteOp[]` produced by `diffRoutineDualWriteOps`, plus a
 * `SqliteMigrationClient` (the same `{exec, run, all}` shape the SPIKE
 * library uses, so this code is testable with `better-sqlite3` in
 * Node and runs unchanged against sqlite-wasm on web and `expo-sqlite`
 * on mobile), and writes them to the local `routine_entries` table.
 *
 * Design notes:
 *
 * - Best-effort: every op is wrapped in try/catch. A single failed op
 *   does NOT abort the rest, and never throws out of the adapter —
 *   localStorage is still the source of truth in PR #024, and the
 *   higher-level orchestrator deliberately ignores adapter outcomes
 *   so SQLite hiccups can't crash a habit toggle.
 *
 * - Idempotent: row id is the stable `${habitId}:${dateKey}` produced
 *   by `buildCompletionRowId`, so replaying the same op twice yields
 *   the same end state (`completion-add` becomes a no-op upsert,
 *   `completion-remove` becomes a no-op tombstone bump).
 *
 * - LWW guard: completion-remove only bumps `deleted_at` / `updated_at`
 *   when the local `updated_at` is strictly older than `clientTs` —
 *   matches the server-side apply-шлях in
 *   `apps/server/src/modules/sync/syncV2.ts ::applyRoutineEntries` so
 *   stale offline removes can never resurrect a fresh add.
 *
 * - Renames touch active rows only (`deleted_at IS NULL`). Tombstoned
 *   rows keep the historical name they had at deletion time —
 *   matching how the server retains the snapshot in
 *   `routine_entries.name`.
 *
 * Stage 5 PR #040 will replace this best-effort adapter with a
 * crash-safe transactional pipeline backed by `sync_op_outbox`; the
 * function signature is intentionally minimal so the swap is local.
 */

export interface ApplyDualWriteOptions {
  /** Owning user; written verbatim into `routine_entries.user_id`. */
  readonly userId: string;
  /** ISO-8601 timestamp with offset, used for `created_at` / `updated_at`. */
  readonly clientTs: string;
  /**
   * Logger used for per-op failures. Defaults to a `console.warn`
   * wrapper; tests pass a spy so they can assert on the warning
   * shape without polluting CI logs.
   */
  readonly logger?: DualWriteLogger;
}

export type DualWriteLogger = (
  level: "warn" | "info",
  message: string,
  meta?: Record<string, unknown>,
) => void;

export interface ApplyDualWriteResult {
  readonly applied: number;
  readonly errored: number;
  readonly skipped: number;
}

const DEFAULT_LOGGER: DualWriteLogger = (level, message, meta) => {
  if (level === "warn") {
    console.warn(`[routine.dualWrite] ${message}`, meta ?? {});
  }
};

/**
 * Apply a list of dual-write ops to the local SQLite database.
 *
 * Returns counters so the orchestrator can surface them in the
 * dev-only diagnostics overlay (Stage 4 follow-up). The returned
 * promise NEVER rejects — adapter-internal exceptions are caught and
 * logged through `options.logger`.
 */
export async function applyRoutineDualWriteOps(
  client: SqliteMigrationClient,
  ops: readonly RoutineDualWriteOp[],
  options: ApplyDualWriteOptions,
): Promise<ApplyDualWriteResult> {
  if (ops.length === 0) {
    return { applied: 0, errored: 0, skipped: 0 };
  }
  const logger = options.logger ?? DEFAULT_LOGGER;
  let applied = 0;
  let errored = 0;
  let skipped = 0;

  for (const op of ops) {
    try {
      const outcome = await applyOne(client, op, options);
      if (outcome === "applied") applied += 1;
      else skipped += 1;
    } catch (err) {
      errored += 1;
      logger("warn", "dual-write op failed", {
        op,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { applied, errored, skipped };
}

type ApplyOutcome = "applied" | "skipped";

async function applyOne(
  client: SqliteMigrationClient,
  op: RoutineDualWriteOp,
  options: ApplyDualWriteOptions,
): Promise<ApplyOutcome> {
  const { userId, clientTs } = options;
  switch (op.kind) {
    case "completion-add": {
      const id = buildCompletionRowId(op.habitId, op.dateKey);
      await client.run(
        `INSERT INTO routine_entries
           (id, user_id, name, completed_at, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           completed_at = excluded.completed_at,
           updated_at = excluded.updated_at,
           deleted_at = NULL
         WHERE excluded.updated_at > routine_entries.updated_at`,
        [id, userId, op.habitName, clientTs, clientTs, clientTs],
      );
      return "applied";
    }
    case "completion-remove": {
      const id = buildCompletionRowId(op.habitId, op.dateKey);
      await client.run(
        `UPDATE routine_entries
            SET deleted_at = ?, updated_at = ?
          WHERE id = ?
            AND user_id = ?
            AND updated_at < ?`,
        [clientTs, clientTs, id, userId, clientTs],
      );
      return "applied";
    }
    case "habit-rename": {
      // `id` rows are `${habitId}:${YYYY-MM-DD}`; LIKE prefix is safe
      // because both halves are tightly typed and never contain `:`.
      const idPrefix = `${op.habitId}:%`;
      await client.run(
        `UPDATE routine_entries
            SET name = ?, updated_at = ?
          WHERE user_id = ?
            AND id LIKE ?
            AND deleted_at IS NULL
            AND updated_at < ?`,
        [op.nextName, clientTs, userId, idPrefix, clientTs],
      );
      return "applied";
    }
    default: {
      const _exhaustive: never = op;
      void _exhaustive;
      return "skipped";
    }
  }
}
