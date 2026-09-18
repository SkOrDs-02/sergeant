-- Stage 12 / PR #070f-schema — extend Fizruk Postgres schema to full
-- LS-state coverage: daily_log, monthly_plan, plan_templates,
-- programs, wellbeing, workout_templates.
--
-- Mirrors the SQLite client-side migration
-- `002_fizruk_full_state.sql` in
-- `packages/db-schema/src/sqlite/migrations/index.ts`.
--
-- All tables are additive — safe to re-run on an existing database.
-- FK to "user"(id) with ON DELETE CASCADE keeps referential integrity
-- (client-side SQLite omits FK because there is no auth schema there).
--
-- Why these six tables specifically: each maps 1-to-1 to an LS-only
-- Fizruk slice that Stage 4 (PR #027) left outside dual-write —
-- `useDailyLog`, `useMonthlyPlan`, `usePlanTemplate`, `usePrograms`
-- (active selection), `useWellbeing`, `useWorkoutTemplates`. The
-- seventh hook — `useActiveFizrukWorkout` — is a single string slot
-- and rides on the existing Stage 9 `kv_store` table without needing
-- its own Fizruk-module table.

CREATE TABLE IF NOT EXISTS fizruk_daily_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  entry_at      TIMESTAMPTZ NOT NULL,
  weight_kg     REAL,
  sleep_hours   REAL,
  energy_level  INTEGER,
  mood          INTEGER,
  note          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS fizruk_daily_log_user_entry_idx
  ON fizruk_daily_log (user_id, entry_at DESC);

CREATE INDEX IF NOT EXISTS fizruk_daily_log_user_active_idx
  ON fizruk_daily_log (user_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS fizruk_monthly_plan (
  user_id     TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fizruk_plan_templates (
  user_id     TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  data        JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fizruk_programs (
  user_id            TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  active_program_id  TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fizruk_wellbeing (
  user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  date_key       TEXT NOT NULL,
  mood           INTEGER,
  energy         INTEGER,
  sleep_quality  INTEGER,
  sleep_hours    REAL,
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  PRIMARY KEY (user_id, date_key)
);

CREATE INDEX IF NOT EXISTS fizruk_wellbeing_user_active_idx
  ON fizruk_wellbeing (user_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS fizruk_workout_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  exercise_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
  groups        JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS fizruk_workout_templates_user_idx
  ON fizruk_workout_templates (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
