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
 * on mobile), and writes them to the local SQLite tables.
 *
 * **Stage 10 / PR #070r-dualwrite** extends the adapter from the
 * single-table `routine_entries` mirror to all 7 new tables
 * introduced in PR #070r-schema. Each op kind maps to exactly one
 * table:
 *
 *   - `completion-add` / `completion-remove` → `routine_entries`
 *   - `habit-rename` → `routine_entries` (denormalized name cascade)
 *   - `habit-upsert` / `habit-delete` → `routine_habits`
 *   - `tag-upsert` / `tag-delete` → `routine_tags`
 *   - `category-upsert` / `category-delete` → `routine_categories`
 *   - `prefs-set` → `routine_prefs`
 *   - `pushup-upsert` → `routine_pushups`
 *   - `habit-order-set` → `routine_habit_order`
 *   - `completion-note-upsert` / `completion-note-delete` →
 *     `routine_completion_notes`
 *
 * Design notes (unchanged from PR #024):
 *
 * - Best-effort: every op is wrapped in try/catch. A single failed op
 *   does NOT abort the rest, and never throws out of the adapter —
 *   localStorage is still the source-of-truth for non-completion
 *   fields and SQLite is mirrored unconditionally.
 * - Idempotent: upserts use ON CONFLICT DO UPDATE with LWW guard.
 * - LWW guard: updates only apply when the incoming `clientTs` is
 *   strictly newer than the local `updated_at`.
 */

export interface ApplyDualWriteOptions {
  /** Owning user; written verbatim into every row's `user_id`. */
  readonly userId: string;
  /** ISO-8601 timestamp with offset, used for `created_at` / `updated_at`. */
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

/**
 * Apply a list of dual-write ops to the local SQLite database.
 *
 * Returns counters so the orchestrator can surface them in the
 * dev-only diagnostics overlay. The returned promise NEVER rejects —
 * adapter-internal exceptions are caught and logged through
 * `options.logger`.
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
        op: op.kind,
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
    // -----------------------------------------------------------------
    // Legacy ops (routine_entries)
    // -----------------------------------------------------------------
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

    // -----------------------------------------------------------------
    // Stage 10 ops (routine_habits)
    // -----------------------------------------------------------------
    case "habit-upsert": {
      const h = op.habit;
      await client.run(
        `INSERT INTO routine_habits
           (id, user_id, name, emoji, tag_ids_json, category_id,
            archived, paused, recurrence, start_date, end_date,
            time_of_day, reminder_times_json, weekdays_json,
            created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           emoji = excluded.emoji,
           tag_ids_json = excluded.tag_ids_json,
           category_id = excluded.category_id,
           archived = excluded.archived,
           paused = excluded.paused,
           recurrence = excluded.recurrence,
           start_date = excluded.start_date,
           end_date = excluded.end_date,
           time_of_day = excluded.time_of_day,
           reminder_times_json = excluded.reminder_times_json,
           weekdays_json = excluded.weekdays_json,
           updated_at = excluded.updated_at,
           deleted_at = NULL
         WHERE excluded.updated_at > routine_habits.updated_at`,
        [
          h.id,
          userId,
          h.name,
          h.emoji ?? "",
          JSON.stringify(h.tagIds ?? []),
          h.categoryId ?? null,
          h.archived ? 1 : 0,
          h.paused ? 1 : 0,
          h.recurrence ?? "daily",
          h.startDate ?? null,
          h.endDate ?? null,
          h.timeOfDay ?? "",
          JSON.stringify(h.reminderTimes ?? []),
          JSON.stringify(h.weekdays ?? [0, 1, 2, 3, 4, 5, 6]),
          h.createdAt ?? clientTs,
          clientTs,
        ],
      );
      return "applied";
    }
    case "habit-delete": {
      await client.run(
        `UPDATE routine_habits
            SET deleted_at = ?, updated_at = ?
          WHERE id = ?
            AND user_id = ?
            AND updated_at < ?`,
        [clientTs, clientTs, op.habitId, userId, clientTs],
      );
      return "applied";
    }

    // -----------------------------------------------------------------
    // Stage 10 ops (routine_tags)
    // -----------------------------------------------------------------
    case "tag-upsert": {
      const t = op.tag;
      await client.run(
        `INSERT INTO routine_tags
           (id, user_id, name, scope, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           scope = excluded.scope,
           updated_at = excluded.updated_at,
           deleted_at = NULL
         WHERE excluded.updated_at > routine_tags.updated_at`,
        [t.id, userId, t.name, t.scope ?? "", clientTs, clientTs],
      );
      return "applied";
    }
    case "tag-delete": {
      await client.run(
        `UPDATE routine_tags
            SET deleted_at = ?, updated_at = ?
          WHERE id = ?
            AND user_id = ?
            AND updated_at < ?`,
        [clientTs, clientTs, op.tagId, userId, clientTs],
      );
      return "applied";
    }

    // -----------------------------------------------------------------
    // Stage 10 ops (routine_categories)
    // -----------------------------------------------------------------
    case "category-upsert": {
      const c = op.category;
      await client.run(
        `INSERT INTO routine_categories
           (id, user_id, name, emoji, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           emoji = excluded.emoji,
           updated_at = excluded.updated_at,
           deleted_at = NULL
         WHERE excluded.updated_at > routine_categories.updated_at`,
        [c.id, userId, c.name, c.emoji ?? "", clientTs, clientTs],
      );
      return "applied";
    }
    case "category-delete": {
      await client.run(
        `UPDATE routine_categories
            SET deleted_at = ?, updated_at = ?
          WHERE id = ?
            AND user_id = ?
            AND updated_at < ?`,
        [clientTs, clientTs, op.categoryId, userId, clientTs],
      );
      return "applied";
    }

    // -----------------------------------------------------------------
    // Stage 10 ops (routine_prefs — single row per user)
    // -----------------------------------------------------------------
    case "prefs-set": {
      await client.run(
        `INSERT INTO routine_prefs (user_id, data_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           data_json = excluded.data_json,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at > routine_prefs.updated_at`,
        [userId, JSON.stringify(op.prefs), clientTs],
      );
      return "applied";
    }

    // -----------------------------------------------------------------
    // Stage 10 ops (routine_pushups — one row per (user, date))
    // -----------------------------------------------------------------
    case "pushup-upsert": {
      await client.run(
        `INSERT INTO routine_pushups (user_id, date_key, reps, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, date_key) DO UPDATE SET
           reps = excluded.reps,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at > routine_pushups.updated_at`,
        [userId, op.dateKey, op.reps, clientTs],
      );
      return "applied";
    }

    // -----------------------------------------------------------------
    // Stage 10 ops (routine_habit_order — single row per user)
    // -----------------------------------------------------------------
    case "habit-order-set": {
      await client.run(
        `INSERT INTO routine_habit_order (user_id, order_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           order_json = excluded.order_json,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at > routine_habit_order.updated_at`,
        [userId, JSON.stringify(op.orderedIds), clientTs],
      );
      return "applied";
    }

    // -----------------------------------------------------------------
    // Stage 10 ops (routine_completion_notes)
    // -----------------------------------------------------------------
    case "completion-note-upsert": {
      await client.run(
        `INSERT INTO routine_completion_notes
           (user_id, note_key, note, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT(user_id, note_key) DO UPDATE SET
           note = excluded.note,
           updated_at = excluded.updated_at,
           deleted_at = NULL
         WHERE excluded.updated_at > routine_completion_notes.updated_at`,
        [userId, op.noteKey, op.note, clientTs],
      );
      return "applied";
    }
    case "completion-note-delete": {
      await client.run(
        `UPDATE routine_completion_notes
            SET deleted_at = ?, updated_at = ?
          WHERE user_id = ?
            AND note_key = ?
            AND updated_at < ?`,
        [clientTs, clientTs, userId, op.noteKey, clientTs],
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
