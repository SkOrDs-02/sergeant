/**
 * Pre-built SQL constants for the routine dual-write adapter.
 *
 * Extracted from `adapter.ts` to keep that file under the 600-line
 * module-size hard rule (Hard Rule #18). All exports are consumed only
 * by `adapter.ts` — not part of the public module surface.
 *
 * The routine adapter's SET assignments are unaligned
 * (`alignSetColumns: false`), unlike nutrition/fizruk. ON CONFLICT / SET /
 * WHERE are indented at 9 / 11 spaces respectively — preserved here
 * byte-for-byte so the SQL snapshot gate stays green.
 */

import { buildLwwUpsert, type TableSpec } from "@sergeant/dualwrite-core";

// -----------------------------------------------------------------------
// Table specs
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

// -----------------------------------------------------------------------
// Pre-built SQL strings
// -----------------------------------------------------------------------

export const ENTRY_UPSERT_SQL = buildLwwUpsert(ENTRY_UPSERT_SPEC);
export const HABIT_UPSERT_SQL = buildLwwUpsert(HABIT_UPSERT_SPEC);
export const TAG_UPSERT_SQL = buildLwwUpsert(TAG_UPSERT_SPEC);
export const CATEGORY_UPSERT_SQL = buildLwwUpsert(CATEGORY_UPSERT_SPEC);
export const PREFS_UPSERT_SQL = buildLwwUpsert(PREFS_UPSERT_SPEC);
export const PUSHUP_UPSERT_SQL = buildLwwUpsert(PUSHUP_UPSERT_SPEC);
export const HABIT_ORDER_UPSERT_SQL = buildLwwUpsert(HABIT_ORDER_UPSERT_SPEC);
export const COMPLETION_NOTE_UPSERT_SQL = buildLwwUpsert(
  COMPLETION_NOTE_UPSERT_SPEC,
);

// Routine's soft-delete SQL keeps its own layout (SET on its own line, one
// `AND` per line) — the generic `buildDelete` emits a single-line WHERE, so
// this shape is hand-written to stay byte-identical to the snapshot.
export const ENTRY_SOFT_DELETE_SQL = `UPDATE routine_entries
            SET deleted_at = ?, updated_at = ?
          WHERE id = ?
            AND user_id = ?
            AND updated_at < ?`;
export const HABIT_SOFT_DELETE_SQL = `UPDATE routine_habits
            SET deleted_at = ?, updated_at = ?
          WHERE id = ?
            AND user_id = ?
            AND updated_at < ?`;
export const TAG_SOFT_DELETE_SQL = `UPDATE routine_tags
            SET deleted_at = ?, updated_at = ?
          WHERE id = ?
            AND user_id = ?
            AND updated_at < ?`;
export const CATEGORY_SOFT_DELETE_SQL = `UPDATE routine_categories
            SET deleted_at = ?, updated_at = ?
          WHERE id = ?
            AND user_id = ?
            AND updated_at < ?`;
export const COMPLETION_NOTE_SOFT_DELETE_SQL = `UPDATE routine_completion_notes
            SET deleted_at = ?, updated_at = ?
          WHERE user_id = ?
            AND note_key = ?
            AND updated_at < ?`;
