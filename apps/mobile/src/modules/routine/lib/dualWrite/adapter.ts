import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { buildCompletionRowId, type RoutineDualWriteOp } from "./diff";

/**
 * Async SQLite-side adapter for the routine dual-write layer.
 *
 * Stage 4 PR #024 of `docs/planning/storage-roadmap.md`. Mirrors
 * `apps/web/src/modules/routine/lib/dualWrite/adapter.ts` — see the
 * web copy for the full design notes (best-effort, idempotency,
 * LWW guard, rename semantics).
 *
 * Both copies use the same `SqliteMigrationClient` (`{exec, run, all}`)
 * shape so a single SQL surface serves both web (sqlite-wasm via
 * `migrationClient()` on the singleton) and mobile (expo-sqlite via
 * `getSqliteMigrationClient()`), and unit-tests run unchanged on
 * `better-sqlite3`.
 */

export interface ApplyDualWriteOptions {
  readonly userId: string;
  readonly clientTs: string;
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
