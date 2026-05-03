-- 031: nutrition_meals + nutrition_pantries + nutrition_pantry_items +
-- nutrition_prefs + nutrition_recipes — normalized target shape for the
-- Nutrition module (Stage 4 / PR #031 of `docs/planning/storage-roadmap.md`).
--
-- Context. Until now the Nutrition state lived as a JSON blob inside
-- `module_data` with `module='nutrition'`: meal log, pantries, dietary
-- preferences, saved recipe book — everything together. Whole-blob LWW
-- push/pull has the same scalability issues that routine (PRs #023–#026)
-- and fizruk (PRs #027–#030) already shed:
--
--   * no per-row sync (multi-device collisions on a single blob overwrite
--     the opponent's fresh edits),
--   * becomes a bottleneck when the meal log accumulates (push/pull drags
--     the entire blob — tens of KB per sync once a few weeks of meals
--     pile up),
--   * no relational invariants (FK on user, soft-delete tombstone, per-user
--     active index) needed for cheap point-lookups and audit.
--
-- This migration adds **tables only**. The server does not read from them
-- yet — they are write-only through the v2 sync apply path
-- (`OP_LOG_TABLE_REGISTRY` in `syncV2.ts`). Stage 4 dual-write (PR #032)
-- will start writing from both sides, then PR #033 will cut over reads
-- to SQLite on the client and add the server-side apply functions, and
-- finally PR #034 drops `module_data.nutrition`.
--
-- Mirrors the structure of migration 029_fizruk_tables.sql (PR #027 of
-- the same roadmap) — same FK / soft-delete / per-user-active-index
-- pattern, same `_lite`-suffixed indexes on the SQLite parallel schema.
--
-- Forward-only: `pnpm db:migrate` does not add DROPs here, so rule #4
-- (two-phase DROP) does not apply. `.down.sql` is for local rollback only.

-- nutrition_meals — one row per logged meal/eating event. The existing
-- `NUTRITION_LOG` blob (`Record<isoDate, { meals: Meal[] }>`) collapses
-- to flat rows here: `eaten_at` combines the parent `dateKey` with the
-- meal's `time` field into a TIMESTAMPTZ. Macros are split into
-- columns (kcal INTEGER, protein/fat/carbs REAL) so cheap aggregates
-- (`SUM(kcal) GROUP BY DATE(eaten_at)`) don't have to JSON-decode.
-- Denormalized `food_id` (TEXT, not FK) preserved so historical meals
-- still resolve their food source even if the food entry is deleted.
CREATE TABLE IF NOT EXISTS nutrition_meals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  eaten_at        TIMESTAMPTZ NOT NULL,
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
  is_demo         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS nutrition_meals_user_eaten_idx
  ON nutrition_meals (user_id, eaten_at DESC);

CREATE INDEX IF NOT EXISTS nutrition_meals_user_active_idx
  ON nutrition_meals (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- nutrition_pantries — per-user pantry definitions (e.g. "Дім", "Робота").
-- The freeform `text` column preserves the user-typed pantry contents
-- (the parser-input that `pantryTextParser` chews into `PantryItem[]`).
-- Active-pantry selection lives on `nutrition_prefs.active_pantry_id`
-- to mirror the LS layout where `NUTRITION_ACTIVE_PANTRY` is a separate
-- key from `NUTRITION_PANTRIES`.
CREATE TABLE IF NOT EXISTS nutrition_pantries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT '',
  text            TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS nutrition_pantries_user_active_idx
  ON nutrition_pantries (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- nutrition_pantry_items — items within a pantry. The existing
-- `PantryItem` shape (`{ name, qty, unit, notes }`) is exposed as
-- columns; `qty` is REAL because the parser accepts decimal quantities
-- ("0.5 kg"). `sort_order` is added so the UI can preserve display
-- order (LS-side `Pantry.items` is a positional array).
CREATE TABLE IF NOT EXISTS nutrition_pantry_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pantry_id       UUID NOT NULL REFERENCES nutrition_pantries(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT '',
  qty             REAL,
  unit            TEXT,
  notes           TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS nutrition_pantry_items_pantry_idx
  ON nutrition_pantry_items (pantry_id, sort_order);

CREATE INDEX IF NOT EXISTS nutrition_pantry_items_user_active_idx
  ON nutrition_pantry_items (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- nutrition_prefs — per-user singleton row of dietary preferences
-- (kcal/protein/fat/carbs targets, meal templates, water goal, reminder
-- settings). The full `NutritionPrefs` shape is open-ended (free-form
-- meal templates, future allergy lists) so it stays as a JSONB blob.
-- `active_pantry_id` is hoisted into its own column so multi-device
-- LWW on pantry switching doesn't have to merge the JSONB.
-- `user_id` is the primary key (no separate `id`) — there is exactly
-- one row per user, so the natural key works without a surrogate.
CREATE TABLE IF NOT EXISTS nutrition_prefs (
  user_id           TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  prefs_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  active_pantry_id  UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- nutrition_recipes — user-defined / saved recipes. The existing
-- `SavedRecipe` shape has open-ended ingredient/step/tip arrays and
-- per-recipe macros, so it goes into a JSONB blob (`data_json`) — the
-- whole document is read together when the user opens a recipe and
-- there are no per-field aggregates worth column-splitting.
-- Web currently stores recipes in IndexedDB (`hub_nutrition_recipe_book`);
-- mobile stores them in MMKV under `NUTRITION_SAVED_RECIPES`. PR #032
-- (dual-write) will start mirroring writes from both surfaces; PR #033
-- (cut-over) will read from this table.
CREATE TABLE IF NOT EXISTS nutrition_recipes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT '',
  data_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS nutrition_recipes_user_active_idx
  ON nutrition_recipes (user_id, deleted_at)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE nutrition_meals IS
  'Normalized per-meal rows for the Nutrition module (Stage 4 / PR #031).';
COMMENT ON COLUMN nutrition_meals.eaten_at IS
  'Combined dateKey+time TIMESTAMPTZ. Replaces the LS NutritionLog parent-key shape.';
COMMENT ON COLUMN nutrition_meals.food_id IS
  'Denormalized food source ID. Plain TEXT (no FK) — historical meals stay readable if the food entry is later removed.';
COMMENT ON COLUMN nutrition_meals.is_demo IS
  'Marks FTUX seed meals so cross-module detectors (firstRealEntry) keep working post-promotion.';
COMMENT ON TABLE nutrition_pantries IS
  'Per-user pantry definitions. Active selection lives on nutrition_prefs.active_pantry_id.';
COMMENT ON TABLE nutrition_pantry_items IS
  'Items within a pantry. Mirrors the existing PantryItem shape (name + qty + unit + notes).';
COMMENT ON TABLE nutrition_prefs IS
  'Per-user singleton row of dietary preferences and goals. JSONB blob for the open-ended NutritionPrefs shape.';
COMMENT ON TABLE nutrition_recipes IS
  'Saved recipes. Web stores them in IDB today, mobile in MMKV — this is the consolidation target on SQLite.';
