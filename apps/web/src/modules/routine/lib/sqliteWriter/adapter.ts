import {
  buildLwwUpsert,
  createApplyOps,
  type ApplyDualWriteOptions as CoreApplyDualWriteOptions,
  type ApplyDualWriteResult as CoreApplyDualWriteResult,
  type DualWriteLogger as CoreDualWriteLogger,
  type DualWriteRuntime,
  type TableSpec,
} from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { logger as webLogger } from "@shared/lib";

import { enqueueOutboxUpsert } from "../../../../core/syncEngine/enqueueOutboxUpsert.js";
import { buildCompletionRowId, type RoutineDualWriteOp } from "./diff.js";

/**
 * Async SQLite-side adapter for the routine dual-write layer.
 *
 * Stage 4 PR #024 of `docs/planning/storage-roadmap.md`. Migrated onto
 * `@sergeant/dualwrite-core` in ADR-0073 крок 3: the op-loop is now
 * `createApplyOps` (best-effort) and every standard-shape table's upsert SQL
 * is emitted by the shared `buildLwwUpsert` builder. Behaviour and emitted SQL
 * are byte-identical to the previous hand-written adapter — see
 * `adapter.snapshot.test.ts`.
 *
 * Routine-specific pieces stay hand-written (ADR-0073 § «НЕ абстрагуємо»):
 *
 *   - `completion-add` / `completion-remove` write `routine_entries` and then
 *     fire the sync-v2 outbox bridge (`enqueueOutboxUpsert`, fire-and-forget).
 *     The `client.run` → `enqueueOutboxUpsert` order is load-bearing and pinned
 *     by the SQL snapshot.
 *   - `habit-rename` is a denormalised name cascade over `LIKE '<habitId>:%'`
 *     (a guard over many rows) — no builder.
 *   - the soft-delete handlers keep the routine adapter's own SQL layout
 *     (`SET` on its own line, one `AND` per line), which the generic
 *     `buildDelete` does not reproduce; that shape is unique to routine.
 *   - `habit-upsert` preserves `h.createdAt ?? clientTs` for `created_at`.
 *
 * Op kind → table mapping:
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
 * Design notes:
 *
 * - Best-effort: every op is wrapped in try/catch. A single failed op does NOT
 *   abort the rest, and never throws out of the adapter.
 * - Idempotent: upserts use ON CONFLICT DO UPDATE with LWW guard.
 * - LWW guard: updates only apply when the incoming `clientTs` is strictly
 *   newer than the local `updated_at`.
 */

export type ApplyDualWriteOptions = CoreApplyDualWriteOptions;
export type DualWriteLogger = CoreDualWriteLogger;
export type ApplyDualWriteResult = CoreApplyDualWriteResult;

const DEFAULT_LOGGER: DualWriteLogger = (level, message, meta) => {
  if (level === "warn") {
    webLogger.warn(`[routine.dualWrite] ${message}`, meta ?? {});
  }
};

const applyOps = createApplyOps<RoutineDualWriteOp>({
  errorPolicy: "best-effort",
  handlers: {
    "completion-add": async (client, op, rt) => {
      await addCompletion(client, op.habitId, op.dateKey, op.habitName, rt);
      return "applied";
    },
    "completion-remove": async (client, op, rt) => {
      await removeCompletion(client, op.habitId, op.dateKey, rt);
      return "applied";
    },
    "habit-rename": async (client, op, rt) => {
      await renameHabit(client, op.habitId, op.nextName, rt);
      return "applied";
    },
    "habit-upsert": async (client, op, rt) => {
      await upsertHabit(client, op.habit, rt);
      return "applied";
    },
    "habit-delete": async (client, op, rt) => {
      await softDeleteHabit(client, op.habitId, rt);
      return "applied";
    },
    "tag-upsert": async (client, op, rt) => {
      await upsertTag(client, op.tag, rt);
      return "applied";
    },
    "tag-delete": async (client, op, rt) => {
      await softDeleteTag(client, op.tagId, rt);
      return "applied";
    },
    "category-upsert": async (client, op, rt) => {
      await upsertCategory(client, op.category, rt);
      return "applied";
    },
    "category-delete": async (client, op, rt) => {
      await softDeleteCategory(client, op.categoryId, rt);
      return "applied";
    },
    "prefs-set": async (client, op, rt) => {
      await setPrefs(client, op.prefs, rt);
      return "applied";
    },
    "pushup-upsert": async (client, op, rt) => {
      await upsertPushup(client, op.dateKey, op.reps, rt);
      return "applied";
    },
    "habit-order-set": async (client, op, rt) => {
      await setHabitOrder(client, op.orderedIds, rt);
      return "applied";
    },
    "completion-note-upsert": async (client, op, rt) => {
      await upsertCompletionNote(client, op.noteKey, op.note, rt);
      return "applied";
    },
    "completion-note-delete": async (client, op, rt) => {
      await deleteCompletionNote(client, op.noteKey, rt);
      return "applied";
    },
  },
});

/**
 * Apply a list of dual-write ops to the local SQLite database.
 *
 * Returns counters so the orchestrator can surface them in the dev-only
 * diagnostics overlay. The returned promise NEVER rejects — adapter-internal
 * exceptions are caught and logged through `options.logger`.
 */
export async function applyRoutineDualWriteOps(
  client: SqliteMigrationClient,
  ops: readonly RoutineDualWriteOp[],
  options: ApplyDualWriteOptions,
): Promise<ApplyDualWriteResult> {
  return applyOps(client, ops, {
    userId: options.userId,
    clientTs: options.clientTs,
    logger: options.logger ?? DEFAULT_LOGGER,
  });
}

// -----------------------------------------------------------------------
// Table specs — the routine adapter's SET assignments are unaligned
// (`alignSetColumns: false`), unlike nutrition/fizruk. ON CONFLICT / SET /
// WHERE are indented at 9 / 11 spaces respectively.
// -----------------------------------------------------------------------

const ENTRY_UPSERT_SPEC: TableSpec = {
  table: "routine_entries",
  insertClause: `INSERT INTO routine_entries
           (id, user_id, name, completed_at, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "name" },
    { column: "completed_at" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 9,
  setIndent: 11,
  alignSetColumns: false,
};

const HABIT_UPSERT_SPEC: TableSpec = {
  table: "routine_habits",
  insertClause: `INSERT INTO routine_habits
           (id, user_id, name, emoji, tag_ids_json, category_id,
            archived, paused, recurrence, start_date, end_date,
            time_of_day, reminder_times_json, weekdays_json,
            created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "name" },
    { column: "emoji" },
    { column: "tag_ids_json" },
    { column: "category_id" },
    { column: "archived" },
    { column: "paused" },
    { column: "recurrence" },
    { column: "start_date" },
    { column: "end_date" },
    { column: "time_of_day" },
    { column: "reminder_times_json" },
    { column: "weekdays_json" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 9,
  setIndent: 11,
  alignSetColumns: false,
};

const TAG_UPSERT_SPEC: TableSpec = {
  table: "routine_tags",
  insertClause: `INSERT INTO routine_tags
           (id, user_id, name, scope, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "name" },
    { column: "scope" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 9,
  setIndent: 11,
  alignSetColumns: false,
};

const CATEGORY_UPSERT_SPEC: TableSpec = {
  table: "routine_categories",
  insertClause: `INSERT INTO routine_categories
           (id, user_id, name, emoji, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "name" },
    { column: "emoji" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 9,
  setIndent: 11,
  alignSetColumns: false,
};

const PREFS_UPSERT_SPEC: TableSpec = {
  table: "routine_prefs",
  insertClause: `INSERT INTO routine_prefs (user_id, data_json, updated_at)
         VALUES (?, ?, ?)`,
  conflictTarget: ["user_id"],
  updateColumns: [{ column: "data_json" }, { column: "updated_at" }],
  upsertGuard: "strictly-newer",
  conflictIndent: 9,
  setIndent: 11,
  alignSetColumns: false,
};

const PUSHUP_UPSERT_SPEC: TableSpec = {
  table: "routine_pushups",
  insertClause: `INSERT INTO routine_pushups (user_id, date_key, reps, updated_at)
         VALUES (?, ?, ?, ?)`,
  conflictTarget: ["user_id", "date_key"],
  updateColumns: [{ column: "reps" }, { column: "updated_at" }],
  upsertGuard: "strictly-newer",
  conflictIndent: 9,
  setIndent: 11,
  alignSetColumns: false,
};

const HABIT_ORDER_UPSERT_SPEC: TableSpec = {
  table: "routine_habit_order",
  insertClause: `INSERT INTO routine_habit_order (user_id, order_json, updated_at)
         VALUES (?, ?, ?)`,
  conflictTarget: ["user_id"],
  updateColumns: [{ column: "order_json" }, { column: "updated_at" }],
  upsertGuard: "strictly-newer",
  conflictIndent: 9,
  setIndent: 11,
  alignSetColumns: false,
};

const COMPLETION_NOTE_UPSERT_SPEC: TableSpec = {
  table: "routine_completion_notes",
  insertClause: `INSERT INTO routine_completion_notes
           (user_id, note_key, note, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, NULL)`,
  conflictTarget: ["user_id", "note_key"],
  updateColumns: [
    { column: "note" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 9,
  setIndent: 11,
  alignSetColumns: false,
};

const ENTRY_UPSERT_SQL = buildLwwUpsert(ENTRY_UPSERT_SPEC);
const HABIT_UPSERT_SQL = buildLwwUpsert(HABIT_UPSERT_SPEC);
const TAG_UPSERT_SQL = buildLwwUpsert(TAG_UPSERT_SPEC);
const CATEGORY_UPSERT_SQL = buildLwwUpsert(CATEGORY_UPSERT_SPEC);
const PREFS_UPSERT_SQL = buildLwwUpsert(PREFS_UPSERT_SPEC);
const PUSHUP_UPSERT_SQL = buildLwwUpsert(PUSHUP_UPSERT_SPEC);
const HABIT_ORDER_UPSERT_SQL = buildLwwUpsert(HABIT_ORDER_UPSERT_SPEC);
const COMPLETION_NOTE_UPSERT_SQL = buildLwwUpsert(COMPLETION_NOTE_UPSERT_SPEC);

// Routine's soft-delete SQL keeps its own layout (SET on its own line, one
// `AND` per line) — the generic `buildDelete` emits a single-line WHERE, so
// this shape is hand-written to stay byte-identical.
const ENTRY_SOFT_DELETE_SQL = `UPDATE routine_entries
            SET deleted_at = ?, updated_at = ?
          WHERE id = ?
            AND user_id = ?
            AND updated_at < ?`;
const HABIT_SOFT_DELETE_SQL = `UPDATE routine_habits
            SET deleted_at = ?, updated_at = ?
          WHERE id = ?
            AND user_id = ?
            AND updated_at < ?`;
const TAG_SOFT_DELETE_SQL = `UPDATE routine_tags
            SET deleted_at = ?, updated_at = ?
          WHERE id = ?
            AND user_id = ?
            AND updated_at < ?`;
const CATEGORY_SOFT_DELETE_SQL = `UPDATE routine_categories
            SET deleted_at = ?, updated_at = ?
          WHERE id = ?
            AND user_id = ?
            AND updated_at < ?`;
const COMPLETION_NOTE_SOFT_DELETE_SQL = `UPDATE routine_completion_notes
            SET deleted_at = ?, updated_at = ?
          WHERE user_id = ?
            AND note_key = ?
            AND updated_at < ?`;

// -----------------------------------------------------------------------
// routine_entries — completions (+ sync-v2 outbox bridge)
// -----------------------------------------------------------------------

async function addCompletion(
  client: SqliteMigrationClient,
  habitId: string,
  dateKey: string,
  habitName: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  const id = buildCompletionRowId(habitId, dateKey);
  await client.run(ENTRY_UPSERT_SQL, [
    id,
    userId,
    habitName,
    clientTs,
    clientTs,
    clientTs,
  ]);
  // Enqueue a sync-v2 outbox op so the server learns about this completion.
  // Fire-and-forget: a sync failure must never break the local write
  // (consistent with the best-effort adapter contract).
  void enqueueOutboxUpsert(client, {
    userId,
    table: "routine_entries",
    op: "insert",
    row: {
      id,
      user_id: userId,
      name: habitName,
      completed_at: clientTs,
      created_at: clientTs,
      deleted_at: null,
    },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {
    /* sync-enqueue failure is intentionally swallowed */
  });
}

async function removeCompletion(
  client: SqliteMigrationClient,
  habitId: string,
  dateKey: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  const id = buildCompletionRowId(habitId, dateKey);
  await client.run(ENTRY_SOFT_DELETE_SQL, [
    clientTs,
    clientTs,
    id,
    userId,
    clientTs,
  ]);
  // Enqueue a soft-delete op so the server mirrors the removal.
  void enqueueOutboxUpsert(client, {
    userId,
    table: "routine_entries",
    op: "delete",
    row: {
      id,
      user_id: userId,
    },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {
    /* sync-enqueue failure is intentionally swallowed */
  });
}

async function renameHabit(
  client: SqliteMigrationClient,
  habitId: string,
  nextName: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  const idPrefix = `${habitId}:%`;
  await client.run(
    `UPDATE routine_entries
            SET name = ?, updated_at = ?
          WHERE user_id = ?
            AND id LIKE ?
            AND deleted_at IS NULL
            AND updated_at < ?`,
    [nextName, clientTs, userId, idPrefix, clientTs],
  );
}

// -----------------------------------------------------------------------
// routine_habits
// -----------------------------------------------------------------------

async function upsertHabit(
  client: SqliteMigrationClient,
  h: Extract<RoutineDualWriteOp, { kind: "habit-upsert" }>["habit"],
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(HABIT_UPSERT_SQL, [
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
  ]);
}

async function softDeleteHabit(
  client: SqliteMigrationClient,
  habitId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(HABIT_SOFT_DELETE_SQL, [
    clientTs,
    clientTs,
    habitId,
    userId,
    clientTs,
  ]);
}

// -----------------------------------------------------------------------
// routine_tags
// -----------------------------------------------------------------------

async function upsertTag(
  client: SqliteMigrationClient,
  t: Extract<RoutineDualWriteOp, { kind: "tag-upsert" }>["tag"],
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(TAG_UPSERT_SQL, [
    t.id,
    userId,
    t.name,
    t.scope ?? "",
    clientTs,
    clientTs,
  ]);
}

async function softDeleteTag(
  client: SqliteMigrationClient,
  tagId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(TAG_SOFT_DELETE_SQL, [
    clientTs,
    clientTs,
    tagId,
    userId,
    clientTs,
  ]);
}

// -----------------------------------------------------------------------
// routine_categories
// -----------------------------------------------------------------------

async function upsertCategory(
  client: SqliteMigrationClient,
  c: Extract<RoutineDualWriteOp, { kind: "category-upsert" }>["category"],
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(CATEGORY_UPSERT_SQL, [
    c.id,
    userId,
    c.name,
    c.emoji ?? "",
    clientTs,
    clientTs,
  ]);
}

async function softDeleteCategory(
  client: SqliteMigrationClient,
  categoryId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(CATEGORY_SOFT_DELETE_SQL, [
    clientTs,
    clientTs,
    categoryId,
    userId,
    clientTs,
  ]);
}

// -----------------------------------------------------------------------
// routine_prefs (single row per user)
// -----------------------------------------------------------------------

async function setPrefs(
  client: SqliteMigrationClient,
  prefs: Extract<RoutineDualWriteOp, { kind: "prefs-set" }>["prefs"],
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(PREFS_UPSERT_SQL, [userId, JSON.stringify(prefs), clientTs]);
}

// -----------------------------------------------------------------------
// routine_pushups (one row per (user, date))
// -----------------------------------------------------------------------

async function upsertPushup(
  client: SqliteMigrationClient,
  dateKey: string,
  reps: number,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(PUSHUP_UPSERT_SQL, [userId, dateKey, reps, clientTs]);
}

// -----------------------------------------------------------------------
// routine_habit_order (single row per user)
// -----------------------------------------------------------------------

async function setHabitOrder(
  client: SqliteMigrationClient,
  orderedIds: readonly string[],
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(HABIT_ORDER_UPSERT_SQL, [
    userId,
    JSON.stringify(orderedIds),
    clientTs,
  ]);
}

// -----------------------------------------------------------------------
// routine_completion_notes
// -----------------------------------------------------------------------

async function upsertCompletionNote(
  client: SqliteMigrationClient,
  noteKey: string,
  note: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(COMPLETION_NOTE_UPSERT_SQL, [
    userId,
    noteKey,
    note,
    clientTs,
  ]);
}

async function deleteCompletionNote(
  client: SqliteMigrationClient,
  noteKey: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(COMPLETION_NOTE_SOFT_DELETE_SQL, [
    clientTs,
    clientTs,
    userId,
    noteKey,
    clientTs,
  ]);
}
