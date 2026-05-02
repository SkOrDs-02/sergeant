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
 * Stage 3 SPIKE (PR #022 of `docs/planning/storage-roadmap.md`) ships
 * a single migration that creates the four client-side tables backing
 * the routine SQLite proof-of-concept. New SPIKE revisions append a
 * new entry (`002_*`, `003_*`, …) — never edit `001_*` in place so
 * already-migrated client DBs do not have to re-apply.
 *
 * SQL is kept inline (not loaded via `?raw`) so the same module works
 * unchanged across the three bundlers we target — Vite, Metro, and
 * Vitest's Node runner. The DDL mirrors the Postgres counterparts
 * (migrations 026 and 027 in `apps/server/src/migrations/`):
 *
 *   - routine_entries — habit-completion rows.
 *   - routine_streaks — per-user aggregate streak metrics.
 *   - sync_op_outbox  — client-only queue of pending /v2/sync/push ops.
 *   - sync_op_cursor  — client-only cursor for /v2/sync/pull.
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
 * Ordered list of bundled client migrations for the Stage 3 routine
 * SPIKE. Pass this directly to `runMigrations` from
 * `@sergeant/db-schema/migrate`.
 */
export const ROUTINE_SPIKE_CLIENT_MIGRATIONS: readonly MigrationFile[] = [
  { name: "001_routine_spike.sql", sql: ROUTINE_SPIKE_SQL },
] as const;

/**
 * Stable ledger table name used by SPIKE clients. Matches the runner
 * default but spelled out so consumers can write self-documenting
 * `runMigrations` calls without reaching into `@sergeant/db-schema/migrate`
 * for the default constant.
 */
export const ROUTINE_SPIKE_MIGRATIONS_TABLE = "__migrations";
