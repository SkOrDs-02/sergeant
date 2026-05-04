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
 * Ordered list of bundled client migrations for the routine module on
 * SQLite. Pass this directly to `runMigrations` from
 * `@sergeant/db-schema/migrate`.
 *
 * The migration name `001_routine_spike.sql` is preserved verbatim so
 * client DBs that ran the migration under the SPIKE name don't see a
 * different ledger entry on the Stage 4 cut-over and re-apply the DDL.
 * Future Stage-4+ migrations append as `002_*.sql`, `003_*.sql`, … and
 * always show a Stage-4-or-later prefix in the file name.
 */
export const ROUTINE_CLIENT_MIGRATIONS: readonly MigrationFile[] = [
  { name: "001_routine_spike.sql", sql: ROUTINE_SPIKE_SQL },
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
 * Ordered list of bundled client migrations for the Nutrition module on
 * SQLite. Pass this directly to `runMigrations` from
 * `@sergeant/db-schema/migrate`.
 *
 * The Nutrition module uses a separate ledger table
 * (`__nutrition_migrations`) so that routine, fizruk, and nutrition
 * migrations are independent — each module can be migrated, rolled
 * out, and rolled back without affecting the others. Same rationale
 * as fizruk's split from routine in PR #027.
 */
export const NUTRITION_CLIENT_MIGRATIONS: readonly MigrationFile[] = [
  { name: "001_nutrition_tables.sql", sql: NUTRITION_001_SQL },
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
