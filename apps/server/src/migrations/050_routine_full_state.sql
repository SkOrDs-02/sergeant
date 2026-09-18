-- Stage 10 / PR #070r-schema — extend Routine Postgres schema to full
-- LS-state coverage: habits, tags, categories, prefs, pushups,
-- habitOrder, completionNotes.
--
-- Mirrors the SQLite client-side migration
-- `004_routine_full_state.sql` in
-- `packages/db-schema/src/sqlite/migrations/index.ts`.
--
-- All tables are additive — safe to re-run on an existing database.
-- FK to "user"(id) with ON DELETE CASCADE keeps referential integrity
-- (client-side SQLite omits FK because there is no auth schema there).

CREATE TABLE IF NOT EXISTS routine_habits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  emoji           TEXT NOT NULL DEFAULT '',
  tag_ids         JSONB NOT NULL DEFAULT '[]'::jsonb,
  category_id     TEXT,
  archived        BOOLEAN NOT NULL DEFAULT false,
  paused          BOOLEAN NOT NULL DEFAULT false,
  recurrence      TEXT NOT NULL DEFAULT 'daily',
  start_date      TEXT,
  end_date        TEXT,
  time_of_day     TEXT NOT NULL DEFAULT '',
  reminder_times  JSONB NOT NULL DEFAULT '[]'::jsonb,
  weekdays        JSONB NOT NULL DEFAULT '[0,1,2,3,4,5,6]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS routine_habits_user_active_idx
  ON routine_habits (user_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS routine_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  scope       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS routine_tags_user_active_idx
  ON routine_tags (user_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS routine_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS routine_categories_user_active_idx
  ON routine_categories (user_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS routine_prefs (
  user_id     TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS routine_pushups (
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  date_key    TEXT NOT NULL,
  reps        INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date_key)
);

CREATE TABLE IF NOT EXISTS routine_habit_order (
  user_id     TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  "order"     JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS routine_completion_notes (
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  note_key    TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  PRIMARY KEY (user_id, note_key)
);

CREATE INDEX IF NOT EXISTS routine_completion_notes_user_active_idx
  ON routine_completion_notes (user_id)
  WHERE deleted_at IS NULL;
