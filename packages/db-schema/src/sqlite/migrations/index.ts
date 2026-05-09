/**
 * Bundled SQLite migration files for client consumers.
 *
 * Browser (sqlite-wasm) and React Native (`expo-sqlite`) bundles cannot
 * read `*.sql` files from disk at runtime — they receive the SQL as
 * string constants embedded in the JS bundle. Server-side and CLI
 * consumers have `loadMigrationFiles()` from
 * `@sergeant/db-schema/migrate` for filesystem-driven loading; this
 * module is the parallel surface for client bundles.
 *
 * The bundled migration creates the four client-side tables that back
 * the routine module on SQLite:
 *
 *   - routine_entries — habit-completion rows.
 *   - routine_streaks — per-user aggregate streak metrics.
 *   - sync_op_outbox  — client-only queue of pending /v2/sync/push ops.
 *   - sync_op_cursor  — client-only cursor for /v2/sync/pull.
 *
 * History: the inline migration shipped first as the Stage 3 routine
 * SQLite SPIKE (PR #022 of `docs/planning/storage-roadmap.md`); the
 * `ROUTINE_SPIKE_*` exports stay in place so the SPIKE library under
 * `apps/{web,mobile}/src/modules/routine/lib/sqliteSpike/` does not
 * have to be touched on the Stage 4 promotion. PR #023 introduces the
 * neutral `ROUTINE_CLIENT_MIGRATIONS` / `ROUTINE_MIGRATIONS_TABLE`
 * aliases that production (non-SPIKE) consumers should import.
 *
 * SQL is kept inline (not loaded via `?raw`) so the same module works
 * unchanged across the three bundlers we target — Vite, Metro, and
 * Vitest's Node runner. The DDL mirrors the Postgres counterparts
 * (migration 026 in `apps/server/src/migrations/`).
 *
 * Differences from PG:
 *   - `id` columns are TEXT (no native UUID type in SQLite).
 *   - TIMESTAMPTZ → TEXT (ISO-8601). Defaults emit `datetime('now')`
 *     (UTC, no offset); clients writing through the repo overwrite
 *     these with ISO-8601-with-offset so cross-device LWW comparisons
 *     stay byte-identical to what the server records.
 *   - No FK to `"user"(id)` — there is no auth schema on the client.
 *   - Index names get a `_lite` suffix to make accidental drift between
 *     server and client visible at code-review time.
 *
 * Append-only: never edit `001_*` in place — already-migrated client
 * DBs must not re-apply. Schema changes ship as `002_*`, `003_*`, …
 */

import type { MigrationFile } from "../../migrate/types.js";

const ROUTINE_SPIKE_SQL = `
CREATE TABLE IF NOT EXISTS routine_entries (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at   TEXT
);

CREATE INDEX IF NOT EXISTS routine_entries_user_created_idx_lite
  ON routine_entries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS routine_entries_user_active_idx_lite
  ON routine_entries (user_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS routine_streaks (
  user_id            TEXT PRIMARY KEY,
  current_streak     INTEGER NOT NULL DEFAULT 0,
  longest_streak     INTEGER NOT NULL DEFAULT 0,
  last_completed_at  TEXT
);

CREATE TABLE IF NOT EXISTS sync_op_outbox (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name      TEXT NOT NULL,
  op              TEXT NOT NULL CHECK (op IN ('insert','update','delete')),
  row             TEXT NOT NULL,
  client_ts       TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','rejected')),
  reject_reason   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS sync_op_outbox_idem_uniq_lite
  ON sync_op_outbox (idempotency_key);

CREATE INDEX IF NOT EXISTS sync_op_outbox_pending_idx_lite
  ON sync_op_outbox (id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS sync_op_cursor (
  key        TEXT PRIMARY KEY,
  value_int  INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Stage 5 / PR #040 retry-policy migration for `sync_op_outbox`.
 *
 * The original SPIKE shape (`001_routine_spike.sql`) only knew two
 * statuses (`pending`, `rejected`) and had no per-row retry state.
 * The persistent op-log v2 introduces:
 *
 *   - `attempts` — number of failed push attempts (starts at 0).
 *   - `next_retry_at` — earliest UTC ISO-8601 timestamp at which the
 *     sync engine may pick this op up again. NULL means "ready
 *     immediately" (fresh enqueue, or a transient transport failure
 *     before any backoff was scheduled).
 *   - `last_error` — short, free-form, machine-readable reason from
 *     the last transient failure (e.g. `network`, `http_503`,
 *     `timeout`). Persisted across restarts so the dev panel can show
 *     why a row is sitting in the queue without grepping logs.
 *   - `'dead_letter'` status — a row reaches this terminal status
 *     after `SYNC_OP_MAX_ATTEMPTS` (10) failed attempts. Sync engine
 *     never retries it automatically; human triage routes it back to
 *     `pending` after fixing the cause.
 *
 * SQLite cannot relax a `CHECK` constraint in place (the original
 * migration locked status to `('pending','rejected')`), so we rebuild
 * the table following the standard SQLite "12-step ALTER" recipe:
 *
 *   1. Rename old table out of the way.
 *   2. Create the new shape with the relaxed `CHECK`.
 *   3. Copy rows across, defaulting the new columns.
 *   4. Drop the renamed legacy table.
 *   5. Re-create indexes (old ones dropped with the rename).
 *
 * The whole thing runs inside the per-migration `BEGIN`/`COMMIT` the
 * runner installs — see `applyMigration` in
 * `packages/db-schema/src/migrate/adapters/sqlite.ts`.
 */
const SYNC_OP_OUTBOX_RETRY_SQL = `
ALTER TABLE sync_op_outbox RENAME TO sync_op_outbox_legacy;

CREATE TABLE sync_op_outbox (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name      TEXT NOT NULL,
  op              TEXT NOT NULL CHECK (op IN ('insert','update','delete')),
  row             TEXT NOT NULL,
  client_ts       TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','rejected','dead_letter')),
  reject_reason   TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_retry_at   TEXT,
  last_error      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO sync_op_outbox (
  id, table_name, op, row, client_ts, idempotency_key, status,
  reject_reason, attempts, next_retry_at, last_error, created_at
)
SELECT
  id, table_name, op, row, client_ts, idempotency_key, status,
  reject_reason, 0, NULL, NULL, created_at
FROM sync_op_outbox_legacy;

DROP TABLE sync_op_outbox_legacy;

CREATE UNIQUE INDEX IF NOT EXISTS sync_op_outbox_idem_uniq_lite
  ON sync_op_outbox (idempotency_key);

CREATE INDEX IF NOT EXISTS sync_op_outbox_pending_idx_lite
  ON sync_op_outbox (id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS sync_op_outbox_pending_due_idx_lite
  ON sync_op_outbox (next_retry_at, id)
  WHERE status = 'pending';
`;

/**
 * Stage 5 / PR #042d-prep migration: relax the `sync_op_outbox.op`
 * CHECK constraint so PN-counter `'increment'` rows can sit in the
 * outbox alongside the original three LWW kinds.
 *
 * Server-side, `'increment'` shipped in PR #042a (engine-gate +
 * `OP_LOG_TABLE_REGISTRY` allowlist) and PR #042b (`applyRoutineStreaks`
 * apply-fn). The api-client typed builder
 * (`buildSyncV2IncrementOp`, PR #042c) lives in
 * `packages/api-client/src/endpoints/syncV2.increment.ts` and is the
 * sole supported way of constructing an envelope. Until this migration
 * runs, however, the SPIKE-era CHECK
 * (`op IN ('insert','update','delete')`) silently rejects any
 * `INSERT … op='increment'` against the local outbox — preventing the
 * eventual client-side push-loop refactor from durably enqueueing
 * PN-counter ops.
 *
 * SQLite cannot relax a `CHECK` constraint in place, so we follow the
 * same "12-step ALTER" recipe as `002_sync_op_outbox_retry.sql`
 * (PR #040): rename the existing table out of the way, recreate it
 * with the relaxed `CHECK`, copy every row across (no defaulting —
 * every column is preserved verbatim), drop the renamed legacy table,
 * and recreate the three indexes the runner just lost when the
 * original table went away.
 *
 * Migration runs inside the per-migration BEGIN/COMMIT installed by
 * `applyMigration` in `packages/db-schema/src/migrate/adapters/sqlite.ts`,
 * so a partial failure leaves the SPIKE shape intact.
 */
const SYNC_OP_OUTBOX_INCREMENT_OP_SQL = `
ALTER TABLE sync_op_outbox RENAME TO sync_op_outbox_legacy;

CREATE TABLE sync_op_outbox (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name      TEXT NOT NULL,
  op              TEXT NOT NULL
                  CHECK (op IN ('insert','update','delete','increment')),
  row             TEXT NOT NULL,
  client_ts       TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','rejected','dead_letter')),
  reject_reason   TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_retry_at   TEXT,
  last_error      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO sync_op_outbox (
  id, table_name, op, row, client_ts, idempotency_key, status,
  reject_reason, attempts, next_retry_at, last_error, created_at
)
SELECT
  id, table_name, op, row, client_ts, idempotency_key, status,
  reject_reason, attempts, next_retry_at, last_error, created_at
FROM sync_op_outbox_legacy;

DROP TABLE sync_op_outbox_legacy;

CREATE UNIQUE INDEX IF NOT EXISTS sync_op_outbox_idem_uniq_lite
  ON sync_op_outbox (idempotency_key);

CREATE INDEX IF NOT EXISTS sync_op_outbox_pending_idx_lite
  ON sync_op_outbox (id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS sync_op_outbox_pending_due_idx_lite
  ON sync_op_outbox (next_retry_at, id)
  WHERE status = 'pending';
`;

/**
 * Stage 10 / PR #070r-schema migration: extend Routine SQLite schema
 * to full LS-state coverage.
 *
 * Adds 7 new tables for the remaining `RoutineState` fields that were
 * still LS/MMKV-only:
 *
 *   - `routine_habits`           — Habit[] (per-row, JSON arrays for
 *                                   tagIds / reminderTimes / weekdays)
 *   - `routine_tags`             — Tag[]
 *   - `routine_categories`       — Category[]
 *   - `routine_prefs`            — RoutinePrefs (single row per user,
 *                                   JSON blob)
 *   - `routine_pushups`          — pushupsByDate (composite PK
 *                                   user_id + date_key)
 *   - `routine_habit_order`      — habitOrder (single row per user,
 *                                   JSON array)
 *   - `routine_completion_notes` — completionNotes (composite PK
 *                                   user_id + note_key)
 *
 * This migration is additive (CREATE TABLE IF NOT EXISTS) — safe to
 * replay on an already-migrated client DB. All tables follow the
 * established conventions:
 *   - TEXT for timestamps (ISO-8601 with offset)
 *   - `_lite`-suffixed index names
 *   - `deleted_at` soft-delete where applicable
 *   - `updated_at` for LWW comparison
 */
const ROUTINE_004_FULL_STATE_SQL = `
CREATE TABLE IF NOT EXISTS routine_habits (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  name                TEXT NOT NULL,
  emoji               TEXT NOT NULL DEFAULT '',
  tag_ids_json        TEXT NOT NULL DEFAULT '[]',
  category_id         TEXT,
  archived            INTEGER NOT NULL DEFAULT 0,
  paused              INTEGER NOT NULL DEFAULT 0,
  recurrence          TEXT NOT NULL DEFAULT 'daily',
  start_date          TEXT,
  end_date            TEXT,
  time_of_day         TEXT NOT NULL DEFAULT '',
  reminder_times_json TEXT NOT NULL DEFAULT '[]',
  weekdays_json       TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at          TEXT
);

CREATE INDEX IF NOT EXISTS routine_habits_user_active_idx_lite
  ON routine_habits (user_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS routine_tags (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  scope       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS routine_tags_user_active_idx_lite
  ON routine_tags (user_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS routine_categories (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS routine_categories_user_active_idx_lite
  ON routine_categories (user_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS routine_prefs (
  user_id     TEXT PRIMARY KEY,
  data_json   TEXT NOT NULL DEFAULT '{}',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS routine_pushups (
  user_id     TEXT NOT NULL,
  date_key    TEXT NOT NULL,
  reps        INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, date_key)
);

CREATE TABLE IF NOT EXISTS routine_habit_order (
  user_id     TEXT PRIMARY KEY,
  order_json  TEXT NOT NULL DEFAULT '[]',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS routine_completion_notes (
  user_id     TEXT NOT NULL,
  note_key    TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT,
  PRIMARY KEY (user_id, note_key)
);

CREATE INDEX IF NOT EXISTS routine_completion_notes_user_active_idx_lite
  ON routine_completion_notes (user_id)
  WHERE deleted_at IS NULL;
`;

/**
 * Ordered list of bundled client migrations for the routine module on
 * SQLite. Pass this directly to `runMigrations` from
 * `@sergeant/db-schema/migrate`.
 *
 * The migration name `001_routine_spike.sql` is preserved verbatim so
 * client DBs that ran the migration under the SPIKE name don't see a
 * different ledger entry on the Stage 4 cut-over and re-apply the DDL.
 * `002_sync_op_outbox_retry.sql` adds the Stage 5 / PR #040 retry
 * columns and the `'dead_letter'` status onto the same `__migrations`
 * ledger; `003_sync_op_outbox_increment_op.sql` extends the `op`
 * CHECK constraint with `'increment'` for PN-counter outbox writes
 * (PR #042d-prep). `004_routine_full_state.sql` extends the routine
 * schema to full LS-state coverage (Stage 10 / PR #070r-schema).
 */
export const ROUTINE_CLIENT_MIGRATIONS: readonly MigrationFile[] = [
  { name: "001_routine_spike.sql", sql: ROUTINE_SPIKE_SQL },
  { name: "002_sync_op_outbox_retry.sql", sql: SYNC_OP_OUTBOX_RETRY_SQL },
  {
    name: "003_sync_op_outbox_increment_op.sql",
    sql: SYNC_OP_OUTBOX_INCREMENT_OP_SQL,
  },
  { name: "004_routine_full_state.sql", sql: ROUTINE_004_FULL_STATE_SQL },
] as const;

/**
 * Stable ledger table name used by the routine SQLite module. Matches
 * the runner default but spelled out so consumers can write
 * self-documenting `runMigrations` calls without reaching into
 * `@sergeant/db-schema/migrate` for the default constant.
 */
export const ROUTINE_MIGRATIONS_TABLE = "__migrations";

/**
 * @deprecated Stage-3 SPIKE alias for {@link ROUTINE_CLIENT_MIGRATIONS}.
 * Kept so the SPIKE library at
 * `apps/{web,mobile}/src/modules/routine/lib/sqliteSpike/` can carry
 * on importing the original symbol; new consumers should import
 * `ROUTINE_CLIENT_MIGRATIONS` directly.
 */
export const ROUTINE_SPIKE_CLIENT_MIGRATIONS = ROUTINE_CLIENT_MIGRATIONS;

/**
 * @deprecated Stage-3 SPIKE alias for {@link ROUTINE_MIGRATIONS_TABLE}.
 * Kept for the same reason as {@link ROUTINE_SPIKE_CLIENT_MIGRATIONS}.
 */
export const ROUTINE_SPIKE_MIGRATIONS_TABLE = ROUTINE_MIGRATIONS_TABLE;

// ---------------------------------------------------------------------------
// Fizruk module — Stage 4 / PR #027
// ---------------------------------------------------------------------------

const FIZRUK_001_SQL = `
CREATE TABLE IF NOT EXISTS fizruk_workouts (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  ended_at        TEXT,
  note            TEXT NOT NULL DEFAULT '',
  groups_json     TEXT NOT NULL DEFAULT '[]',
  warmup_json     TEXT,
  cooldown_json   TEXT,
  wellbeing_json  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS fizruk_workouts_user_started_idx_lite
  ON fizruk_workouts (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS fizruk_workouts_user_active_idx_lite
  ON fizruk_workouts (user_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS fizruk_workout_items (
  id                 TEXT PRIMARY KEY,
  workout_id         TEXT NOT NULL,
  user_id            TEXT NOT NULL,
  exercise_id        TEXT NOT NULL,
  name_uk            TEXT NOT NULL,
  primary_group      TEXT NOT NULL DEFAULT '',
  muscles_primary    TEXT NOT NULL DEFAULT '[]',
  muscles_secondary  TEXT NOT NULL DEFAULT '[]',
  type               TEXT NOT NULL DEFAULT 'strength',
  duration_sec       INTEGER,
  distance_m         INTEGER,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at         TEXT
);

CREATE INDEX IF NOT EXISTS fizruk_workout_items_workout_idx_lite
  ON fizruk_workout_items (workout_id, sort_order);

CREATE INDEX IF NOT EXISTS fizruk_workout_items_user_idx_lite
  ON fizruk_workout_items (user_id);

CREATE TABLE IF NOT EXISTS fizruk_workout_sets (
  id               TEXT PRIMARY KEY,
  workout_item_id  TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  weight_kg        INTEGER NOT NULL DEFAULT 0,
  reps             INTEGER NOT NULL DEFAULT 0,
  rpe              INTEGER,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at       TEXT
);

CREATE INDEX IF NOT EXISTS fizruk_workout_sets_item_idx_lite
  ON fizruk_workout_sets (workout_item_id, sort_order);

CREATE TABLE IF NOT EXISTS fizruk_custom_exercises (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  data_json   TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS fizruk_custom_exercises_user_idx_lite
  ON fizruk_custom_exercises (user_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS fizruk_measurements (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  measured_at   TEXT NOT NULL,
  weight_kg     INTEGER,
  waist_cm      INTEGER,
  chest_cm      INTEGER,
  hips_cm       INTEGER,
  bicep_cm      INTEGER,
  sleep_hours   INTEGER,
  energy_level  INTEGER,
  mood          INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT
);

CREATE INDEX IF NOT EXISTS fizruk_measurements_user_date_idx_lite
  ON fizruk_measurements (user_id, measured_at DESC);
`;

/**
 * Ordered list of bundled client migrations for the Fizruk module on
 * SQLite. Pass this directly to `runMigrations` from
 * `@sergeant/db-schema/migrate`.
 *
 * The Fizruk module uses a separate ledger table (`__fizruk_migrations`)
 * so that routine and fizruk migrations are independent — each module
 * can be migrated, rolled out, and rolled back without affecting the
 * other.
 */
export const FIZRUK_CLIENT_MIGRATIONS: readonly MigrationFile[] = [
  { name: "001_fizruk_tables.sql", sql: FIZRUK_001_SQL },
] as const;

/**
 * Stable ledger table name used by the Fizruk SQLite module. Separate
 * from routine's `__migrations` so the two modules' migration histories
 * don't collide.
 */
export const FIZRUK_MIGRATIONS_TABLE = "__fizruk_migrations";

// ---------------------------------------------------------------------------
// Nutrition module — Stage 4 / PR #031
// ---------------------------------------------------------------------------

const NUTRITION_001_SQL = `
CREATE TABLE IF NOT EXISTS nutrition_meals (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  eaten_at        TEXT NOT NULL,
  meal_type       TEXT NOT NULL DEFAULT 'snack',
  name            TEXT NOT NULL DEFAULT '',
  label           TEXT NOT NULL DEFAULT '',
  kcal            INTEGER,
  protein_g       REAL,
  fat_g           REAL,
  carbs_g         REAL,
  source          TEXT NOT NULL DEFAULT 'manual',
  macro_source    TEXT NOT NULL DEFAULT 'manual',
  amount_g        REAL,
  food_id         TEXT,
  is_demo         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS nutrition_meals_user_eaten_idx_lite
  ON nutrition_meals (user_id, eaten_at DESC);

CREATE INDEX IF NOT EXISTS nutrition_meals_user_active_idx_lite
  ON nutrition_meals (user_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS nutrition_pantries (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  text            TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS nutrition_pantries_user_active_idx_lite
  ON nutrition_pantries (user_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS nutrition_pantry_items (
  id              TEXT PRIMARY KEY,
  pantry_id       TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  qty             REAL,
  unit            TEXT,
  notes           TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS nutrition_pantry_items_pantry_idx_lite
  ON nutrition_pantry_items (pantry_id, sort_order);

CREATE INDEX IF NOT EXISTS nutrition_pantry_items_user_active_idx_lite
  ON nutrition_pantry_items (user_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS nutrition_prefs (
  user_id           TEXT PRIMARY KEY,
  prefs_json        TEXT NOT NULL DEFAULT '{}',
  active_pantry_id  TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS nutrition_recipes (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  data_json       TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS nutrition_recipes_user_active_idx_lite
  ON nutrition_recipes (user_id, deleted_at)
  WHERE deleted_at IS NULL;
`;

/**
 * Stage 11 / PR #070n-schema — extend Nutrition SQLite schema to full
 * LS-state coverage (water_log, shopping_list).
 *
 * Mirrors the Postgres migration `051_nutrition_full_state.sql`.
 * Append-only — `001_nutrition_tables.sql` shipped first; this file
 * is `002_*` so already-migrated client DBs only apply the delta.
 *
 * Why these two tables specifically:
 *   - water_log та shopping_list — це ті дві LS-only сутності, які
 *     Stage 4 (PR #031) лишив поза dual-write. Web `#057n-tombstone`
 *     (PR #2274) їх теж не зачепив. Stage 11 закриває цей schema gap.
 */
const NUTRITION_002_FULL_STATE_SQL = `
CREATE TABLE IF NOT EXISTS nutrition_water_log (
  user_id     TEXT NOT NULL,
  date_key    TEXT NOT NULL,
  volume_ml   INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, date_key)
);

CREATE TABLE IF NOT EXISTS nutrition_shopping_list (
  user_id     TEXT PRIMARY KEY,
  data_json   TEXT NOT NULL DEFAULT '{"categories":[]}',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Ordered list of bundled client migrations for the Nutrition module on
 * SQLite. Pass this directly to `runMigrations` from
 * `@sergeant/db-schema/migrate`.
 *
 * The Nutrition module uses a separate ledger table
 * (`__nutrition_migrations`) so that routine, fizruk, and nutrition
 * migrations are independent — each module can be migrated, rolled
 * out, and rolled back without affecting the others. Same rationale
 * as fizruk's split from routine in PR #027.
 *
 * `002_nutrition_full_state.sql` extends the schema to full LS-state
 * coverage (Stage 11 / PR #070n-schema).
 */
export const NUTRITION_CLIENT_MIGRATIONS: readonly MigrationFile[] = [
  { name: "001_nutrition_tables.sql", sql: NUTRITION_001_SQL },
  {
    name: "002_nutrition_full_state.sql",
    sql: NUTRITION_002_FULL_STATE_SQL,
  },
] as const;

/**
 * Stable ledger table name used by the Nutrition SQLite module.
 * Separate from `__migrations` (routine) and `__fizruk_migrations`
 * (fizruk) so the three modules' migration histories don't collide.
 */
export const NUTRITION_MIGRATIONS_TABLE = "__nutrition_migrations";

// ---------------------------------------------------------------------------
// Finyk module — Stage 4 / PR #035
// ---------------------------------------------------------------------------

const FINYK_001_SQL = `
CREATE TABLE IF NOT EXISTS finyk_hidden_accounts (
  user_id     TEXT NOT NULL,
  account_id  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT,
  PRIMARY KEY (user_id, account_id)
);

CREATE INDEX IF NOT EXISTS finyk_hidden_accounts_user_active_idx_lite
  ON finyk_hidden_accounts (user_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS finyk_hidden_transactions (
  user_id        TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at     TEXT,
  PRIMARY KEY (user_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS finyk_hidden_transactions_user_active_idx_lite
  ON finyk_hidden_transactions (user_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS finyk_budgets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  data_json   TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS finyk_budgets_user_active_idx_lite
  ON finyk_budgets (user_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS finyk_subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  data_json   TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS finyk_subscriptions_user_active_idx_lite
  ON finyk_subscriptions (user_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS finyk_assets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  data_json   TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS finyk_assets_user_active_idx_lite
  ON finyk_assets (user_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS finyk_debts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  data_json   TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS finyk_debts_user_active_idx_lite
  ON finyk_debts (user_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS finyk_receivables (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  data_json   TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS finyk_receivables_user_active_idx_lite
  ON finyk_receivables (user_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS finyk_tx_categories (
  user_id        TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  category_id    TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS finyk_tx_categories_user_idx_lite
  ON finyk_tx_categories (user_id);

CREATE TABLE IF NOT EXISTS finyk_tx_splits (
  user_id        TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  splits_json    TEXT NOT NULL DEFAULT '[]',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS finyk_tx_splits_user_idx_lite
  ON finyk_tx_splits (user_id);

CREATE TABLE IF NOT EXISTS finyk_mono_debt_links (
  user_id        TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  debt_ids_json  TEXT NOT NULL DEFAULT '[]',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS finyk_mono_debt_links_user_idx_lite
  ON finyk_mono_debt_links (user_id);

CREATE TABLE IF NOT EXISTS finyk_networth_history (
  user_id        TEXT NOT NULL,
  month          TEXT NOT NULL,
  networth       REAL NOT NULL DEFAULT 0,
  snapshot_json  TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, month)
);

CREATE INDEX IF NOT EXISTS finyk_networth_history_user_month_idx_lite
  ON finyk_networth_history (user_id, month DESC);

CREATE TABLE IF NOT EXISTS finyk_custom_categories (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  data_json   TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS finyk_custom_categories_user_active_idx_lite
  ON finyk_custom_categories (user_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS finyk_manual_expenses (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  data_json   TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS finyk_manual_expenses_user_active_idx_lite
  ON finyk_manual_expenses (user_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS finyk_tx_filters (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  data_json   TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS finyk_tx_filters_user_active_idx_lite
  ON finyk_tx_filters (user_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS finyk_prefs (
  user_id            TEXT PRIMARY KEY,
  prefs_json         TEXT NOT NULL DEFAULT '{}',
  monthly_plan_json  TEXT NOT NULL DEFAULT '{}',
  show_balance       INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// ---------------------------------------------------------------------------
// Finyk module — Stage 4 / PR #038 — Mono cache mirror
//
// Adds three client-only tables that mirror the Mono cache LS keys
// (`finyk_tx_cache`, `finyk_info_cache`, `finyk_tx_cache_last_good`)
// into per-row SQLite. Mono is the external source-of-truth — rows
// are upserted by `(user_id, tx_id)` with LWW against Mono's own
// `time` field. No Postgres counterpart: server-side Mono integration
// already lives in `apps/server/src/modules/finyk/` with its own
// row-level schema, so we don't push these client mirrors back
// through op-log. See `packages/db-schema/src/sqlite/finyk.ts`.
// ---------------------------------------------------------------------------

const FINYK_002_SQL = `
CREATE TABLE IF NOT EXISTS finyk_mono_transactions (
  user_id      TEXT NOT NULL,
  tx_id        TEXT NOT NULL,
  account_id   TEXT NOT NULL,
  mono_time    INTEGER NOT NULL,
  data_json    TEXT NOT NULL DEFAULT '{}',
  imported_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, tx_id)
);

CREATE INDEX IF NOT EXISTS finyk_mono_transactions_user_time_idx_lite
  ON finyk_mono_transactions (user_id, mono_time DESC);

CREATE INDEX IF NOT EXISTS finyk_mono_transactions_user_account_idx_lite
  ON finyk_mono_transactions (user_id, account_id, mono_time DESC);

CREATE TABLE IF NOT EXISTS finyk_mono_accounts (
  user_id      TEXT NOT NULL,
  account_id   TEXT NOT NULL,
  data_json    TEXT NOT NULL DEFAULT '{}',
  imported_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, account_id)
);

CREATE INDEX IF NOT EXISTS finyk_mono_accounts_user_idx_lite
  ON finyk_mono_accounts (user_id);

CREATE TABLE IF NOT EXISTS finyk_mono_account_snapshots (
  user_id       TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  snapshot_at   TEXT NOT NULL,
  balance       INTEGER NOT NULL DEFAULT 0,
  credit_limit  INTEGER,
  data_json     TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, account_id, snapshot_at)
);

CREATE INDEX IF NOT EXISTS finyk_mono_account_snapshots_account_time_idx_lite
  ON finyk_mono_account_snapshots (user_id, account_id, snapshot_at DESC);
`;

/**
 * Ordered list of bundled client migrations for the Finyk module on
 * SQLite. Pass this directly to `runMigrations` from
 * `@sergeant/db-schema/migrate`.
 *
 * The Finyk module uses a separate ledger table
 * (`__finyk_migrations`) so that routine, fizruk, nutrition, and
 * finyk migrations are independent — each module can be migrated,
 * rolled out, and rolled back without affecting the others. Same
 * rationale as nutrition's split from fizruk in PR #031.
 */
export const FINYK_CLIENT_MIGRATIONS: readonly MigrationFile[] = [
  { name: "001_finyk_tables.sql", sql: FINYK_001_SQL },
  { name: "002_finyk_mono_mirror.sql", sql: FINYK_002_SQL },
] as const;

/**
 * Stable ledger table name used by the Finyk SQLite module.
 * Separate from `__migrations` (routine), `__fizruk_migrations`
 * (fizruk), and `__nutrition_migrations` (nutrition) so all four
 * modules' migration histories stay independent.
 */
export const FINYK_MIGRATIONS_TABLE = "__finyk_migrations";

// ---------------------------------------------------------------------------
// KV store — Stage 9 / PR #060
//
// Per-device key-value table that backs the SQLite swap of the
// LocalStorage-backed `webKVStore` primitive (and its MMKV mobile
// counterpart). Schema-only at this PR — `createSqliteKVStore` +
// warm-cache (PR #061), bootstrap + LS→kv_store one-time migration
// (PR #062), and the `webKVStore` impl swap (PR #063) follow in
// later PRs of `docs/planning/storage-roadmap.md` Stage 9.
//
// Differences from the routine/fizruk/nutrition/finyk pattern:
//   - `updated_at` is INTEGER (Unix epoch ms) rather than TEXT ISO-8601.
//     Warm-cache eviction heuristics need a sortable numeric timestamp,
//     and LWW comparisons happen entirely client-local — there is no
//     server apply-path that needs offset-aware ISO-8601 byte alignment.
//   - No `_lite`-suffixed indexes. The table is not mirrored
//     server-side (no Postgres counterpart) and the warm-cache hits
//     only the PRIMARY KEY on `key`, so additional indexes would be
//     dead weight.
// ---------------------------------------------------------------------------

const KV_STORE_001_SQL = `
CREATE TABLE IF NOT EXISTS kv_store (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (CAST((unixepoch() * 1000) AS INTEGER))
);
`;

/**
 * Ordered list of bundled client migrations for the per-device
 * `kv_store` table. Pass this directly to `runMigrations` from
 * `@sergeant/db-schema/migrate`.
 *
 * The `kv_store` module uses its own ledger table
 * (`__kv_store_migrations`) so the warm-cache bootstrap (PR #061+)
 * can run independently of the routine / fizruk / nutrition / finyk
 * module migrations — each module's history stays independent so
 * canary rollouts and rollbacks don't interlock.
 */
export const KV_STORE_CLIENT_MIGRATIONS: readonly MigrationFile[] = [
  { name: "001_kv_store.sql", sql: KV_STORE_001_SQL },
] as const;

/**
 * Stable ledger table name used by the `kv_store` SQLite module.
 * Separate from `__migrations` (routine), `__fizruk_migrations`
 * (fizruk), `__nutrition_migrations` (nutrition), and
 * `__finyk_migrations` (finyk) so all five modules' migration
 * histories stay independent.
 */
export const KV_STORE_MIGRATIONS_TABLE = "__kv_store_migrations";
