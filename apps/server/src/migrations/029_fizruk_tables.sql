-- 029: fizruk_workouts + fizruk_workout_items + fizruk_workout_sets +
-- fizruk_custom_exercises + fizruk_measurements — normalized target shape for
-- the Fizruk module (Stage 4 / PR #027 of `docs/planning/storage-roadmap.md`).
--
-- Context. Until now the Fizruk state lived as a JSON blob inside
-- `module_data` with `module='fizruk'`: workouts, sets, custom exercises,
-- measurements, templates — everything together. Whole-blob LWW push/pull
-- has the same scalability issues as routine had before PR #026:
--
--   * no per-row sync (multi-device collisions on a single blob overwrite
--     the opponent's fresh edits),
--   * becomes a bottleneck when workouts accumulate (push/pull drags the
--     entire blob — tens of KB per sync),
--   * no relational invariants (UNIQUE per-user, FK on user, soft-delete)
--     needed for cheap point-lookups and audit.
--
-- This migration adds **tables only**. The server does not read from them
-- yet — they are write-only through the v2 sync apply path
-- (`OP_LOG_TABLE_REGISTRY` in `syncV2.ts`). Stage 4 dual-write (PR #028)
-- will start writing from both sides, then PR #029 will cut over reads
-- to SQLite on the client.
--
-- Forward-only: `pnpm db:migrate` does not add DROPs here, so rule #4
-- (two-phase DROP) does not apply. `.down.sql` is for local rollback only.

-- fizruk_workouts — one row per workout session. Nested data (groups,
-- warmup, cooldown, wellbeing) stored as JSONB — these are display-only
-- metadata that rarely change independently.
CREATE TABLE IF NOT EXISTS fizruk_workouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  started_at   TIMESTAMPTZ NOT NULL,
  ended_at     TIMESTAMPTZ,
  note         TEXT NOT NULL DEFAULT '',
  groups_json  JSONB NOT NULL DEFAULT '[]'::jsonb,
  warmup_json  JSONB,
  cooldown_json JSONB,
  wellbeing_json JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS fizruk_workouts_user_started_idx
  ON fizruk_workouts (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS fizruk_workouts_user_active_idx
  ON fizruk_workouts (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- fizruk_workout_items — one row per exercise entry within a workout.
-- Denormalized exercise metadata (name, muscles) preserved so deleted
-- exercises don't break historical display.
CREATE TABLE IF NOT EXISTS fizruk_workout_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id         UUID NOT NULL REFERENCES fizruk_workouts(id) ON DELETE CASCADE,
  user_id            TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  exercise_id        TEXT NOT NULL,
  name_uk            TEXT NOT NULL,
  primary_group      TEXT NOT NULL DEFAULT '',
  muscles_primary    JSONB NOT NULL DEFAULT '[]'::jsonb,
  muscles_secondary  JSONB NOT NULL DEFAULT '[]'::jsonb,
  type               TEXT NOT NULL DEFAULT 'strength',
  duration_sec       INTEGER,
  distance_m         INTEGER,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS fizruk_workout_items_workout_idx
  ON fizruk_workout_items (workout_id, sort_order);

CREATE INDEX IF NOT EXISTS fizruk_workout_items_user_idx
  ON fizruk_workout_items (user_id);

-- fizruk_workout_sets — one row per set within a workout item.
-- Core trackable: weight x reps with optional RPE.
CREATE TABLE IF NOT EXISTS fizruk_workout_sets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_item_id UUID NOT NULL REFERENCES fizruk_workout_items(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  weight_kg       REAL NOT NULL DEFAULT 0,
  reps            INTEGER NOT NULL DEFAULT 0,
  rpe             REAL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS fizruk_workout_sets_item_idx
  ON fizruk_workout_sets (workout_item_id, sort_order);

-- fizruk_custom_exercises — user-defined exercises. The full exercise
-- definition is stored as JSONB (name, muscles, equipment, aliases)
-- because the shape is open-ended and read as a whole.
CREATE TABLE IF NOT EXISTS fizruk_custom_exercises (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  data_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS fizruk_custom_exercises_user_idx
  ON fizruk_custom_exercises (user_id)
  WHERE deleted_at IS NULL;

-- fizruk_measurements — body measurements (weight, circumferences,
-- wellbeing scores). One row per measurement session. All numeric
-- fields nullable — the user picks which to fill.
CREATE TABLE IF NOT EXISTS fizruk_measurements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  measured_at   TIMESTAMPTZ NOT NULL,
  weight_kg     REAL,
  waist_cm      REAL,
  chest_cm      REAL,
  hips_cm       REAL,
  bicep_cm      REAL,
  sleep_hours   REAL,
  energy_level  INTEGER,
  mood          INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS fizruk_measurements_user_date_idx
  ON fizruk_measurements (user_id, measured_at DESC);

COMMENT ON TABLE fizruk_workouts IS
  'Normalized per-session workout rows for the Fizruk module (Stage 4 / PR #027).';
COMMENT ON TABLE fizruk_workout_items IS
  'Per-exercise entries within a workout. Denormalized metadata preserved for historical display.';
COMMENT ON TABLE fizruk_workout_sets IS
  'Per-set entries within a workout item. Core trackable: weight x reps.';
COMMENT ON TABLE fizruk_custom_exercises IS
  'User-defined custom exercises. Full definition stored as JSONB.';
COMMENT ON TABLE fizruk_measurements IS
  'Body measurements and wellbeing scores. One row per measurement session.';
